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
import { and, eq } from "drizzle-orm";
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
  ReplySentiment,
  TaskPriority,
  TaskType,
} from "@/lib/demo/types";
// Phase D imports
import { appSettings, outreachDrafts } from "@/lib/db/schema";
import { saveNotificationPrefs } from "@/lib/db/repos/notification-prefs";
import {
  createCadence,
  updateCadence,
  deleteCadence,
  attachCadenceToCampaign,
  detachCadenceFromCampaign,
} from "@/lib/db/repos/cadences";
import {
  createWebhook,
  deleteWebhook,
  enqueueDelivery,
} from "@/lib/db/repos/webhooks";
import { snoozeLeadKey, snoozeTaskKey } from "@/lib/cron/snooze-wake";
import type { CadenceStep } from "@/lib/outreach/cadence";
import type { NotificationPrefs } from "@/lib/db/repos/notification-prefs";

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

  if (lead.websiteUrl) {
    await autoAuditAndScore(db, owner.id, lead.id).catch(() => undefined);
  }

  revalidateAll(lead.id);
  redirect(`/leads/${lead.id}`);
}

/**
 * Runs the website audit + lead-score pipeline immediately after a lead
 * exists with a websiteUrl. Errors are swallowed by the caller because this
 * is a non-essential enrichment — the lead is still saved either way.
 */
