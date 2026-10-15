"use server";

/**
 * Server actions for form submissions and button clicks on server-rendered
 * pages.
 *
 * Every action:
 *   1. Resolves the authenticated owner (throws `notFound` for pages when the
 *      dev bypass + Access are both absent).
 *   2. Validates input with Zod — form data is coerced via `extractForm()`.
 *   3. Mutates D1 through the owner-scoped repositories.
 *   4. Writes an activity entry on every meaningful change (lead_created,
 *      stage_changed, draft_approved, contact_logged, reply_logged,
 *      outcome_recorded) so the timeline is append-only.
 *   5. Calls `revalidatePath(…)` on every page that reads the affected rows
 *      so the next render shows the mutation.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, type ZodTypeAny } from "zod";
import { getDb } from "@/lib/db/client";
import { requirePageOwner } from "@/lib/data";
import { runAudit } from "@/lib/audit/engine";
import {
  buildTemplateBrief,
  DEFAULT_WEIGHTS,
  FACTOR_LABELS,
  scoreLead,
  type ScoreFactorCode,
  type WeightMap,
} from "@/lib/scoring/engine";
import { buildAiDraft, buildTemplateDraft } from "@/lib/outreach/draft";
import { runDiscovery } from "@/lib/sources/runner";
import { getAdapter } from "@/lib/sources/registry";
import { getRuntimeEnv } from "@/lib/env";
import { assertWithinRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  archiveLead,
  assignLeadToCampaign,
  createActivity,
  createAudit,
  createBrief,
  createCampaign,
  createDiscoveryJob,
  createDraft,
  createLead,
  createTask,
  findLeadByDomain,
  findLeadByNameAndCity,
  getDraft,
  getLatestAudit,
  getLatestBrief,
  getLead,
  getScoringWeights,
  listCampaigns,
  listServiceOfferings,
  setScoringWeights,
  transitionDraft,
  unassignLeadFromCampaign,
  updateLead,
  updateTask,
} from "@/lib/db/repos";
import { normalizeDomain, normalizeName } from "@/lib/db/normalize";
import type {
  OutreachChannel,
  OutreachStatus,
  PipelineStage,
  TaskPriority,
  TaskType,
} from "@/lib/demo/types";

/* -----------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------- */

/** Coerce a FormData into a plain object, stripping empty strings to undefined. */
function extractForm(data: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of data.entries()) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    out[k] = trimmed === "" ? undefined : trimmed;
  }
  return out;
}

// Accepts any Zod schema (including ones that transform input types). The
// generic infers the OUTPUT type via `z.infer`, so callers get the parsed
// shape (numbers after `.transform(Number)`, etc.) rather than the raw form
// shape.
function parseFormOrThrow<Schema extends ZodTypeAny>(
  data: FormData,
  schema: Schema
): z.infer<Schema> {
  const parsed = schema.safeParse(extractForm(data));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      first
        ? `${first.path.join(".") || "form"}: ${first.message}`
        : "Form submission failed validation."
    );
  }
  return parsed.data;
}

/** Revalidate the main pages that read owner-scoped mutations. */
function revalidateAll(leadId?: string, campaignId?: string): void {
  revalidatePath("/overview");
  revalidatePath("/leads");
  revalidatePath("/tasks");
  revalidatePath("/outreach");
  revalidatePath("/reports");
  revalidatePath("/campaigns");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
}

/* -----------------------------------------------------------------
 * Leads
 * ----------------------------------------------------------------- */

const addLeadSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).optional(),
  niche: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  websiteUrl: z.string().trim().max(2000).optional(),
  publicEmail: z.string().trim().email().max(320).optional(),
  publicPhone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(400).optional(),
  region: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  sourceName: z.string().trim().max(60).optional(),
  sourceUrl: z.string().trim().max(2000).optional(),
  pipelineStage: z
    .enum([
      "new",
      "reviewing",
      "qualified",
      "contacted",
      "replied",
      "meeting_booked",
      "proposal_sent",
      "won",
      "lost",
      "not_a_fit",
    ])
    .optional(),
  tags: z.string().trim().max(400).optional(),
});

