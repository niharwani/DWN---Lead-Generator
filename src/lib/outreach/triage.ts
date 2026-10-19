/**
 * Gemini reply-triage classifier.
 *
 * Takes the plain-text snippet of an inbound reply and returns a structured
 * classification. Falls back to `unclear` on any failure so the cron never
 * crashes on a single bad reply.
 *
 * Model is configurable via GEMINI_MODEL_CLASSIFIER (default gemini-2.5-flash-lite).
 * Prompts are kept under 1 K input tokens for cost control.
 */

import { z } from "zod";
import { callGemini, getGeminiModelClassifier } from "@/lib/ai/gemini";

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
  const key = env.GEMINI_API_KEY;
  if (!key) return { ...FALLBACK, reason: "GEMINI_API_KEY not configured." };

  const model = await getGeminiModelClassifier();

  // Truncate to keep under 1K input tokens (~750 chars ≈ ~250 tokens for snippet)
  const truncated = snippet.slice(0, 600);

  try {
    const result = await callGemini({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Classify this reply:\n\n${truncated}`,
      maxOutputTokens: 256,
      temperature: 0,
    });

    if (result.text === "__gemini_stub__") {
      return { ...FALLBACK, reason: "Gemini dev-stub active — needs manual review." };
    }

    const jsonText = extractJson(result.text);
    const parsed = triageSchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) {
      return { ...FALLBACK, reason: "Schema validation failed." };
    }
    return parsed.data;
  } catch {
    return FALLBACK;
  }
}