async function autoAuditAndScore(
  db: Awaited<ReturnType<typeof getDb>>,
  ownerId: string,
  leadId: string
): Promise<void> {
  const lead = await getLead(db, ownerId, leadId);
  if (!lead?.websiteUrl) return;

  try {
    assertWithinRateLimit(ownerId, "audit");
    const { audit, derivedCondition } = await runAudit({
      leadId: lead.id,
      requestedUrl: lead.websiteUrl,
    });
    await createAudit(db, ownerId, audit);
    await updateLead(db, ownerId, lead.id, {
      websiteCondition: derivedCondition,
      lastAuditedAt: new Date().toISOString(),
    });
    await createActivity(db, ownerId, {
      leadId: lead.id,
      activityType: "audit_run",
      title: `Auto-audit completed for ${lead.businessName}`,
      description:
        audit.status === "success"
          ? `${audit.findings.length} findings · condition → ${derivedCondition}`
          : audit.status,
      metadata: { auto: true, status: audit.status, derivedCondition },
    });
  } catch {
    // Audit failed (network, SSRF, timeout, rate limit) — not fatal.
    return;
  }

  const [latestAudit, services, campaigns, weights] = await Promise.all([
    getLatestAudit(db, ownerId, leadId),
    listServiceOfferings(db, ownerId),
    listCampaigns(db, ownerId),
    getScoringWeights(db, ownerId),
  ]);
  const freshLead = await getLead(db, ownerId, leadId);
  if (!freshLead || !weights) return;
  const campaign =
    campaigns.find(
      (c) => c.niche === freshLead.niche && (c.status === "active" || c.status === "draft")
    ) ?? campaigns.find((c) => c.niche === freshLead.niche);
  const result = scoreLead({
    lead: freshLead,
    audit: latestAudit,
    campaign,
    services,
    weights,
    nowIso: new Date().toISOString(),
  });
  await updateLead(db, ownerId, leadId, { score: result });
  await createActivity(db, ownerId, {
    leadId,
    activityType: "score_computed",
    title: `Auto-scored ${freshLead.businessName}: ${result.total}/100`,
    description: `band → ${result.band}`,
    metadata: { auto: true, version: result.version },
  });
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

const FOLLOW_UP_DELAY_DAYS = 5;

async function transitionDraftWithActivity(
  draftId: string,
  nextStatus: OutreachStatus,
  opts?: { replySentiment?: ReplySentiment }
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

  await transitionDraft(db, owner.id, draftId, nextStatus, {
    replySentiment: opts?.replySentiment,
  });

  // Stage side-effects
  if (nextStatus === "contacted") {
    await updateLead(db, owner.id, existing.leadId, {
      lastContactedAt: new Date().toISOString(),
      pipelineStage: "contacted",
    });
    const lead = await getLead(db, owner.id, existing.leadId);
    if (lead) {
      const dueAt = new Date(Date.now() + FOLLOW_UP_DELAY_DAYS * 86400_000).toISOString();
      const task = await createTask(db, owner.id, {
        title: `Follow up with ${lead.businessName}`,
        taskType: "follow_up",
        priority: "normal",
        leadId: lead.id,
        dueAt,
        notes: `Auto-scheduled ${FOLLOW_UP_DELAY_DAYS} days after first contact.`,
      });
      await updateLead(db, owner.id, existing.leadId, { nextActionAt: dueAt });
      await createActivity(db, owner.id, {
        leadId: existing.leadId,
        activityType: "follow_up_scheduled",
        title: `Follow-up scheduled: ${lead.businessName}`,
        description: `Due in ${FOLLOW_UP_DELAY_DAYS} days`,
        metadata: { taskId: task.id, dueAt },
      });
    }
  } else if (nextStatus === "replied") {
    const stage = opts?.replySentiment === "not_a_fit" ? "not_a_fit" : "replied";
    await updateLead(db, owner.id, existing.leadId, {
      pipelineStage: stage,
      ...(opts?.replySentiment === "unsubscribe"
        ? { flagDoNotContact: true, doNotContactReason: "Replied asking to unsubscribe." }
        : {}),
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
    reply_logged: opts?.replySentiment
      ? `Reply logged · ${opts.replySentiment.replace("_", " ")}`
      : "Reply logged",
  };
  await createActivity(db, owner.id, {
    leadId: existing.leadId,
    activityType,
    title: titles[activityType] ?? `Draft moved to ${nextStatus}`,
    description: existing.subject ?? undefined,
    metadata: opts?.replySentiment ? { sentiment: opts.replySentiment } : undefined,
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

const sentimentValues = [
  "interested",
  "needs_info",
  "not_a_fit",
  "unsubscribe",
  "unclear",
] as const;

export async function logReplyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("draftId") ?? "").trim();
  if (!id) throw new Error("draftId is required.");
  const rawSentiment = String(formData.get("sentiment") ?? "").trim();
  const replySentiment = (sentimentValues as readonly string[]).includes(rawSentiment)
    ? (rawSentiment as ReplySentiment)
    : undefined;
  await transitionDraftWithActivity(id, "replied", { replySentiment });
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

/* -----------------------------------------------------------------
 * A/B variant generation
 * -----------------------------------------------------------------
 * Produces two drafts for the same lead with a shared `variantGroup` UUID
 * and labels "A"/"B". If Anthropic is configured, variant A is template and
 * variant B is AI (two angles). Otherwise both are template with different
 * channel-anchored styles so Nihar still has a comparison to A/B test.
 */

export async function generateDraftVariantsAction(
  formData: FormData
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, generateDraftSchema);

  const lead = await getLead(db, owner.id, input.leadId);
  if (!lead) throw new Error("Lead not found.");
  if (lead.doNotContact.flagged) {
    throw new Error("This lead is marked do-not-contact. Drafts cannot be created.");
  }

  const [audit, brief, services] = await Promise.all([
    getLatestAudit(db, owner.id, lead.id),
    getLatestBrief(db, owner.id, lead.id),
    listServiceOfferings(db, owner.id),
  ]);

  const env = await getRuntimeEnv();
  const variantGroup = crypto.randomUUID();

  const variantA = buildTemplateDraft({
    lead,
    brief,
    audit,
    services,
    channel: input.channel as OutreachChannel | undefined,
  });

  let variantB;
  let variantBSource: "template" | "ai" = "template";
  let aiFallbackReason: string | undefined;

  if (env.ANTHROPIC_API_KEY) {
    try {
      assertWithinRateLimit(owner.id, "ai_draft");
      variantB = await buildAiDraft(
        {
          lead,
          brief,
          audit,
          services,
          channel: input.channel as OutreachChannel | undefined,
        },
        env
      );
      variantBSource = "ai";
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      aiFallbackReason = (err as Error).message;
    }
  }

  if (!variantB) {
    const alternateChannel: OutreachChannel =
      variantA.channel === "email" ? "contact_form" : "email";
    variantB = buildTemplateDraft({
      lead,
      brief,
      audit,
      services,
      channel: alternateChannel,
    });
  }

  const evidenceB = aiFallbackReason
    ? [...variantB.personalizationEvidence, `AI fallback: ${aiFallbackReason}`]
    : variantB.personalizationEvidence;

  const createdA = await createDraft(db, owner.id, {
    leadId: lead.id,
    channel: variantA.channel,
    subject: variantA.subject ?? undefined,
    body: variantA.body,
    personalizationEvidence: variantA.personalizationEvidence,
    source: variantA.source,
    variantGroup,
    variantLabel: "A",
  });
  const createdB = await createDraft(db, owner.id, {
    leadId: lead.id,
    channel: variantB.channel,
    subject: variantB.subject ?? undefined,
    body: variantB.body,
    personalizationEvidence: evidenceB,
    source: variantBSource,
    variantGroup,
    variantLabel: "B",
  });

  await createActivity(db, owner.id, {
    leadId: lead.id,
    activityType: "draft_created",
    title: `A/B variants created for ${lead.businessName}`,
    description: `A: ${variantA.source} · B: ${variantBSource}${aiFallbackReason ? " (fallback)" : ""}`,
    metadata: {
      variantGroup,
      draftIdA: createdA.id,
      draftIdB: createdB.id,
    },
  });

  revalidateAll(lead.id);
}

/** Reserved — exported here so pages can import consistently later. */
export type { OutreachStatus, PipelineStage };

/* -----------------------------------------------------------------
 * Phase B — Onboarding + preset actions
 * -----------------------------------------------------------------
 * These actions are APPENDED to the existing file as instructed.
 * They persist state to app_settings with key `onboarding/v1` and
 * do NOT depend on any Phase A tables (workspaces, sessions, etc.).
 * `ownerId` is used as the tenant key exactly as the rest of this file does.
 */

import {
  getOnboardingState,
  setOnboardingState,
  completeOnboarding,
  resetOnboarding,
  type OnboardingStepData,
} from "@/lib/onboarding/state";
import { applyPreset } from "@/lib/onboarding/apply-preset";
import type { ApplyPresetSummary } from "@/lib/onboarding/apply-preset";

/* -- Step schemas -------------------------------------------------- */

const step1Schema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  fullName: z.string().trim().max(120).optional(),
  websiteUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  attributionSource: z.string().trim().max(80).optional(),
});

const step2Schema = z.object({
  presetId: z.string().trim().min(1).max(60),
  pitch: z.string().trim().max(400).optional(),
  caseStudyUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});

const step3Schema = z
  .object({
    icpDescription: z.string().trim().max(600).optional(),
    niches: z
      .string()
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
      .optional(),
    country: z.string().trim().max(80).optional(),
    region: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    dealMin: z.string().regex(/^\d+$/).transform(Number).optional(),
    dealMax: z.string().regex(/^\d+$/).transform(Number).optional(),
    currency: z.string().trim().max(10).optional(),
    skip: z.literal("true").optional(),
    _goBack: z.literal("true").optional(),
  })
  .passthrough();

/* Generic passthrough for steps 4 and 5 — validated at the app layer */
const step4Schema = z.unknown();
const step5Schema = z.unknown();

/* -- Action: initialize ------------------------------------------- */

/**
 * Initialise onboarding state if it doesn't exist yet.
 * Safe to call multiple times — no-ops when state already exists.
 */
export async function startOnboardingAction(): Promise<void> {
  const owner = await requirePageOwner();
  const current = await getOnboardingState(owner.id);
  if (current.completed) {
    redirect("/overview");
  }
  // State already exists — nothing to do.
}

/* -- Action: save step -------------------------------------------- */

/**
 * Persist step data and advance the wizard to the next step.
 * Each step advances `step` by 1 unless `_goBack` is present (steps back by 1).
 *
 * @param step  1–5
 * @param data  Unknown payload — validated per-step with Zod inside this fn.
 */
export async function saveOnboardingStepAction(
  step: 1 | 2 | 3 | 4 | 5,
  data: unknown
): Promise<void> {
  const owner = await requirePageOwner();
  const current = await getOnboardingState(owner.id);

  // Handle go-back signals — decrease step by 1 and don't save step data.
  const raw = data as Record<string, unknown>;
  if (raw?._goBack === true || raw?._goBack === "true") {
    const prevStep = Math.max(1, step - 1) as 1 | 2 | 3 | 4 | 5;
    await setOnboardingState(owner.id, { step: prevStep });
    revalidatePath("/onboarding");
    return;
  }

  // Validate per-step.
  let stepData: Partial<OnboardingStepData> = {};

  if (step === 1) {
    const parsed = step1Schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Step 1 validation failed.");
    }
    stepData = {
      who: {
        workspaceName: parsed.data.workspaceName,
        fullName: parsed.data.fullName,
        websiteUrl: parsed.data.websiteUrl || undefined,
        attributionSource: parsed.data.attributionSource,
      },
    };
  } else if (step === 2) {
    const parsed = step2Schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Step 2 validation failed.");
    }
    stepData = {
      what: {
        presetId: parsed.data.presetId,
        pitch: parsed.data.pitch,
        caseStudyUrl: parsed.data.caseStudyUrl || undefined,
      },
    };
  } else if (step === 3) {
    const skip = (raw?.skip === true || raw?.skip === "true");
    if (!skip) {
      stepData = {
        icp: {
          icpDescription: typeof raw?.icpDescription === "string" ? raw.icpDescription : undefined,
          niches: Array.isArray(raw?.niches)
            ? (raw.niches as string[])
            : typeof raw?.niches === "string"
            ? raw.niches.split(",").map((s: string) => s.trim()).filter(Boolean)
            : undefined,
          country: typeof raw?.country === "string" ? raw.country : undefined,
          region: typeof raw?.region === "string" ? raw.region : undefined,
          city: typeof raw?.city === "string" ? raw.city : undefined,
          dealMin: typeof raw?.dealMin === "number" ? raw.dealMin : undefined,
          dealMax: typeof raw?.dealMax === "number" ? raw.dealMax : undefined,
          currency: typeof raw?.currency === "string" ? raw.currency : undefined,
        },
      };
    }
  } else if (step === 4) {
    // Step 4: services + scoring overrides. Passed as-is from the component.
    const servicesRaw = raw?.services as Array<{
      name: string;
      description: string;
      idealCustomer: string;
      valueProposition: string;
    }> | undefined;
    const scoringOverrides = raw?.scoringOverrides as
      | Record<string, { points: number; enabled: boolean }>
      | undefined;
    stepData = { services: { services: servicesRaw, scoringOverrides } };
  } else if (step === 5) {
    // Step 5: integrations
    stepData = {
      integrations: {
        digestFrequency:
          (raw?.digestFrequency as "off" | "daily" | "weekly" | undefined) ?? "weekly",
      },
    };
  }

  const nextStep = (Math.min(6, step + 1)) as 1 | 2 | 3 | 4 | 5 | 6;
  await setOnboardingState(owner.id, {
    step: nextStep,
    data: stepData,
  });

  // After step 2, apply the preset immediately so services + weights are
  // pre-seeded before the user reaches steps 4 and 5.
  if (step === 2 && stepData.what?.presetId) {
    const db = await getDb();
    void db; // getDb is already called above via applyPreset internally
    await applyPreset(owner.id, stepData.what.presetId, {
      pitch: stepData.what.pitch,
    }).catch(() => {
      // Non-fatal — preset can be re-applied later.
    });
  }

  revalidatePath("/onboarding");
}