export async function createLeadAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, addLeadSchema);

  // Dedup — mirrors /api/leads POST behaviour but shows up as a form-level
  // error on resubmit (caught by `withFormError` wrapper on the page) rather
  // than a 409.
  const normalizedDomainValue = normalizeDomain(input.websiteUrl);
  if (normalizedDomainValue) {
    const dup = await findLeadByDomain(db, owner.id, normalizedDomainValue);
    if (dup) {
      throw new Error(
        `A lead with this website already exists (${dup.businessName}). Open it or archive it before re-adding.`
      );
    }
  }
  const nameMatch = await findLeadByNameAndCity(
    db,
    owner.id,
    normalizeName(input.businessName),
    input.city
  );
  if (nameMatch) {
    throw new Error(
      `A lead named "${input.businessName}" already exists in ${input.city}. Open it or archive it before re-adding.`
    );
  }

  const tags = input.tags
    ? input.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  const lead = await createLead(db, owner.id, {
    businessName: input.businessName,
    category: input.category,
    niche: input.niche,
    city: input.city,
    websiteUrl: input.websiteUrl,
    publicEmail: input.publicEmail,
    publicPhone: input.publicPhone,
    address: input.address,
    region: input.region,
    country: input.country ?? "India",
    sourceName: input.sourceName ?? "manual",
    sourceUrl: input.sourceUrl,
    pipelineStage: input.pipelineStage,
    tags,
  });

  await createActivity(db, owner.id, {
    leadId: lead.id,
    activityType: "lead_created",
    title: `Added ${lead.businessName}`,
    description: `New lead added via ${input.sourceName ?? "manual"} entry.`,
  });

  revalidateAll(lead.id);
  redirect(`/leads/${lead.id}`);
}

const stageChangeSchema = z.object({
  leadId: z.string().min(1),
  pipelineStage: z.enum([
    "new",
    "reviewing",
    "qualified",
    "contacted",
    "replied",
    "meeting_booked",
    "proposal_sent",
    "won",
    "lost",
    "not_a_fit",
  ]),
  lossReason: z.string().trim().max(1000).optional(),
  estimatedDealValue: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform(Number)
    .optional(),
});

export async function changeLeadStageAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, stageChangeSchema);

  const existing = await getLead(db, owner.id, input.leadId);
  if (!existing) throw new Error("Lead not found.");
  const prev = existing.pipelineStage;

  const updated = await updateLead(db, owner.id, input.leadId, {
    pipelineStage: input.pipelineStage,
    lossReason: input.lossReason,
    estimatedDealValue: input.estimatedDealValue,
  });
  if (!updated) throw new Error("Lead not found.");

  if (prev !== input.pipelineStage) {
    const terminal =
      input.pipelineStage === "won" ||
      input.pipelineStage === "lost" ||
      input.pipelineStage === "not_a_fit";
    await createActivity(db, owner.id, {
      leadId: input.leadId,
      activityType: terminal ? "outcome_recorded" : "stage_changed",
      title: `${existing.businessName}: ${prev} → ${input.pipelineStage}`,
      description: input.lossReason,
    });
  }
  revalidateAll(input.leadId);
}

const dncSchema = z.object({
  leadId: z.string().min(1),
  reason: z.string().trim().max(400).optional(),
  flagged: z.enum(["0", "1"]),
});

export async function toggleDoNotContactAction(
  formData: FormData
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, dncSchema);
  const flag = input.flagged === "1";
  const updated = await updateLead(db, owner.id, input.leadId, {
    flagDoNotContact: flag,
    doNotContactReason: input.reason,
  });
  if (!updated) throw new Error("Lead not found.");
  await createActivity(db, owner.id, {
    leadId: input.leadId,
    activityType: "lead_updated",
    title: `Do-not-contact ${flag ? "set" : "cleared"} for ${updated.businessName}`,
    description: input.reason,
  });
  revalidateAll(input.leadId);
}

export async function archiveLeadAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) throw new Error("leadId is required.");
  const lead = await getLead(db, owner.id, leadId);
  if (!lead) throw new Error("Lead not found.");
  await archiveLead(db, owner.id, leadId);
  await createActivity(db, owner.id, {
    leadId,
    activityType: "lead_updated",
    title: `Archived ${lead.businessName}`,
  });
  revalidateAll();
  redirect("/leads");
}

/* -----------------------------------------------------------------
 * Draft lifecycle
 * ----------------------------------------------------------------- */

