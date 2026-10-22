/**
 * Web Intelligence — Stream E: outreach-hook synthesis.
 *
 * Turns the crawler's raw extraction (`CompanyIntel`, people candidates,
 * deduped website findings) and the operator's own service offerings into a
 * fully-populated `OpportunityBrief` the Lead Detail page / outreach draft
 * flow can surface automatically.
 *
 * Design rules (encoded in the system prompt below):
 *   - Only report facts directly stated in the extracted inputs. No invention
 *     of features, decisions, or user data the prospect never published.
 *   - The summary leads with the single most compelling, specific opportunity
 *     grounded in the findings — not generic marketing language.
 *   - When no concrete evidence supports a field, leave it blank.
 *
 * Operational guardrails:
 *   - `GEMINI_API_KEY` missing → returns `null`. The runner falls back to the
 *     deterministic template brief via the existing `generateBriefAction`.
 *   - Any thrown error, HTTP non-OK, malformed JSON, or Zod validation failure
 *     → returns `null`. This module MUST NEVER throw.
 *   - Classifier model (`gemini-2.5-flash-lite`) is used by default — this is
 *     a structured-extraction / scoring task, not long-form generation.
 *   - Output lengths are clamped post-validation so a chatty model can't make
 *     the brief unreadable in the UI.
 */

import { z } from "zod";

import {
  callGemini,
  getGeminiModelClassifier,
  type GeminiModel,
} from "@/lib/ai/gemini";

import type { AuditFinding, ServiceOffering } from "@/lib/demo/types";
import type { NewOpportunityBrief } from "@/lib/db/schema";

import type {
  CompanyIntel,
  ExtractedPersonCandidate,
} from "./types";

/* --------------------------------------------------------------------------
 * Public types
 * -------------------------------------------------------------------------- */

export type SynthesizeInput = {
  intel: CompanyIntel;
  people: ExtractedPersonCandidate[];
  findings: AuditFinding[];
  lead: {
    businessName: string;
    niche: string;
    city: string;
    country: string;
    offer?: string;
  };
  services: ServiceOffering[];
};

/**
 * The subset of a `NewOpportunityBrief` row the runner needs to persist via
 * `createBrief` — everything except id/leadId/createdAt (the repo sets those).
 */
export type SynthesizedBrief = Omit<NewOpportunityBrief, "id" | "leadId" | "createdAt">;

/* --------------------------------------------------------------------------
 * Enforcement constants (clamp lengths)
 * -------------------------------------------------------------------------- */

const MAX_SUMMARY_CHARS = 500;
const MAX_OBSERVATION_CHARS = 300;
const MAX_OPPORTUNITY_CHARS = 400;
const MAX_DELIVERABLE_CHARS = 500;
const MAX_SERVICE_NAME_CHARS = 160;
const MAX_UNKNOWN_CHARS = 240;
const MAX_OBSERVATIONS = 6;
const MAX_UNKNOWNS = 6;

/* --------------------------------------------------------------------------
 * The one-and-only directive the model must obey. Exported so tests can
 * grep the request body for it.
 * -------------------------------------------------------------------------- */

export const SYNTHESIS_SYSTEM_PROMPT = [
  "You turn structured website-intelligence data into an outreach-ready brief for a service business.",
  "Only report what is directly stated in the extracted facts and findings. Do not invent features, decisions, or user data the prospect did not publish.",
  "If you have no concrete evidence, leave the field blank.",
  "Lead the summary with the single most compelling, specific opportunity based on the findings — not generic marketing language.",
  "The confidence rating reflects how directly the findings support the recommended opportunity: 'high' when ≥2 severe website findings tie clearly to one service, 'low' when evidence is thin, 'medium' otherwise.",
  "Return STRICT JSON matching the requested schema. No commentary, no markdown fences.",
].join(" ");

/* --------------------------------------------------------------------------
 * JSON schema (informational — Gemini v1beta responseJsonSchema isn't
 * strictly enforced server-side, so we validate again with Zod below).
 * -------------------------------------------------------------------------- */