/* -- Action: apply preset ----------------------------------------- */

/**
 * Explicit preset application — used when the user re-applies or changes
 * a preset from the settings page after onboarding.
 */
export async function applyPresetAction(presetId: string): Promise<ApplyPresetSummary> {
  const owner = await requirePageOwner();
  const summary = await applyPreset(owner.id, presetId);
  revalidatePath("/settings");
  revalidatePath("/onboarding");
  return summary;
}

/* -- Action: complete onboarding ---------------------------------- */

/**
 * Final action called from the DoneStep component.
 * Seeds 10 demo leads into the first campaign and marks onboarding complete.
 */
export async function completeOnboardingAction(): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const state = await getOnboardingState(owner.id);

  // Guard: already completed — no-op.
  if (state.completed) return;

  // Seed 10 demo leads tagged "Demo" into the first campaign.
  const existingCampaigns = await listCampaigns(db, owner.id);
  const firstCampaign = existingCampaigns[0];

  if (firstCampaign) {
    const demoLeads = buildDemoLeads(owner.id, firstCampaign.niche);
    for (const dl of demoLeads) {
      try {
        const lead = await createLead(db, owner.id, dl);
        await assignLeadToCampaign(db, owner.id, firstCampaign.id, lead.id);
      } catch {
        // Skip duplicates or any seeding errors silently.
      }
    }
  }

  await completeOnboarding(owner.id);
  revalidatePath("/onboarding");
  revalidatePath("/overview");
}

/* -- Action: restart onboarding (debug / admin) ------------------- */

