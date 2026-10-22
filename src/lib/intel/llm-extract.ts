/**
 * LLM extraction fallback for Web Intelligence.
 *
 * The heuristic extractor (`src/lib/intel/extract.ts`) relies on structured
 * cues — JSON-LD, "Name — Title" headings, bold-name patterns. On image-card
 * team pages, unconventional layouts, or sites that render people inside
 * client-side components, those heuristics return nothing.
 *
 * This module activates Gemini (via the plain-fetch `callGemini` wrapper) to
 * read a small number of priority pages and return structured people +
 * company intel. We stay inside the repo guardrails:
 *   - Only runs when `GEMINI_API_KEY` is configured (otherwise returns input
 *     unchanged — never throws).
 *   - Pages are re-fetched through `auditFetch` so the SSRF guard, byte cap,
 *     and redirect validation still apply.
 *   - Hard cap of {@link MAX_PAGES_FOR_LLM} LLM calls per crawl keeps cost
 *     bounded.
 *   - System prompt forbids invention: "Only report what is directly stated".
 *   - Merge is fill-only: heuristic intel values are never overwritten; higher
 *     confidence wins on duplicate people.
 *
 * Any LLM / network / JSON error is caught and swallowed — the caller receives
 * the heuristic input unchanged. The crawl itself must never fail because of
 * the LLM fallback.
 */

import { parse as parseHtml } from "node-html-parser";

import { auditFetch } from "@/lib/audit/fetcher";
import { callGemini, getGeminiModelClassifier } from "@/lib/ai/gemini";

import type {
  CompanyIntel,
  Confidence,
  ExtractedPersonCandidate,
} from "./types";

/* --------------------------------------------------------------------------
 * Config
 * -------------------------------------------------------------------------- */

/** Hard cap on LLM calls per crawl — one call per priority page. */
export const MAX_PAGES_FOR_LLM = 3;

/** Rough character cap for the per-page prompt body. Keeps token cost sane. */
const MAX_PROMPT_CHARS = 8_000;

/**
 * URL-path patterns that are strong signals for a team / about / contact page.
 * Case-insensitive. Match anywhere in the path.
 */
const PRIORITY_PATH_RE =
  /\/(about|team|leadership|people|our[- ]team|contact|our[- ]people|our[- ]leadership|founders|staff)(\/|$|\?|#|$)/i;

/**
 * Title keywords that also mark a page as "worth asking the LLM about".
 */
const PRIORITY_TITLE_RE = /\b(team|about|leadership|people|our team|contact|founders|staff)\b/i;

/* --------------------------------------------------------------------------
 * Input / output types
 * -------------------------------------------------------------------------- */

export type LlmPageInput = {
  url: string;
  title?: string;
  /** Cleaned visible text — pre-extracted by the caller. */
  text: string;
};

export type EnrichInput = {
  intel: CompanyIntel;
  people: ExtractedPersonCandidate[];
  /** Minimal shape — the runner builds this from the crawler's page records. */
  pages: Array<{ url: string; title?: string; text?: string }>;
};

export type EnrichResult = {
  intel: CompanyIntel;
  people: ExtractedPersonCandidate[];
};

/* --------------------------------------------------------------------------
 * Shape of the Gemini JSON response (duck-typed; defensively validated)
 * -------------------------------------------------------------------------- */

type LlmPerson = {
  fullName?: unknown;
  jobTitle?: unknown;
  profileUrl?: unknown;
  evidence?: unknown;
  confidence?: unknown;
};

type LlmCompanyIntel = {
  name?: unknown;
  description?: unknown;
  services?: unknown;
  address?: unknown;
  city?: unknown;
  region?: unknown;
  country?: unknown;
  contactEmails?: unknown;
};

type LlmResponse = {
  people?: unknown;
  companyIntel?: unknown;
};

/* --------------------------------------------------------------------------
 * Public helpers
 * -------------------------------------------------------------------------- */

/**
 * Strip <script>/<style> blocks and collapse whitespace. Returns the visible
 * text of the document, suitable for sending to an LLM.
 *
 * Uses `node-html-parser` (already a dep) so this is Workers-compatible.
 */
export function cleanVisibleText(html: string): string {
  if (!html) return "";
  const doc = parseHtml(html, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { script: true, style: true, pre: false },
  });
  // Remove nodes that contribute no human-visible text.
  for (const tag of ["script", "style", "noscript", "svg", "template"]) {
    for (const el of doc.querySelectorAll(tag)) {
      el.remove();
    }
  }
  const raw = doc.text || "";
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * JSON schema (informational — Gemini v1beta responseJsonSchema isn't fully
 * enforced; we validate client-side after the call). Exported so tests can
 * assert the schema sent.
 */
export const LLM_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fullName: { type: "string" },
          jobTitle: { type: "string" },
          profileUrl: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["fullName", "confidence"],
      },
    },
    companyIntel: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        services: { type: "array", items: { type: "string" } },
        address: { type: "string" },
        city: { type: "string" },
        region: { type: "string" },
        country: { type: "string" },
        contactEmails: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