export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          observation: { type: "string" },
          evidence: { type: "string" },
          evidenceUrl: { type: "string" },
        },
        required: ["observation", "evidence"],
      },
    },
    possibleOpportunity: { type: "string" },
    recommendedService: { type: "string" },
    suggestedDeliverable: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    unknowns: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "observations",
    "possibleOpportunity",
    "recommendedService",
    "suggestedDeliverable",
    "confidence",
    "unknowns",
  ],
} as const;

const ObservationSchema = z.object({
  observation: z.string().min(1),
  evidence: z.string().min(1),
  evidenceUrl: z.string().optional(),
});

const BriefSchema = z.object({
  summary: z.string().min(1),
  observations: z.array(ObservationSchema),
  possibleOpportunity: z.string(),
  recommendedService: z.string(),
  suggestedDeliverable: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  unknowns: z.array(z.string()),
});

/* --------------------------------------------------------------------------
 * Public entry point
 * -------------------------------------------------------------------------- */

/**
 * Synthesize an AI-authored opportunity brief. Returns `null` when the
 * Gemini API key is missing or any step fails — the runner then falls back
 * to the deterministic template brief.
 */
export async function synthesizeOutreachHooks(
  input: SynthesizeInput,
  env: Readonly<Record<string, string | undefined>>
): Promise<SynthesizedBrief | null> {
  if (!env.GEMINI_API_KEY) return null;

  let model: GeminiModel;
  try {
    model = await getGeminiModelClassifier();
  } catch {
    // The model-selector reads env itself; if it fails we can still fall
    // back to the default classifier model. Keep the synthesis attempt alive.
    model = "gemini-2.5-flash-lite";
  }

  const userPrompt = buildUserPrompt(input);

  let text: string;
  try {
    const result = await callGemini({
      model,
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      userPrompt,
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      maxOutputTokens: 1024,
      temperature: 0.2,
    });
    text = result.text ?? "";
  } catch {
    return null;
  }

  if (!text || text === "__gemini_stub__") return null;

  const parsed = safeParseJson(text);
  if (!parsed) return null;

  const validated = BriefSchema.safeParse(parsed);
  if (!validated.success) return null;

  return clampAndFinalize(validated.data, input, model);
}

/* --------------------------------------------------------------------------
 * Prompt construction
 * -------------------------------------------------------------------------- */