async function transitionDraftWithActivity(
  draftId: string,
  nextStatus: OutreachStatus
) {
  const owner = await requirePageOwner();
  const db = await getDb();
  const existing = await getDraft(db, owner.id, draftId);
  if (!existing) throw new Error("Draft not found.");

  // Do-not-contact guard mirrors /api/outreach-drafts/[id] PATCH
  if (nextStatus === "approved" || nextStatus === "contacted") {
    const lead = await getLead(db, owner.id, existing.leadId);
    if (lead?.doNotContact.flagged) {
      throw new Error(
        "This lead is marked do-not-contact. Approve / Contact actions are blocked."
      );
    }
  }

  await transitionDraft(db, owner.id, draftId, nextStatus);

  // Stage side-effects
  if (nextStatus === "contacted") {
    await updateLead(db, owner.id, existing.leadId, {
      lastContactedAt: new Date().toISOString(),
      pipelineStage: "contacted",
    });
  } else if (nextStatus === "replied") {
    await updateLead(db, owner.id, existing.leadId, {
      pipelineStage: "replied",
    });
  }

  const activityType =
    nextStatus === "approved"
      ? "draft_approved"
      : nextStatus === "contacted"
        ? "contact_logged"
        : nextStatus === "replied"
          ? "reply_logged"
          : "lead_updated";

  const titles: Record<string, string> = {
    draft_approved: "Draft approved",
    contact_logged: "Marked contacted",
    reply_logged: "Reply logged",
  };
  await createActivity(db, owner.id, {
    leadId: existing.leadId,
    activityType,
    title: titles[activityType] ?? `Draft moved to ${nextStatus}`,
    description: existing.subject ?? undefined,
  });

  revalidateAll(existing.leadId);
}

export async function approveDraftAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) throw new Error("draftId is required.");
  await transitionDraftWithActivity(id, "approved");
}

export async function markContactedAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) throw new Error("draftId is required.");
  await transitionDraftWithActivity(id, "contacted");
}

export async function logReplyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) throw new Error("draftId is required.");
  await transitionDraftWithActivity(id, "replied");
}

export async function archiveDraftAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) throw new Error("draftId is required.");
  await transitionDraftWithActivity(id, "archived");
}

/* -----------------------------------------------------------------
 * Tasks
 * ----------------------------------------------------------------- */

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  taskType: z
    .enum([
      "review_lead",
      "verify_contact",
      "send_approved_message",
      "follow_up",
      "prepare_proposal",
      "book_meeting",
      "other",
    ])
    .optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  leadId: z.string().optional(),
  campaignId: z.string().optional(),
  dueAt: z.string().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function createTaskAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, createTaskSchema);

  const task = await createTask(db, owner.id, {
    title: input.title,
    taskType: input.taskType as TaskType | undefined,
    priority: input.priority as TaskPriority | undefined,
    leadId: input.leadId,
    campaignId: input.campaignId,
    dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : undefined,
    notes: input.notes,
  });

  await createActivity(db, owner.id, {
    leadId: input.leadId,
    campaignId: input.campaignId,
    activityType: "lead_updated",
    title: `Task added: ${task.title}`,
  });
  revalidateAll(input.leadId, input.campaignId);
}

export async function completeTaskAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const id = String(formData.get("taskId") ?? "").trim();
  if (!id) throw new Error("taskId is required.");
  const updated = await updateTask(db, owner.id, id, { status: "done" });
  if (!updated) throw new Error("Task not found.");
  revalidateAll(updated.leadId, updated.campaignId);
}

/* -----------------------------------------------------------------
 * Campaigns
 * ----------------------------------------------------------------- */

const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  niche: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "active", "paused", "completed"]).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  idealCustomerDescription: z.string().trim().max(2000).optional(),
  offer: z.string().trim().max(500).optional(),
  valueProposition: z.string().trim().max(2000).optional(),
  caseStudyUrl: z.string().trim().url().max(2000).optional(),
  minimumScore: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((n) => n >= 0 && n <= 100, "Must be between 0 and 100.")
    .optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function createCampaignAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, createCampaignSchema);

  const campaign = await createCampaign(db, owner.id, {
    name: input.name,
    status: input.status,
    niche: input.niche,
    geography: {
      city: input.city,
      region: input.region,
      country: input.country ?? "India",
    },
    idealCustomerDescription: input.idealCustomerDescription,
    offer: input.offer,
    valueProposition: input.valueProposition,
    caseStudyUrl: input.caseStudyUrl,
    minimumScore: input.minimumScore,
    notes: input.notes,
  });

  revalidateAll(undefined, campaign.id);
  redirect(`/campaigns/${campaign.id}`);
}