export async function restartOnboardingAction(): Promise<void> {
  const owner = await requirePageOwner();
  await resetOnboarding(owner.id);
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

/* -- Demo lead seeder helper -------------------------------------- */

/**
 * Builds 10 fictional demo leads for the given owner and niche.
 * Tagged "Demo" so users can easily identify and delete them.
 * Uses only the `createLead` repo function — no external I/O.
 */
function buildDemoLeads(
  ownerId: string,
  niche: string
): Parameters<typeof createLead>[2][] {
  void ownerId; // ownerId is passed via the createLead call site, not used here
  const names = [
    "Sunrise Solutions",
    "Blue Mountain Co.",
    "Crestview Group",
    "Harbor Point LLC",
    "Summit Digital",
    "Greenfield Partners",
    "Clearwater Studio",
    "Ridgeline Services",
    "Lakeside Creative",
    "Northstar Consulting",
  ];
  return names.map((businessName, i) => ({
    businessName,
    category: niche,
    niche,
    city: "Demo City",
    country: "United States",
    sourceName: "manual",
    websiteCondition: (["no_website", "outdated", "weak"] as const)[i % 3],
    pipelineStage: "new" as const,
    tags: ["Demo"],
  }));
}

/* -----------------------------------------------------------------
 * Phase C — Niche-agnostic customization actions
 * -----------------------------------------------------------------
 * All appended below. No existing function is modified above.
 */

import {
  listFactors,
  createFactor,
  updateFactor,
  deleteFactor,
} from "@/lib/db/repos/custom-factors";
import {
  listSignals,
  createSignal,
  updateSignal,
  deleteSignal,
} from "@/lib/db/repos/custom-signals";
import {
  getCustomVariables,
  setCustomVariable,
  deleteCustomVariable,
} from "@/lib/variables/custom";
import { substitute, buildContext, KNOWN_VARIABLE_KEYS } from "@/lib/variables/registry";
import {
  updateBranding as repoBranding,
  getProfileSettings,
  setProfileSettings,
} from "@/lib/db/repos/workspaces";
import { getSetting, setSetting } from "@/lib/db/repos/settings";
import type { CustomScoreFactor, DetectionMethod } from "@/lib/scoring/custom-factors";
import type { CustomAuditSignal, SignalDetectionMethod, SignalSeverity } from "@/lib/audit/custom-signals";

// ---- Helpers ----

function parseDetectionConfig(raw: string | undefined): Record<string, unknown> | null {
  if (!raw || raw.trim() === "" || raw.trim() === "{}") return null;
  try {
    const parsed = JSON.parse(raw.trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- Branding ----

const brandingSchema = z.object({
  name: z.string().trim().max(200).optional(),
  logoUrl: z.string().trim().max(2000).optional(),
  accentColor: z.string().trim().max(80).optional(),
  pitch: z.string().trim().max(500).optional(),
});

export async function updateBrandingAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, brandingSchema);
  await repoBranding(owner.id, input, db);
  revalidatePath("/settings");
}

// ---- Custom scoring factors ----

const customFactorBaseSchema = z.object({
  code: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/, "Must be snake_case"),
  label: z.string().trim().min(1).max(200),
  points: z
    .string()
    .trim()
    .regex(/^-?\d+$/)
    .transform(Number),
  enabled: z.string().optional().transform((v) => v === "1"),
  detectionMethod: z.enum(["presence", "regex", "count", "manual"]),
  detectionConfig: z.string().trim().optional(),
});

export async function createCustomFactorAction(
  formData: FormData
): Promise<CustomScoreFactor> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, customFactorBaseSchema);

  const factor = await createFactor(db, owner.id, {
    code: input.code,
    label: input.label,
    points: input.points,
    enabled: input.enabled,
    detectionMethod: input.detectionMethod as DetectionMethod,
    detectionConfig: parseDetectionConfig(input.detectionConfig) as CustomScoreFactor["detectionConfig"],
  });
  revalidatePath("/settings");
  return factor;
}

export async function updateCustomFactorAction(
  formData: FormData
): Promise<CustomScoreFactor> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const factorId = String(formData.get("factorId") ?? "").trim();
  if (!factorId) throw new Error("factorId is required.");
  const input = parseFormOrThrow(formData, customFactorBaseSchema);

  const updated = await updateFactor(db, owner.id, factorId, {
    code: input.code,
    label: input.label,
    points: input.points,
    enabled: input.enabled,
    detectionMethod: input.detectionMethod as DetectionMethod,
    detectionConfig: parseDetectionConfig(input.detectionConfig) as CustomScoreFactor["detectionConfig"],
  });
  if (!updated) throw new Error("Factor not found.");
  revalidatePath("/settings");
  return updated;
}

export async function deleteCustomFactorAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const factorId = String(formData.get("factorId") ?? "").trim();
  if (!factorId) throw new Error("factorId is required.");
  await deleteFactor(db, owner.id, factorId);
  revalidatePath("/settings");
}

// ---- Custom audit signals ----

const customSignalBaseSchema = z.object({
  code: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/, "Must be snake_case"),
  label: z.string().trim().min(1).max(200),
  severity: z.enum(["info", "low", "medium", "high"]),
  enabled: z.string().optional().transform((v) => v === "1"),
  detectionMethod: z.enum(["regex", "presence", "absence", "count"]),
  detectionConfig: z.string().trim().optional(),
});

export async function createCustomSignalAction(
  formData: FormData
): Promise<CustomAuditSignal> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, customSignalBaseSchema);

  const signal = await createSignal(db, owner.id, {
    code: input.code,
    label: input.label,
    severity: input.severity as SignalSeverity,
    enabled: input.enabled,
    detectionMethod: input.detectionMethod as SignalDetectionMethod,
    detectionConfig: parseDetectionConfig(input.detectionConfig) as CustomAuditSignal["detectionConfig"],
  });
  revalidatePath("/settings");
  return signal;
}

