/**
 * Gemini AI wrapper.
 *
 * Thin plain-fetch wrapper around the Gemini generateContent REST API.
 * No SDK — same pattern as Resend and Razorpay in this codebase.
 * Runs on Cloudflare Workers without modification.
 *
 * Model defaults:
 *   - Drafts:      gemini-2.5-flash  (override via GEMINI_MODEL_DRAFT env)
 *   - Classifier:  gemini-2.5-flash-lite (override via GEMINI_MODEL_CLASSIFIER env)
 *
 * Dev-stub mode: when GEMINI_API_KEY is absent, returns a stub string so
 * callers (draft builder, triage) fall through to their template / fallback
 * paths exactly as they do with a missing Anthropic key today.
 */

import { getRuntimeEnv } from "@/lib/env";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type GeminiModel =
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-pro";

export type GeminiInput = {
  model: GeminiModel;
  systemPrompt?: string;
  userPrompt: string;
  responseJsonSchema?: unknown;
  maxOutputTokens?: number;
  temperature?: number;
};

export type GeminiOutput = {
  text: string;
};

/* --------------------------------------------------------------------------
 * Endpoint builder
 * -------------------------------------------------------------------------- */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function endpoint(model: GeminiModel, apiKey: string): string {
  return `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/* --------------------------------------------------------------------------
 * Model env helpers (exported so callers can pick the right model)
 * -------------------------------------------------------------------------- */

let _cachedEnv: Record<string, string | undefined> | null = null;

async function lazyEnv(): Promise<Record<string, string | undefined>> {
  if (_cachedEnv) return _cachedEnv;
  _cachedEnv = await getRuntimeEnv();
  return _cachedEnv;
}

export async function getGeminiModelDraft(): Promise<GeminiModel> {
  const env = await lazyEnv();
  return (env.GEMINI_MODEL_DRAFT as GeminiModel | undefined) ?? "gemini-2.5-flash";
}

export async function getGeminiModelClassifier(): Promise<GeminiModel> {
  const env = await lazyEnv();
  return (env.GEMINI_MODEL_CLASSIFIER as GeminiModel | undefined) ?? "gemini-2.5-flash-lite";
}

/* --------------------------------------------------------------------------
 * Core call
 * -------------------------------------------------------------------------- */

/**
 * Call the Gemini generateContent API.
 *
 * Returns `{ text: '__gemini_stub__' }` when GEMINI_API_KEY is absent in
 * development so callers can detect the stub and fall back gracefully.
 *
 * Throws on HTTP errors; callers are expected to catch and fall back.
 */
export async function callGemini(input: GeminiInput): Promise<GeminiOutput> {
  const env = await lazyEnv();
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    // Dev-stub: return a predictable sentinel so callers know to fall back
    console.log("[Gemini stub] GEMINI_API_KEY not set — returning stub response.");
    return { text: "__gemini_stub__" };
  }

  // Build the request body
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [];

  // System instruction is sent as a separate top-level field in Gemini API v1beta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: Record<string, any> = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.userPrompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: input.maxOutputTokens ?? 1024,
      temperature: input.temperature ?? 0.7,
    },
  };

  if (input.systemPrompt) {
    requestBody.systemInstruction = {
      parts: [{ text: input.systemPrompt }],
    };
  }

  // If the caller wants structured JSON output, use responseMimeType
  if (input.responseJsonSchema !== undefined) {
    requestBody.generationConfig.responseMimeType = "application/json";
  }

  void contents; // suppress unused warning

  const resp = await fetch(endpoint(input.model, apiKey), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Gemini HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
      finishReason?: string;
    }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(`Gemini API error: ${data.error.message}`);
  }

  const text =
    (data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text!)
      .join("")
      .trim() ?? "";

  return { text };
}