export async function assignLeadToCampaignAction(
  formData: FormData
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!campaignId || !leadId) throw new Error("campaignId and leadId required.");
  await assignLeadToCampaign(db, owner.id, campaignId, leadId);
  revalidateAll(leadId, campaignId);
}

export async function unassignLeadFromCampaignAction(
  formData: FormData
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!campaignId || !leadId) throw new Error("campaignId and leadId required.");
  await unassignLeadFromCampaign(db, owner.id, campaignId, leadId);
  revalidateAll(leadId, campaignId);
}

/* -----------------------------------------------------------------
 * Website audit
 * ----------------------------------------------------------------- */

/**
 * Run the website audit for a lead. The URL comes from the lead row — never
 * from the form input — so a user cannot trick the server into fetching an
 * arbitrary URL on their behalf. The SSRF guard inside `runAudit` is the
 * second layer; owner-scoped lookup is the first.
 */
export async function runAuditAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) throw new Error("leadId is required.");

  assertWithinRateLimit(owner.id, "audit");

  const lead = await getLead(db, owner.id, leadId);
  if (!lead) throw new Error("Lead not found.");
  if (!lead.websiteUrl) {
    throw new Error(
      "This lead has no website URL. Add one on the lead profile before running an audit."
    );
  }

  const { audit, derivedCondition } = await runAudit({
    leadId: lead.id,
    requestedUrl: lead.websiteUrl,
  });

  await createAudit(db, owner.id, audit);
  await updateLead(db, owner.id, lead.id, { websiteCondition: derivedCondition });
  await createActivity(db, owner.id, {
    leadId: lead.id,
    activityType: "audit_run",
    title: `Audit completed for ${lead.businessName}`,
    description:
      audit.status === "success"
        ? `${audit.findings.length} findings · condition → ${derivedCondition}`
        : `${audit.status}: ${audit.findings[0]?.description ?? audit.errorCategory ?? ""}`,
    metadata: {
      auditVersion: audit.auditVersion,
      status: audit.status,
      derivedCondition,
    },
  });

  revalidateAll(lead.id);
}

/* -----------------------------------------------------------------
 * Lead scoring
 * -----------------------------------------------------------------
 * Loads the lead + latest audit + owner's weights + a best-match campaign,
 * runs the deterministic engine, and persists the breakdown. The engine is
 * pure — the DB only sees the final `ScoreBreakdown`.
 */

export async function scoreLeadAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) throw new Error("leadId is required.");

  const lead = await getLead(db, owner.id, leadId);
  if (!lead) throw new Error("Lead not found.");

  const [audit, services, campaigns, weights] = await Promise.all([
    getLatestAudit(db, owner.id, leadId),
    listServiceOfferings(db, owner.id),
    listCampaigns(db, owner.id),
    getScoringWeights(db, owner.id),
  ]);

  // Pick the best-fit campaign for the lead by niche match — scoring only
  // credits the niche_match factor when a campaign is actually selected.
  const campaign =
    campaigns.find((c) => c.niche === lead.niche && (c.status === "active" || c.status === "draft")) ??
    campaigns.find((c) => c.niche === lead.niche);

  const result = scoreLead({
    lead,
    audit,
    campaign,
    services,
    weights,
    nowIso: new Date().toISOString(),
  });

  await updateLead(db, owner.id, lead.id, {
    score: result,
  });
  await createActivity(db, owner.id, {
    leadId: lead.id,
    activityType: "score_computed",
    title: `Scored ${lead.businessName}: ${result.total}/100`,
    description:
      result.band === "insufficient_evidence"
        ? "Insufficient evidence — not scored numerically."
        : `${result.factors.length} factors contributed · band → ${result.band}`,
    metadata: { version: result.version, confidence: result.confidence },
  });

  revalidateAll(lead.id);
}

/* -----------------------------------------------------------------
 * Opportunity brief (template)
 * -----------------------------------------------------------------
 * Generates a template-based brief (works without AI). AI generation lands
 * in Phase 7 behind the provider abstraction.
 */