export async function updateCustomSignalAction(
  formData: FormData
): Promise<CustomAuditSignal> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const signalId = String(formData.get("signalId") ?? "").trim();
  if (!signalId) throw new Error("signalId is required.");
  const input = parseFormOrThrow(formData, customSignalBaseSchema);

  const updated = await updateSignal(db, owner.id, signalId, {
    code: input.code,
    label: input.label,
    severity: input.severity as SignalSeverity,
    enabled: input.enabled,
    detectionMethod: input.detectionMethod as SignalDetectionMethod,
    detectionConfig: parseDetectionConfig(input.detectionConfig) as CustomAuditSignal["detectionConfig"],
  });
  if (!updated) throw new Error("Signal not found.");
  revalidatePath("/settings");
  return updated;
}

export async function deleteCustomSignalAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const signalId = String(formData.get("signalId") ?? "").trim();
  if (!signalId) throw new Error("signalId is required.");
  await deleteSignal(db, owner.id, signalId);
  revalidatePath("/settings");
}

// ---- Templates ----

const TEMPLATES_KEY = "templates/v1";

export type DraftTemplateData = {
  key: string;
  label: string;
  subject?: string;
  body: string;
};

const saveTemplateSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(100),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1).max(10000),
});

export async function saveTemplateAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, saveTemplateSchema);

  const existing = (await getSetting<DraftTemplateData[]>(db, owner.id, TEMPLATES_KEY)) ?? [];
  const idx = existing.findIndex((t) => t.key === input.key);
  const updated: DraftTemplateData = {
    key: input.key,
    label: input.label,
    subject: input.subject,
    body: input.body,
  };
  if (idx >= 0) {
    existing[idx] = updated;
  } else {
    existing.push(updated);
  }
  await setSetting(db, owner.id, TEMPLATES_KEY, existing);
  revalidatePath("/settings");
}

/** Preview a template body against a seeded sample lead. Read-only, returns substituted string. */
export async function previewTemplateAction(formData: FormData): Promise<string> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return "";

  const profile = await getProfileSettings(db, owner.id);
  const customVars = await getCustomVariables(db, owner.id);

  // Seeded sample lead for preview
  const sampleLead = {
    businessName: "Sample Business",
    city: "Mumbai",
    region: "Maharashtra",
    country: "India",
    niche: "D2C Brands",
    category: "Consumer goods",
    websiteUrl: "https://example.com",
    publicEmail: "hello@example.com",
  };

  const ctx = buildContext({
    lead: sampleLead as Parameters<typeof buildContext>[0]["lead"],
    studioName: profile.studioName ?? owner.fullName ?? "Your Studio",
    pitch: profile.pitch,
    caseStudyUrl: profile.caseStudyUrl,
    workspaceName: profile.studioName ?? owner.fullName ?? "Your Studio",
    customVars,
  });

  const { output } = substitute(body, ctx);
  return output;
}

// ---- Custom variables ----

const customVarSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_]+$/, "Variable name must be alphanumeric/underscore"),
  value: z.string().trim().max(500),
});

export async function setCustomVariableAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const input = parseFormOrThrow(formData, customVarSchema);
  await setCustomVariable(db, owner.id, input.name, input.value);
  revalidatePath("/settings");
}

export async function deleteCustomVariableAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Variable name is required.");
  await deleteCustomVariable(db, owner.id, name);
  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * Phase D — Snooze / wake
 * ----------------------------------------------------------------- */

async function upsertAppSetting(
  db: Awaited<ReturnType<typeof getDb>>,
  ownerId: string,
  key: string,
  value: unknown
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, key)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, key)));
  } else {
    await db.insert(appSettings).values({
      id: crypto.randomUUID(),
      ownerId,
      key,
      value,
      updatedAt: now,
    });
  }
}

export async function snoozeLeadAction(leadId: string, until: string): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  await upsertAppSetting(db, owner.id, snoozeLeadKey(leadId), until);
  await createActivity(db, owner.id, {
    leadId,
    activityType: "lead_updated",
    title: "Lead snoozed",
    description: `Snoozed until ${until}`,
  });
  revalidateAll(leadId);
}

export async function unsnoozeLeadAction(leadId: string): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  await upsertAppSetting(db, owner.id, snoozeLeadKey(leadId), null);
  await createActivity(db, owner.id, {
    leadId,
    activityType: "lead_updated",
    title: "Lead un-snoozed",
  });
  revalidateAll(leadId);
}

export async function snoozeTaskAction(taskId: string, until: string): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  await upsertAppSetting(db, owner.id, snoozeTaskKey(taskId), until);
  revalidateAll();
}

export async function unsnoozeTaskAction(taskId: string): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  await upsertAppSetting(db, owner.id, snoozeTaskKey(taskId), null);
  revalidateAll();
}

/* -----------------------------------------------------------------
 * Phase D — Cadences
 * ----------------------------------------------------------------- */

const cadenceStepSchema = z.object({
  stepNumber: z.coerce.number().int().min(1),
  offsetDays: z.coerce.number().int().min(1),
  template: z.string().min(1).max(400),
  channel: z.enum(["email", "contact_form", "instagram_dm", "linkedin_manual", "other"]),
});

const cadenceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  steps: z.array(cadenceStepSchema).min(1).max(10),
});

export async function createCadenceAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const raw = extractForm(formData);
  const name = raw.name ?? "";
  const stepsRaw = raw.steps;
  let steps: CadenceStep[] = [];
  if (stepsRaw) {
    try {
      steps = JSON.parse(stepsRaw) as CadenceStep[];
    } catch {
      throw new Error("Invalid steps JSON.");
    }
  }
  const input = cadenceSchema.safeParse({ name, steps });
  if (!input.success) throw new Error(input.error.issues[0]?.message ?? "Invalid cadence.");
  await createCadence(db, owner.id, { name: input.data.name, steps: input.data.steps });
  revalidatePath("/campaigns");
}