function buildUserPrompt(input: SynthesizeInput): string {
  const { intel, people, findings, lead, services } = input;

  const companyLines: string[] = [];
  companyLines.push(`Business name: ${lead.businessName}`);
  if (intel.name && intel.name !== lead.businessName) {
    companyLines.push(`Observed site name: ${intel.name}`);
  }
  companyLines.push(`Domain: ${intel.domain}`);
  const location = [lead.city, lead.country].filter(Boolean).join(", ");
  if (location) companyLines.push(`Location: ${location}`);
  if (lead.niche) companyLines.push(`Niche: ${lead.niche}`);
  if (lead.offer) companyLines.push(`Operator offer context: ${lead.offer}`);
  if (intel.description) companyLines.push(`Site description: ${intel.description}`);
  if (intel.services.length > 0) {
    companyLines.push(`Observed services: ${intel.services.slice(0, 10).join(", ")}`);
  }
  if (intel.techIndicators.length > 0) {
    companyLines.push(`Tech indicators: ${intel.techIndicators.slice(0, 8).join(", ")}`);
  }

  // Top 5 website findings — code, title, severity, affected URL(s).
  const topFindings = findings.slice(0, 5);
  const findingsBlock =
    topFindings.length > 0
      ? topFindings
          .map((f, i) => {
            const parts = [
              `${i + 1}. [${f.severity.toUpperCase()}] ${f.code} — ${f.title}`,
            ];
            if (f.evidence) parts.push(`   evidence: ${f.evidence}`);
            if (f.evidenceUrl) parts.push(`   url: ${f.evidenceUrl}`);
            return parts.join("\n");
          })
          .join("\n")
      : "(no website findings surfaced)";

  // Key people — cap at 5 so the prompt stays small.
  const peopleBlock =
    people.length > 0
      ? people
          .slice(0, 5)
          .map((p, i) => {
            const title = p.jobTitle ? ` — ${p.jobTitle}` : "";
            return `${i + 1}. ${p.fullName}${title} (source: ${p.sourceUrl})`;
          })
          .join("\n")
      : "(no decision-makers extracted)";

  // Operator services — the model picks the recommendedService from this list.
  const servicesBlock =
    services.length > 0
      ? services
          .filter((s) => s.isActive !== false)
          .slice(0, 10)
          .map((s, i) => {
            const bits = [`${i + 1}. ${s.name}`];
            if (s.description) bits.push(`   what it is: ${s.description}`);
            if (s.idealCustomer) bits.push(`   ideal for: ${s.idealCustomer}`);
            if (s.valueProposition) bits.push(`   value prop: ${s.valueProposition}`);
            return bits.join("\n");
          })
          .join("\n")
      : "(operator has no service offerings on file — recommendedService can be left blank)";

  return [
    "COMPANY",
    companyLines.join("\n"),
    "",
    "TOP WEBSITE FINDINGS (deduped)",
    findingsBlock,
    "",
    "DECISION-MAKERS",
    peopleBlock,
    "",
    "OPERATOR SERVICE OFFERINGS (pick the single best match for recommendedService)",
    servicesBlock,
    "",
    "Return a JSON object with these fields:",
    "- summary (string, <= 500 chars, lead with the single most compelling opportunity, grounded in the findings)",
    "- observations: array of { observation, evidence, evidenceUrl? } — one line per bullet, each <= 300 chars, up to 6 bullets",
    "- possibleOpportunity (string, <= 400 chars, concrete)",
    "- recommendedService (string, exactly matches one service name above or empty if none fit)",
    "- suggestedDeliverable (string, concrete scope — a page count, a workflow, a timeline)",
    "- confidence: 'low' | 'medium' | 'high'",
    "- unknowns: array of short questions you'd want a human to confirm before sending (<= 6 items)",
  ].join("\n");
}

/* --------------------------------------------------------------------------
 * Response normalization + clamping
 * -------------------------------------------------------------------------- */

function safeParseJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd();
}

function clampAndFinalize(
  data: z.infer<typeof BriefSchema>,
  input: SynthesizeInput,
  model: GeminiModel
): SynthesizedBrief {
  // If the model named a service, prefer the exact operator-string so UI
  // comparisons stay strict. Fall back to the model string otherwise.
  const matched = input.services.find(
    (s) => s.name.toLowerCase().trim() === data.recommendedService.toLowerCase().trim()
  );
  const recommendedService = clamp(
    matched?.name ?? data.recommendedService ?? "",
    MAX_SERVICE_NAME_CHARS
  );

  const observations = data.observations
    .slice(0, MAX_OBSERVATIONS)
    .map((o) => {
      const base: {
        observation: string;
        evidence: string;
        evidenceUrl?: string;
      } = {
        observation: clamp(o.observation, MAX_OBSERVATION_CHARS),
        evidence: clamp(o.evidence, MAX_OBSERVATION_CHARS),
      };
      if (o.evidenceUrl && o.evidenceUrl.length > 0) {
        base.evidenceUrl = o.evidenceUrl;
      }
      return base;
    });

  const unknowns = data.unknowns
    .slice(0, MAX_UNKNOWNS)
    .map((u) => clamp(u, MAX_UNKNOWN_CHARS))
    .filter((u) => u.length > 0);

  return {
    campaignId: null,
    summary: clamp(data.summary, MAX_SUMMARY_CHARS),
    observations,
    possibleOpportunity: clamp(data.possibleOpportunity, MAX_OPPORTUNITY_CHARS),
    recommendedService,
    suggestedDeliverable: clamp(data.suggestedDeliverable, MAX_DELIVERABLE_CHARS),
    confidence: data.confidence,
    unknowns,
    source: "ai",
    modelMetadata: { provider: "gemini", model },
  };
}