/* --------------------------------------------------------------------------
 * Main entry point
 * -------------------------------------------------------------------------- */

/**
 * Enrich a crawl outcome with Gemini-sourced people + intel. Never throws.
 */
export async function enrichWithLlm(
  input: EnrichInput,
  env: Readonly<Record<string, string | undefined>>
): Promise<EnrichResult> {
  // Short-circuit: no API key → never touch Gemini, return input unchanged.
  if (!env.GEMINI_API_KEY) {
    return { intel: input.intel, people: input.people };
  }

  // Pick the most promising pages. Falls back to the seed page if nothing matches.
  const picked = pickPagesForLlm(input.pages).slice(0, MAX_PAGES_FOR_LLM);
  if (picked.length === 0) {
    return { intel: input.intel, people: input.people };
  }

  // Any single page's LLM/network failure must not abort the rest.
  const llmResponses: LlmResponse[] = [];
  for (const page of picked) {
    try {
      const resp = await callLlmForPage(page);
      if (resp) llmResponses.push(resp);
    } catch {
      // Swallow — the heuristic result is still returned.
    }
  }

  // Merge all LLM responses into the heuristic baseline.
  let people = [...input.people];
  let intel: CompanyIntel = input.intel;
  for (let i = 0; i < llmResponses.length; i++) {
    const resp = llmResponses[i]!;
    const source = picked[i]!;
    people = mergePeople(people, parsePeople(resp, source.url));
    intel = mergeIntelFillOnly(intel, parseIntel(resp));
  }

  return { intel, people };
}

/* --------------------------------------------------------------------------
 * Page selection
 * -------------------------------------------------------------------------- */

/**
 * Rank the crawl pages: priority-path matches first, then priority-title
 * matches, then everything else. If nothing matches, return just the seed
 * (first page in the input). Pages are returned in rank order.
 *
 * Pages lacking an obvious URL are dropped.
 */
export function pickPagesForLlm(
  pages: Array<{ url: string; title?: string; text?: string }>
): Array<{ url: string; title?: string; text?: string }> {
  if (pages.length === 0) return [];

  type Scored = {
    page: { url: string; title?: string; text?: string };
    score: number;
  };
  const scored: Scored[] = [];
  for (const p of pages) {
    if (!p.url) continue;
    let score = 0;
    try {
      const pathname = new URL(p.url).pathname;
      if (PRIORITY_PATH_RE.test(pathname)) score += 10;
    } catch {
      /* ignore unparseable URL */
    }
    if (p.title && PRIORITY_TITLE_RE.test(p.title)) score += 5;
    scored.push({ page: p, score });
  }
  const matched = scored.filter((s) => s.score > 0);
  if (matched.length > 0) {
    matched.sort((a, b) => b.score - a.score);
    return matched.map((s) => s.page);
  }
  // No priority match → fall back to the seed (first page).
  const first = pages[0];
  return first ? [first] : [];
}

/* --------------------------------------------------------------------------
 * Per-page LLM call
 * -------------------------------------------------------------------------- */

async function callLlmForPage(
  page: { url: string; title?: string; text?: string }
): Promise<LlmResponse | null> {
  // Ensure we have text to send. If the caller didn't pre-populate `text`,
  // re-fetch the page through auditFetch (SSRF-guarded, byte-capped).
  let text = page.text ?? "";
  if (!text) {
    const fetched = await auditFetch(page.url);
    if (!fetched.ok) return null;
    text = cleanVisibleText(fetched.html);
  }
  if (!text) return null;
  if (text.length > MAX_PROMPT_CHARS) text = text.slice(0, MAX_PROMPT_CHARS);

  const model = await getGeminiModelClassifier();

  const systemPrompt =
    "You extract company and people information from a single public web page. " +
    "Only report what is directly stated on the page. Do not invent people, titles, " +
    "or facts. If a field is unknown, omit it. Return STRICT JSON matching the " +
    "requested schema; do not include commentary or markdown fences.";

  const userPrompt = buildUserPrompt(page, text);

  const result = await callGemini({
    model,
    systemPrompt,
    userPrompt,
    responseJsonSchema: LLM_RESPONSE_SCHEMA,
    maxOutputTokens: 1024,
    temperature: 0.1,
  });

  if (!result.text || result.text === "__gemini_stub__") return null;

  return safeParseJson(result.text);
}

function buildUserPrompt(
  page: { url: string; title?: string },
  text: string
): string {
  const titleLine = page.title ? `Page title: ${page.title}\n` : "";
  return (
    `Source URL: ${page.url}\n` +
    titleLine +
    `\nSchema:\n` +
    `{\n` +
    `  "people": [{"fullName": string, "jobTitle"?: string, "profileUrl"?: string, "evidence"?: string, "confidence": "low"|"medium"|"high"}],\n` +
    `  "companyIntel": {"name"?: string, "description"?: string, "services"?: string[], "address"?: string, "city"?: string, "region"?: string, "country"?: string, "contactEmails"?: string[]}\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Only include people whose name AND role are visible on this page.\n` +
    `- Confidence "high" when the name sits next to an explicit title; "medium" when title is implied; "low" when uncertain.\n` +
    `- Do NOT guess emails, phones, or titles that are not on the page.\n` +
    `- Omit any field you cannot confirm from the text below.\n\n` +
    `Page text:\n"""\n${text}\n"""`
  );
}