export async function updateCadenceAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const id = String(formData.get("cadenceId") ?? "").trim();
  if (!id) throw new Error("cadenceId required.");
  const raw = extractForm(formData);
  const name = raw.name;
  const stepsRaw = raw.steps;
  let steps: CadenceStep[] | undefined;
  if (stepsRaw) {
    try {
      steps = JSON.parse(stepsRaw) as CadenceStep[];
    } catch {
      throw new Error("Invalid steps JSON.");
    }
  }
  await updateCadence(db, owner.id, id, { ...(name ? { name } : {}), ...(steps ? { steps } : {}) });
  revalidatePath("/campaigns");
}

export async function deleteCadenceAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const id = String(formData.get("cadenceId") ?? "").trim();
  if (!id) throw new Error("cadenceId required.");
  await deleteCadence(db, owner.id, id);
  revalidatePath("/campaigns");
}

export async function attachCadenceToCampaignAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const cadenceId = String(formData.get("cadenceId") ?? "").trim();
  if (!campaignId || !cadenceId) throw new Error("campaignId and cadenceId required.");
  await attachCadenceToCampaign(db, owner.id, campaignId, cadenceId);
  revalidateAll(undefined, campaignId);
}

export async function detachCadenceFromCampaignAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) throw new Error("campaignId required.");
  await detachCadenceFromCampaign(db, owner.id, campaignId);
  revalidateAll(undefined, campaignId);
}

/* -----------------------------------------------------------------
 * Phase D — Webhooks
 * ----------------------------------------------------------------- */

export async function createWebhookAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const url = String(formData.get("url") ?? "").trim();
  const events = String(formData.get("events") ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!url) throw new Error("url required.");
  const secret = crypto.randomUUID(); // auto-generated
  await createWebhook(db, owner.id, { url, secret, events, enabled: true });
  revalidatePath("/settings");
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const id = String(formData.get("webhookId") ?? "").trim();
  if (!id) throw new Error("webhookId required.");
  await deleteWebhook(db, owner.id, id);
  revalidatePath("/settings");
}

export async function testWebhookAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const id = String(formData.get("webhookId") ?? "").trim();
  if (!id) throw new Error("webhookId required.");
  await enqueueDelivery(db, owner.id, {
    webhookId: id,
    ownerId: owner.id,
    event: "webhook_probe",
    payload: { event: "webhook_probe", timestamp: new Date().toISOString() },
  });
  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * Phase D — Notification preferences
 * ----------------------------------------------------------------- */

export async function updateNotificationPrefsAction(
  formData: FormData
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();

  const patch: Partial<NotificationPrefs> = {};
  const emailEnabled = formData.get("emailEnabled");
  if (emailEnabled != null) patch.emailEnabled = emailEnabled === "1";
  const emailAddress = formData.get("emailAddress");
  if (emailAddress != null) patch.emailAddress = String(emailAddress).trim() || undefined;
  const slackEnabled = formData.get("slackEnabled");
  if (slackEnabled != null) patch.slackEnabled = slackEnabled === "1";
  const slackWebhookUrl = formData.get("slackWebhookUrl");
  if (slackWebhookUrl != null) patch.slackWebhookUrl = String(slackWebhookUrl).trim() || undefined;
  const discordEnabled = formData.get("discordEnabled");
  if (discordEnabled != null) patch.discordEnabled = discordEnabled === "1";
  const discordWebhookUrl = formData.get("discordWebhookUrl");
  if (discordWebhookUrl != null) patch.discordWebhookUrl = String(discordWebhookUrl).trim() || undefined;
  const digestFrequency = formData.get("digestFrequency");
  if (digestFrequency === "weekly" || digestFrequency === "never") {
    patch.digestFrequency = digestFrequency;
  }

  await saveNotificationPrefs(db, owner.id, patch);
  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * Phase D — Manual reply sentiment override
 * ----------------------------------------------------------------- */

export async function overrideReplySentimentAction(
  formData: FormData
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  const draftId = String(formData.get("draftId") ?? "").trim();
  const rawSentiment = String(formData.get("sentiment") ?? "").trim();
  if (!draftId) throw new Error("draftId required.");
  const sentimentValues = [
    "interested",
    "needs_info",
    "not_a_fit",
    "unsubscribe",
    "unclear",
  ] as const;
  if (!(sentimentValues as readonly string[]).includes(rawSentiment)) {
    throw new Error("Invalid sentiment value.");
  }
  const sentiment = rawSentiment as (typeof sentimentValues)[number];
  const now = new Date().toISOString();
  await db
    .update(outreachDrafts)
    .set({ replySentiment: sentiment, updatedAt: now })
    .where(and(eq(outreachDrafts.ownerId, owner.id), eq(outreachDrafts.id, draftId)));
  const existing = await getDraft(db, owner.id, draftId);
  if (existing) {
    await createActivity(db, owner.id, {
      leadId: existing.leadId,
      activityType: "reply_logged",
      title: `Reply sentiment overridden → ${sentiment.replace("_", " ")}`,
      metadata: { manual: true, draftId },
    });
  }
  revalidateAll(existing?.leadId);
}

/* -----------------------------------------------------------------
 * Phase D — Auto-decay setting
 * ----------------------------------------------------------------- */

export async function enableAutoDecayAction(days: number): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();
  await upsertAppSetting(db, owner.id, "auto_decay/v1", { enabled: true, days });
  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * Phase E — Billing actions (APPEND ONLY — do not modify above)
 * -----------------------------------------------------------------
 * These actions wrap the billing API routes and are used by the
 * billing section UI. The actual limit enforcement (checkLimit /
 * requireFeature calls inside existing mutations) is intentionally
 * deferred to a follow-up integration pass.
 */

/**
 * Redirect the user to a Stripe Checkout session for the given priceId.
 * Typically called from the BillingSection or billing page.
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  const priceId = formData.get("priceId");
  if (!priceId || typeof priceId !== "string") {
    throw new Error("priceId is required");
  }

  const env = await getRuntimeEnv();
  const baseUrl = env.APP_BASE_URL ?? "http://localhost:3000";

  const { createCheckoutSession } = await import("@/lib/billing/stripe");
  const { assertWithinRateLimit, RateLimitError } = await import("@/lib/rate-limit");

  try {
    assertWithinRateLimit(owner.id, "billing_checkout");
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw new Error("Too many checkout requests. Please wait a moment and try again.");
    }
    throw err;
  }

  const session = await createCheckoutSession({
    workspaceId: owner.id,
    priceId,
    successUrl: `${baseUrl}/billing?checkout=success`,
    cancelUrl: `${baseUrl}/billing?checkout=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
}

/**
 * Redirect the user to the Stripe Customer Portal for their workspace.
 * The workspace must already have a Stripe customer ID.
 */
export async function openBillingPortalAction(): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();

  const { getWorkspace } = await import("@/lib/db/repos/workspaces");
  const workspace = await getWorkspace(db, owner.id);
  const customerId = workspace?.stripeCustomerId;

  if (!customerId) {
    throw new Error(
      "No Stripe customer found for this workspace. Complete a checkout first."
    );
  }

  const env = await getRuntimeEnv();
  const baseUrl = env.BILLING_RETURN_URL ?? env.APP_BASE_URL ?? "http://localhost:3000";

  const { createPortalSession } = await import("@/lib/billing/stripe");
  const session = await createPortalSession({
    customerId,
    returnUrl: `${baseUrl}/settings#billing`,
  });

  redirect(session.url);
}

