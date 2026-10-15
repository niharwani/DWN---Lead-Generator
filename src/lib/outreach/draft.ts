/**
 * Outreach draft builder.
 *
 * Composes a draft from the lead + audit + brief + service context. Two paths:
 *   1. Template fallback (pure, deterministic, always available) — spec §11.
 *   2. Anthropic Claude via REST — only when ANTHROPIC_API_KEY is set.
 *
 * The provider is a thin fetch wrapper (no SDK) so the module runs on Workers.
 * Model output is parsed as JSON and validated with Zod; any parsing or
 * validation failure falls back to the template path with a `fallback_reason`
 * in the evidence list, so the UI always gets a usable draft.
 */

import { z } from "zod";
import type {
  Lead,
  OpportunityBrief,
  OutreachChannel,
  ServiceOffering,
  WebsiteAudit,
} from "@/lib/demo/types";

export type BuildDraftInput = {
  lead: Lead;
  brief?: OpportunityBrief;
  audit?: WebsiteAudit;
  services: ServiceOffering[];
  channel?: OutreachChannel;
  studioName?: string;
};

export type DraftOutput = {
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  personalizationEvidence: string[];
  source: "template" | "ai";
};

const DEFAULT_STUDIO = "Design with Nihar";

function pickChannel(lead: Lead, requested?: OutreachChannel): OutreachChannel {
  if (requested) return requested;
  if (lead.publicEmail) return "email";
  if (lead.websiteUrl) return "contact_form";
  return "other";
}

function pickService(
  brief: OpportunityBrief | undefined,
  services: ServiceOffering[]
): ServiceOffering | undefined {
  if (brief?.recommendedService) {
    const match = services.find((s) => s.name === brief.recommendedService);
    if (match) return match;
  }
  return services.find((s) => s.isActive) ?? services[0];
}

/**
 * Picks the single most compelling, specific, numeric observation from an
 * audit to lead the outreach body with. Returns null when the audit is
 * missing, not successful, or has no notable finding to cite. The ordering
 * mirrors the spec priority: concrete numeric metrics beat qualitative
 * findings, and only the top signal is surfaced so the opener stays sharp.
 */
export function pickHeadlineObservation(
  audit: WebsiteAudit | undefined
): { headline: string; evidenceLine: string } | null {
  if (!audit || audit.status !== "success") return null;

  const findings = audit.findings;
  const findingByCode = (patterns: string[]) =>
    findings.find((f) => patterns.some((p) => f.code === p || f.code.includes(p)));

  const weight = audit.metrics?.pageWeightBytes;
  if (typeof weight === "number" && weight > 2_500_000) {
    const mb = (weight / 1_000_000).toFixed(1);
    return {
      headline: `Your homepage weighs ${mb} MB — most sites in your range come in around 1.5 MB, which affects first paint on mobile.`,
      evidenceLine: `Audit metric cited: pageWeightBytes=${weight} → ${mb} MB`,
    };
  }

  const https = findingByCode(["missing_https", "no_https"]);
  if (https) {
    return {
      headline:
        "Your site is still served over HTTP — browsers now show visitors a 'Not secure' warning, which measurably hurts form conversions.",
      evidenceLine: `Audit finding cited: ${https.code}`,
    };
  }

  const viewport = findingByCode(["missing_viewport"]);
  if (viewport) {
    return {
      headline:
        "Your homepage is missing a mobile viewport tag, so it loads at desktop width on phones — likely why mobile users bounce.",
      evidenceLine: `Audit finding cited: ${viewport.code}`,
    };
  }

  const contact = findingByCode(["missing_contact_path", "weak_contact_path"]);
  if (contact) {
    return {
      headline:
        "We couldn't find a clear way to contact you from your site — no visible email, phone, or contact page in the first scroll.",
      evidenceLine: `Audit finding cited: ${contact.code}`,
    };
  }

  const alt = findingByCode(["images_without_alt", "missing_alt_text"]);
  if (alt?.evidence) {
    const match = alt.evidence.match(/\d+/);
    if (match) {
      const count = Number(match[0]);
      return {
        headline: `${count} images on your homepage are missing alt text, which blocks screen readers and hurts search ranking.`,
        evidenceLine: `Audit finding cited: ${alt.code} (${count} images)`,
      };
    }
  }

  const load = audit.metrics?.loadMs;
  if (typeof load === "number" && load > 4000) {
    const s = (load / 1000).toFixed(1);
    return {
      headline: `Your homepage took ${s}s to respond when we tested it — that's past the 3s mark where most mobile visitors leave.`,
      evidenceLine: `Audit metric cited: loadMs=${load} → ${s}s`,
    };
  }

  return null;
}

function pickFallbackFinding(audit: WebsiteAudit): string | null {
  const high = audit.findings.find((f) => f.severity === "high");
  if (high) return high.title;
  const medium = audit.findings.find((f) => f.severity === "medium");
  if (medium) return medium.title;
  return null;
}