export async function generateBriefAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) throw new Error("leadId is required.");

  const lead = await getLead(db, owner.id, leadId);
  if (!lead) throw new Error("Lead not found.");

  const [audit, services, campaigns] = await Promise.all([
    getLatestAudit(db, owner.id, leadId),
    listServiceOfferings(db, owner.id),
    listCampaigns(db, owner.id),
  ]);

  const campaign =
    campaigns.find((c) => c.niche === lead.niche && (c.status === "active" || c.status === "draft")) ??
    campaigns.find((c) => c.niche === lead.niche);

  const brief = buildTemplateBrief({
    lead,
    score: lead.score,
    audit,
    campaign,
    services,
    nowIso: new Date().toISOString(),
  });

  await createBrief(db, owner.id, {
    leadId: brief.leadId,
    campaignId: brief.campaignId ?? null,
    summary: brief.summary,
    observations: brief.observations,
    possibleOpportunity: brief.possibleOpportunity,
    recommendedService: brief.recommendedService,
    suggestedDeliverable: brief.suggestedDeliverable,
    confidence: brief.confidence,
    unknowns: brief.unknowns,
    source: "template",
    createdAt: brief.createdAt,
  });

  await createActivity(db, owner.id, {
    leadId: lead.id,
    campaignId: brief.campaignId ?? undefined,
    activityType: "note_added",
    title: `Brief generated for ${lead.businessName}`,
    description: `${brief.observations.length} observations · ${brief.recommendedService}`,
    metadata: { source: "template", confidence: brief.confidence },
  });

  revalidateAll(lead.id, brief.campaignId ?? undefined);
}

/* -----------------------------------------------------------------
 * Scoring weights (Settings)
 * ----------------------------------------------------------------- */

export async function saveScoringWeightsAction(
  formData: FormData
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();

  const codes = Object.keys(FACTOR_LABELS) as ScoreFactorCode[];
  const next = { ...DEFAULT_WEIGHTS } as WeightMap;
  for (const code of codes) {
    const rawPoints = formData.get(`points.${code}`);
    const parsed = rawPoints != null ? Number(String(rawPoints)) : NaN;
    const points = Number.isFinite(parsed) ? Math.trunc(parsed) : next[code].points;
    const bounded = Math.max(-100, Math.min(100, points));
    const enabled = formData.get(`enabled.${code}`) != null;
    next[code] = { points: bounded, enabled };
  }

  await setScoringWeights(db, owner.id, next);
  revalidatePath("/settings");
}

export async function resetScoringWeightsAction(
  _formData: FormData
): Promise<void> {
  void _formData;
  const owner = await requirePageOwner();
  const db = await getDb();
  await setScoringWeights(db, owner.id, DEFAULT_WEIGHTS);
  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * Discovery (Phase 6)
 * -----------------------------------------------------------------
 * Runs the selected adapter against a validated input, dedups against
 * existing leads, persists survivors, and (optionally) audits + scores
 * each new lead. Foreground execution — no Queues yet.
 */

const discoverySchema = z.object({
  sourceName: z.enum(["manual", "csv_import", "google_places"]),
  campaignId: z.string().optional(),
  niche: z.string().trim().min(1).max(120),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  keywords: z.string().trim().max(400).optional(),
  businessTypes: z.string().trim().max(400).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((n) => n > 0 && n <= 100, "Limit must be 1–100.")
    .optional(),
  runAudit: z.enum(["0", "1"]).optional(),
  scoreAfter: z.enum(["0", "1"]).optional(),
});

export async function runDiscoveryAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, discoverySchema);

  assertWithinRateLimit(owner.id, "discovery");

  const env = await getRuntimeEnv();
  const adapter = getAdapter(input.sourceName);
  if (!adapter) throw new Error(`Unknown source: ${input.sourceName}`);
  const capability = adapter.capability(env);
  if (capability === "needs-key") {
    throw new Error(
      `${adapter.label} requires an API key. Configure it in Settings before running.`
    );
  }

  const limit = input.limit ?? 20;
  const jobInput = {
    niche: input.niche,
    city: input.city,
    region: input.region,
    country: input.country,
    keywords: input.keywords,
    businessTypes: input.businessTypes,
    resultLimit: limit,
  };

  const job = await createDiscoveryJob(db, owner.id, {
    sourceName: input.sourceName,
    campaignId: input.campaignId ?? null,
    input: jobInput as Record<string, unknown>,
    status: "queued",
  });

  // Non-adapter sources: manual + csv emit no candidates, so finish immediately
  // with a note and surface a redirect to the right UI.
  if (input.sourceName === "manual") {
    const { updateDiscoveryJob } = await import("@/lib/db/repos");
    const now = new Date().toISOString();
    await updateDiscoveryJob(db, owner.id, job.id, {
      status: "completed",
      startedAt: now,
      completedAt: now,
      progressTotal: 0,
      progressCurrent: 0,
    });
    revalidatePath("/discover");
    redirect(`/leads?new=1`);
  }
  if (input.sourceName === "csv_import") {
    const { updateDiscoveryJob } = await import("@/lib/db/repos");
    const now = new Date().toISOString();
    await updateDiscoveryJob(db, owner.id, job.id, {
      status: "completed",
      startedAt: now,
      completedAt: now,
      progressTotal: 0,
      progressCurrent: 0,
    });
    revalidatePath("/discover");
    redirect(`/leads?import=1`);
  }

  await runDiscovery(db, {
    jobId: job.id,
    ownerId: owner.id,
    sourceName: input.sourceName,
    campaignId: input.campaignId,
    input: {
      niche: input.niche,
      city: input.city,
      region: input.region,
      country: input.country ?? "India",
      keywords: input.keywords,
      businessTypes: input.businessTypes,
      limit,
    },
    runAuditOnEach: input.runAudit === "1",
    scoreAfter: input.scoreAfter === "1",
    env,
  });

  revalidatePath("/discover");
  revalidatePath("/leads");
  revalidatePath("/overview");
}