/**
 * Admin-only: re-fetch the workspace's Stripe subscription and sync the
 * plan + Stripe fields to the database. Useful for debugging webhook misses.
 */
export async function syncBillingStateAction(): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();

  const { getWorkspace, updateStripeFields } = await import("@/lib/db/repos/workspaces");
  const workspace = await getWorkspace(db, owner.id);

  if (!workspace?.stripeSubscriptionId) {
    throw new Error("No Stripe subscription ID on this workspace.");
  }

  const { getSubscription } = await import("@/lib/billing/stripe");
  const { getRuntimeEnv: getEnv } = await import("@/lib/env");
  const env = await getEnv();

  const sub = await getSubscription(workspace.stripeSubscriptionId);

  // Derive plan from the subscription's price ID
  const priceId = sub.items?.data?.[0]?.price?.id;
  let plan: "free" | "freelancer" | "teams" | "studio" = "free";
  if (priceId) {
    if (
      priceId === env.STRIPE_PRICE_ID_FREELANCER_MONTHLY ||
      priceId === env.STRIPE_PRICE_ID_FREELANCER_ANNUAL
    ) {
      plan = "freelancer";
    } else if (
      priceId === env.STRIPE_PRICE_ID_TEAMS_MONTHLY ||
      priceId === env.STRIPE_PRICE_ID_TEAMS_ANNUAL
    ) {
      plan = "teams";
    }
  }

  const trialEndsAt = sub.trial_end
    ? new Date(sub.trial_end * 1000).toISOString()
    : null;

  await updateStripeFields(db, owner.id, {
    plan,
    trialEndsAt,
    customerId: sub.customer,
    subscriptionId: sub.id,
  });

  revalidatePath("/settings");
  revalidatePath("/billing");
}

/* -----------------------------------------------------------------
 * Phase F — Teams + RBAC
 * -----------------------------------------------------------------
 * All appended below. No existing function is modified above.
 * requireRole / requirePermission are NOT called on any existing
 * action in this pass — the integration pass does that.
 * -----------------------------------------------------------------
 */

import {
  createInvite,
  deleteInvite,
} from "@/lib/db/repos/invites";
import {
  addMember,
  removeMember,
  listMembers,
} from "@/lib/db/repos/workspaces";
import { requirePermission, requireRole } from "@/lib/auth/rbac";
import { recordAuditLog } from "@/lib/audit-log/writer";
import { sendEmail } from "@/lib/email/resend";
import { leads as leadsTable, tasks as tasksTable } from "@/lib/db/schema";

/* -----------------------------------------------------------------
 * inviteMemberAction
 * ----------------------------------------------------------------- */

const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "member", "viewer"]),
});

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  requirePermission(owner, "manage_members");

  const input = parseFormOrThrow(formData, inviteMemberSchema);
  const db = await getDb();

  assertWithinRateLimit(owner.id, "invite_send");

  const normalizedEmail = input.email.trim().toLowerCase();

  // Anti-enumeration: silently succeed if already a member
  const { profiles: profilesTable } = await import("@/lib/db/schema");
  const { eq: eqOp } = await import("drizzle-orm");
  const [existingProfile] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eqOp(profilesTable.email, normalizedEmail))
    .limit(1);

  if (existingProfile) {
    const existing = await listMembers(db, owner.id);
    if (existing.some((m) => m.profileId === existingProfile.id)) {
      revalidatePath("/settings");
      return; // anti-enumeration: silent no-op
    }
  }

  const { invite, token } = await createInvite(db, {
    workspaceId: owner.id,
    email: normalizedEmail,
    role: input.role,
    invitedBy: owner.profileId,
  });

  const env = await getRuntimeEnv();
  const appBaseUrl = env.APP_BASE_URL ?? "http://localhost:3000";
  const inviteUrl = `${appBaseUrl}/invite/${token}`;

  await sendEmail({
    to: normalizedEmail,
    subject: `You've been invited to ${owner.workspace.name} on Lead Engine`,
    html: `<p><strong>${owner.fullName ?? owner.email}</strong> invited you to join <strong>${owner.workspace.name}</strong> as a <strong>${input.role}</strong>.</p><p><a href="${inviteUrl}">Accept invitation</a></p><p>Expires in 7 days.</p>`,
    text: `You've been invited to join ${owner.workspace.name} as ${input.role}.\n\nAccept: ${inviteUrl}\n\nExpires in 7 days.`,
  });

  await recordAuditLog(
    owner.id,
    owner.profileId,
    "invited",
    "invite",
    invite.id,
    { email: normalizedEmail, role: input.role }
  );

  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * revokeInviteAction
 * ----------------------------------------------------------------- */

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  requirePermission(owner, "manage_members");

  const inviteId = String(formData.get("inviteId") ?? "").trim();
  if (!inviteId) throw new Error("inviteId required.");

  const db = await getDb();
  await deleteInvite(db, inviteId);

  await recordAuditLog(
    owner.id,
    owner.profileId,
    "deleted",
    "invite",
    inviteId
  );

  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * removeMemberAction
 * ----------------------------------------------------------------- */