/* --------------------------------------------------------------------------
 * Response parsing + merging
 * -------------------------------------------------------------------------- */

function safeParseJson(raw: string): LlmResponse | null {
  // Strip any ```json fences the model may have added despite instructions.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === "object") return parsed as LlmResponse;
  } catch {
    // Not valid JSON — try to extract a JSON object substring as a last resort.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as unknown;
        if (parsed && typeof parsed === "object") return parsed as LlmResponse;
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

function parsePeople(
  resp: LlmResponse,
  sourceUrl: string
): ExtractedPersonCandidate[] {
  const raw = resp.people;
  if (!Array.isArray(raw)) return [];
  const out: ExtractedPersonCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as LlmPerson;
    const fullName = asString(p.fullName);
    if (!fullName) continue;
    const confidence = asConfidence(p.confidence);
    out.push({
      fullName,
      jobTitle: asString(p.jobTitle),
      profileUrl: asString(p.profileUrl),
      sourceUrl,
      evidence: asString(p.evidence) ?? `Gemini extraction from ${sourceUrl}`,
      confidence,
    });
  }
  return out;
}

function parseIntel(resp: LlmResponse): Partial<CompanyIntel> {
  const raw = resp.companyIntel;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as LlmCompanyIntel;
  const patch: Partial<CompanyIntel> = {};
  const name = asString(r.name);
  if (name) patch.name = name;
  const description = asString(r.description);
  if (description) patch.description = description;
  const services = asStringArray(r.services);
  if (services.length > 0) patch.services = services;
  const address = asString(r.address);
  if (address) patch.address = address;
  const city = asString(r.city);
  if (city) patch.city = city;
  const region = asString(r.region);
  if (region) patch.region = region;
  const country = asString(r.country);
  if (country) patch.country = country;
  const emails = asStringArray(r.contactEmails).map((e) => e.toLowerCase());
  if (emails.length > 0) patch.emails = emails;
  return patch;
}

/* --------------------------------------------------------------------------
 * Merge logic
 * -------------------------------------------------------------------------- */

const CONF_RANK: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

/**
 * Dedup people by case-insensitive full name. When both the heuristic and the
 * LLM report the same person, keep the entry with higher confidence (ties go
 * to the heuristic because it has concrete DOM evidence).
 */
export function mergePeople(
  heuristic: ExtractedPersonCandidate[],
  llm: ExtractedPersonCandidate[]
): ExtractedPersonCandidate[] {
  const byKey = new Map<string, ExtractedPersonCandidate>();
  for (const p of heuristic) {
    byKey.set(p.fullName.toLowerCase(), p);
  }
  for (const p of llm) {
    const key = p.fullName.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
      continue;
    }
    const rExisting = CONF_RANK[existing.confidence] ?? 2;
    const rNew = CONF_RANK[p.confidence] ?? 2;
    if (rNew > rExisting) {
      // Prefer LLM but preserve the existing jobTitle / profileUrl when LLM omits them.
      byKey.set(key, {
        fullName: existing.fullName, // keep heuristic casing to stay deterministic
        jobTitle: p.jobTitle ?? existing.jobTitle,
        profileUrl: p.profileUrl ?? existing.profileUrl,
        sourceUrl: p.sourceUrl,
        evidence: p.evidence ?? existing.evidence,
        confidence: p.confidence,
      });
    }
    // Else: keep heuristic (ties, lower LLM confidence)
  }
  return Array.from(byKey.values());
}

/**
 * Fill-only merge for CompanyIntel: non-empty heuristic values are preserved;
 * LLM only adds missing fields. Email list is union-deduped.
 */
export function mergeIntelFillOnly(
  base: CompanyIntel,
  patch: Partial<CompanyIntel>
): CompanyIntel {
  const out: CompanyIntel = { ...base };
  if (!out.name && patch.name) out.name = patch.name;
  if (!out.description && patch.description) out.description = patch.description;
  if (out.services.length === 0 && patch.services && patch.services.length > 0) {
    out.services = patch.services;
  }
  if (!out.address && patch.address) out.address = patch.address;
  if (!out.city && patch.city) out.city = patch.city;
  if (!out.region && patch.region) out.region = patch.region;
  if (!out.country && patch.country) out.country = patch.country;
  if (patch.emails && patch.emails.length > 0) {
    const existing = new Set(out.emails.map((e) => e.toLowerCase()));
    const merged = [...out.emails];
    for (const e of patch.emails) {
      const low = e.toLowerCase();
      if (!existing.has(low)) {
        merged.push(low);
        existing.add(low);
      }
    }
    out.emails = merged;
  }
  return out;
}

/* --------------------------------------------------------------------------
 * Tiny coercion helpers
 * -------------------------------------------------------------------------- */

function asString(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }
  return undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = asString(item);
    if (s) out.push(s);
  }
  return out;
}

function asConfidence(v: unknown): Confidence {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}