export function buildTemplateDraft(input: BuildDraftInput): DraftOutput {
  const channel = pickChannel(input.lead, input.channel);
  const studio = input.studioName ?? DEFAULT_STUDIO;
  const service = pickService(input.brief, input.services);
  const observations = input.brief?.observations ?? [];
  const briefObservation = observations[0]?.observation;
  const headline = pickHeadlineObservation(input.audit);

  let auditNote: string;
  if (headline) {
    auditNote = headline.headline;
  } else if (input.audit?.status === "success") {
    const fallbackFinding = pickFallbackFinding(input.audit);
    const base = `We ran a quick public audit of ${input.lead.websiteUrl ?? "your site"} and noticed ${input.audit.findings.length} items worth discussing.`;
    auditNote = fallbackFinding ? `${base} The one that stood out: ${fallbackFinding}.` : base;
  } else if (input.lead.websiteUrl) {
    auditNote = `We took a look at ${input.lead.websiteUrl} to prepare for this note.`;
  } else {
    auditNote = `We came across ${input.lead.businessName} and wanted to introduce ourselves.`;
  }

  const opportunity =
    input.brief?.possibleOpportunity ??
    (service
      ? `We think ${service.name.toLowerCase()} could help you move faster.`
      : "We'd love to understand what you're working on.");

  const subject =
    channel === "email"
      ? `Quick note for ${input.lead.businessName} from ${studio}`
      : null;

  const body = [
    `Hi ${input.lead.businessName} team,`,
    "",
    auditNote,
    briefObservation ? `In particular: ${briefObservation}` : null,
    "",
    opportunity,
    service?.valueProposition
      ? `A bit about us: ${service.valueProposition}`
      : null,
    "",
    "If this feels off, no worries at all — I won't follow up again unless you reply.",
    "",
    `— ${studio}`,
  ]
    .filter(Boolean)
    .join("\n");

  const evidence: string[] = [];
  if (input.lead.websiteUrl) evidence.push(`Website on file: ${input.lead.websiteUrl}`);
  if (input.audit?.status === "success")
    evidence.push(`Audit ${input.audit.auditVersion}: ${input.audit.findings.length} findings`);
  if (headline) evidence.push(headline.evidenceLine);
  if (input.brief) evidence.push(`Brief confidence: ${input.brief.confidence}`);
  if (service) evidence.push(`Matched service: ${service.name}`);

  return {
    channel,
    subject,
    body,
    personalizationEvidence: evidence,
    source: "template",
  };
}

/* -----------------------------------------------------------------
 * Anthropic Claude provider (optional)
 * ----------------------------------------------------------------- */

const aiDraftSchema = z.object({
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(20).max(5000),
  personalization_evidence: z.array(z.string().min(3).max(400)).min(1).max(6),
});

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function buildAiDraft(
  input: BuildDraftInput,
  env: Readonly<Record<string, string | undefined>>
): Promise<DraftOutput> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const channel = pickChannel(input.lead, input.channel);
  const service = pickService(input.brief, input.services);
  const studio = input.studioName ?? DEFAULT_STUDIO;
  const headline = pickHeadlineObservation(input.audit);

  const context = {
    studio,
    channel,
    lead: {
      name: input.lead.businessName,
      niche: input.lead.niche,
      city: input.lead.city,
      website: input.lead.websiteUrl ?? null,
      publicEmail: input.lead.publicEmail ?? null,
      scoreBand: input.lead.score?.band ?? null,
    },
    recommendedService: service
      ? { name: service.name, valueProposition: service.valueProposition }
      : null,
    brief: input.brief
      ? {
          summary: input.brief.summary,
          observations: input.brief.observations.slice(0, 4),
          possibleOpportunity: input.brief.possibleOpportunity,
          confidence: input.brief.confidence,
        }
      : null,
    audit:
      input.audit && input.audit.status === "success"
        ? {
            findings: input.audit.findings.slice(0, 4).map((f) => ({
              title: f.title,
              severity: f.severity,
              description: f.description,
            })),
            topObservation: headline?.headline ?? null,
          }
        : null,
  };

  const systemPrompt =
    "You draft short, grounded, personalized outreach notes for a small design/software studio. " +
    "Rules: never fabricate facts not present in the provided context; cite at least one concrete observation; " +
    "when audit.topObservation is present you MUST use that exact specific observation in the first sentence of the body, verbatim or very lightly rephrased, preserving every number it contains; " +
    "keep the body under 180 words; sign off from the studio name provided; be respectful and offer an easy opt-out. " +
    "Return ONLY valid JSON matching the schema: " +
    '{ "subject": string|null, "body": string, "personalization_evidence": string[] }. ' +
    "Set subject to null for non-email channels.";

  const userPrompt =
    `Context:\n${JSON.stringify(context, null, 2)}\n\n` +
    `Produce a ${channel} draft for ${input.lead.businessName}. ` +
    `personalization_evidence must list the specific pieces of context you drew from.`;

  const resp = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("")
    .trim();

  const jsonText = extractJson(text);
  const parsed = aiDraftSchema.safeParse(JSON.parse(jsonText));
  if (!parsed.success) {
    throw new Error(`AI output failed schema: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }

  return {
    channel,
    subject: channel === "email" ? parsed.data.subject ?? null : null,
    body: parsed.data.body,
    personalizationEvidence: parsed.data.personalization_evidence,
    source: "ai",
  };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}