export async function removeMemberAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  requirePermission(owner, "manage_members");

  const profileId = String(formData.get("profileId") ?? "").trim();
  if (!profileId) throw new Error("profileId required.");

  const db = await getDb();

  // Prevent removing the sole owner
  const allMembers = await listMembers(db, owner.id);
  const targetMember = allMembers.find((m) => m.profileId === profileId);
  if (!targetMember) throw new Error("Member not found.");
  if (targetMember.role === "owner") {
    const ownerCount = allMembers.filter((m) => m.role === "owner").length;
    if (ownerCount <= 1) {
      throw new Error("Cannot remove the sole owner. Transfer ownership first.");
    }
  }

  // Admins cannot remove other admins or owners
  if (owner.role === "admin" && (targetMember.role === "admin" || targetMember.role === "owner")) {
    throw new Error("Admins cannot remove other admins or owners.");
  }

  await removeMember(db, owner.id, profileId);

  await recordAuditLog(
    owner.id,
    owner.profileId,
    "member_removed",
    "member",
    profileId,
    { removedRole: targetMember.role }
  );

  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * changeMemberRoleAction
 * ----------------------------------------------------------------- */

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const owner = await requirePageOwner();
  requirePermission(owner, "manage_members");

  const profileId = String(formData.get("profileId") ?? "").trim();
  const newRole = String(formData.get("role") ?? "").trim() as "owner" | "admin" | "member" | "viewer";
  if (!profileId) throw new Error("profileId required.");
  if (!["owner", "admin", "member", "viewer"].includes(newRole)) {
    throw new Error("Invalid role.");
  }

  const db = await getDb();
  const allMembers = await listMembers(db, owner.id);
  const targetMember = allMembers.find((m) => m.profileId === profileId);
  if (!targetMember) throw new Error("Member not found.");

  // Cannot demote sole owner
  if (targetMember.role === "owner" && newRole !== "owner") {
    const ownerCount = allMembers.filter((m) => m.role === "owner").length;
    if (ownerCount <= 1) {
      throw new Error("Cannot demote the sole owner. Transfer ownership first.");
    }
  }

  const previousRole = targetMember.role;
  await addMember(db, owner.id, profileId, newRole);

  await recordAuditLog(
    owner.id,
    owner.profileId,
    "role_changed",
    "member",
    profileId,
    { from: previousRole, to: newRole }
  );

  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * transferOwnershipAction
 * ----------------------------------------------------------------- */

export async function transferOwnershipAction(newOwnerProfileId: string): Promise<void> {
  const owner = await requirePageOwner();
  requireRole(owner, "owner");

  if (!newOwnerProfileId) throw new Error("newOwnerProfileId required.");
  if (newOwnerProfileId === owner.profileId) throw new Error("You are already the owner.");

  const db = await getDb();
  const allMembers = await listMembers(db, owner.id);
  const target = allMembers.find((m) => m.profileId === newOwnerProfileId);
  if (!target) throw new Error("Target profile is not a member of this workspace.");

  // Promote new owner then demote current owner to admin
  await addMember(db, owner.id, newOwnerProfileId, "owner");
  await addMember(db, owner.id, owner.profileId, "admin");

  await recordAuditLog(
    owner.id,
    owner.profileId,
    "role_changed",
    "member",
    newOwnerProfileId,
    { action: "ownership_transfer", previousRole: target.role, newRole: "owner" }
  );

  revalidatePath("/settings");
}

/* -----------------------------------------------------------------
 * assignLeadAction
 * ----------------------------------------------------------------- */

export async function assignLeadAction(
  leadId: string,
  assigneeProfileId: string | null
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();

  if (!leadId) throw new Error("leadId required.");

  const now = new Date().toISOString();
  await db
    .update(leadsTable)
    .set({ updatedAt: now })
    .where(and(eq(leadsTable.ownerId, owner.id), eq(leadsTable.id, leadId)));

  // assignedTo is a Phase A migration column — update via raw SQL to avoid
  // the inferred schema missing it in this compilation context
  const { sql: sqlExpr } = await import("drizzle-orm");
  await db.run(sqlExpr`UPDATE leads SET assigned_to = ${assigneeProfileId}, updated_at = ${now} WHERE owner_id = ${owner.id} AND id = ${leadId}`);

  revalidateAll(leadId);
}

/* -----------------------------------------------------------------
 * assignTaskAction
 * ----------------------------------------------------------------- */

export async function assignTaskAction(
  taskId: string,
  assigneeProfileId: string | null
): Promise<void> {
  const owner = await requirePageOwner();
  const db = await getDb();

  if (!taskId) throw new Error("taskId required.");

  const now = new Date().toISOString();
  await db
    .update(tasksTable)
    .set({ updatedAt: now })
    .where(and(eq(tasksTable.ownerId, owner.id), eq(tasksTable.id, taskId)));

  const { sql: sqlExpr } = await import("drizzle-orm");
  await db.run(sqlExpr`UPDATE tasks SET assigned_to = ${assigneeProfileId}, updated_at = ${now} WHERE owner_id = ${owner.id} AND id = ${taskId}`);

  revalidateAll();
}