/* -----------------------------------------------------------------
 * Outreach drafts (Phase 7)
 * -----------------------------------------------------------------
 * Produces a draft (template or AI-generated) and persists it in
 * `needs_review`. Do-not-contact is honored *before* the draft is created,
 * not just at approve/send time (spec guardrail §10).
 */

const generateDraftSchema = z.object({
  leadId: z.string().min(1),
  channel: z
    .enum(["email", "contact_form", "instagram_dm", "linkedin_manual", "other"])
    .optional(),
  mode: z.enum(["template", "ai"]).optional(),
});

export async function generateDraftAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, generateDraftSchema);

  const lead = await getLead(db, owner.id, input.leadId);
  if (!lead) throw new Error("Lead not found.");
  if (lead.doNotContact.flagged) {
    throw new Error(
      "This lead is marked do-not-contact. Drafts cannot be created."
    );
  }

  const [audit, brief, services] = await Promise.all([
    getLatestAudit(db, owner.id, lead.id),
    getLatestBrief(db, owner.id, lead.id),
    listServiceOfferings(db, owner.id),
  ]);

  const env = await getRuntimeEnv();
  const wantsAi = input.mode === "ai" || (input.mode == null && !!env.ANTHROPIC_API_KEY);

  let draft;
  let aiFallbackReason: string | undefined;
  if (wantsAi && env.ANTHROPIC_API_KEY) {
    try {
      assertWithinRateLimit(owner.id, "ai_draft");
      draft = await buildAiDraft(
        {
          lead,
          brief,
          audit,
          services,
          channel: input.channel as OutreachChannel | undefined,
        },
        env
      );
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      aiFallbackReason = (err as Error).message;
      draft = buildTemplateDraft({
        lead,
        brief,
        audit,
        services,
        channel: input.channel as OutreachChannel | undefined,
      });
    }
  } else {
    draft = buildTemplateDraft({
      lead,
      brief,
      audit,
      services,
      channel: input.channel as OutreachChannel | undefined,
    });
  }

  const evidence = aiFallbackReason
    ? [...draft.personalizationEvidence, `AI fallback: ${aiFallbackReason}`]
    : draft.personalizationEvidence;

  const persisted = await createDraft(db, owner.id, {
    leadId: lead.id,
    channel: draft.channel,
    subject: draft.subject ?? undefined,
    body: draft.body,
    personalizationEvidence: evidence,
    source: draft.source,
  });

  await createActivity(db, owner.id, {
    leadId: lead.id,
    activityType: "draft_created",
    title: `Draft created for ${lead.businessName}`,
    description: `${draft.source === "ai" ? "AI" : "Template"} · channel ${draft.channel}${aiFallbackReason ? " · template fallback" : ""}`,
    metadata: { draftId: persisted.id, source: draft.source },
  });

  revalidateAll(lead.id);
}

/** Reserved — exported here so pages can import consistently later. */
export type { OutreachStatus, PipelineStage };
