/**
 * Claude Haiku reply-triage classifier.
 *
 * Takes the plain-text snippet of an inbound reply and returns a structured
 * classification. Falls back to `unclear` on any failure so the cron never
 * crashes on a single bad reply.
 *
 * Model is configurable via ANTHROPIC_MODEL_HAIKU (default claude-haiku-4-5).
 * Prompts are kept under 1 K input tokens for cost control.
 */

import { z } from "zod";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_HAIKU_MODEL = "claude-haiku-4-5";

export const replySentimentValues = [
  "interested",
  "needs_info",
  "not_a_fit",
  "unsubscribe",
  "unclear",
] as const;

export type ReplySentiment = (typeof replySentimentValues)[number];

export type TriageResult = {
  class: ReplySentiment;
  reason: string;
  suggested_next_action?: string;
};

const triageSchema = z.object({
  class: z.enum(replySentimentValues),
  reason: z.string().min(1).max(400),
  suggested_next_action: z.string().max(400).optional(),
});

const FALLBACK: TriageResult = {
  class: "unclear",
  reason: "Classifier unavailable — needs manual review.",
};

const SYSTEM_PROMPT =
  "You classify replies to cold outreach emails for a small design/software studio. " +
  "Return ONLY valid JSON with keys: class (one of: interested, needs_info, not_a_fit, unsubscribe, unclear), " +
  "reason (1-2 sentences), suggested_next_action (optional, brief). " +
  "Use 'unsubscribe' if the sender asks to stop being contacted. " +
  "Use 'interested' if they want to learn more or schedule a call. " +
  "Use 'needs_info' if they ask a clarifying question. " +
  "Use 'not_a_fit' if they politely decline or are not interested. " +
  "Use 'unclear' if the intent cannot be determined.";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

/**
 * Classify an inbound reply snippet. Never throws — any failure returns
 * `{ class: 'unclear', reason: '...' }`.
 */
export async function classifyReply(
  snippet: string,
  env: Readonly<Record<string, string | undefined>>
): Promise<TriageResult> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return { ...FALLBACK, reason: "ANTHROPIC_API_KEY not configured." };

  const model = env.ANTHROPIC_MODEL_HAIKU ?? DEFAULT_HAIKU_MODEL;

  // Truncate to keep under 1K input tokens (~750 chars ≈ ~250 tokens for snippet)
  const truncated = snippet.slice(0, 600);

  try {
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Classify this reply:\n\n${truncated}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      return { ...FALLBACK, reason: `Anthropic HTTP ${resp.status}` };
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
    const parsed = triageSchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) {
      return { ...FALLBACK, reason: "Schema validation failed." };
    }
    return parsed.data;
  } catch {
    return FALLBACK;
  }
}
