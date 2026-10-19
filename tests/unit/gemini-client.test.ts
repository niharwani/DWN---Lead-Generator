/**
 * Unit tests for the Gemini AI wrapper.
 *
 * Verifies:
 *   - URL shape: correct endpoint with model name and API key
 *   - Request body shape: contents, systemInstruction, generationConfig
 *   - JSON extraction from candidates[].content.parts[].text
 *   - Dev-stub mode returns __gemini_stub__ when key absent (non-production)
 *   - Throws on HTTP errors
 *   - getGeminiModelDraft / getGeminiModelClassifier return correct defaults
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock environment
// ---------------------------------------------------------------------------

vi.mock("@/lib/env", () => ({
  getRuntimeEnv: vi.fn(),
}));

import { getRuntimeEnv } from "@/lib/env";

const TEST_KEY = "AIzaSy_test_key_abc123";

function mockGeminiResponse(text: string, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () =>
      Promise.resolve({
        candidates: [
          {
            content: {
              parts: [{ text }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    text: () => Promise.resolve(`{"error":{"message":"Bad request"}}`),
  });
}

beforeEach(() => {
  (getRuntimeEnv as ReturnType<typeof vi.fn>).mockResolvedValue({
    GEMINI_API_KEY: TEST_KEY,
    GEMINI_MODEL_DRAFT: undefined,
    GEMINI_MODEL_CLASSIFIER: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Import after mock setup — these are hoisted so they resolve with mocked env
import { callGemini, getGeminiModelDraft, getGeminiModelClassifier } from "@/lib/ai/gemini";

/* --------------------------------------------------------------------------
 * URL shape
 * -------------------------------------------------------------------------- */

describe("callGemini URL", () => {
  it("builds the correct endpoint URL with model and api key", async () => {
    const mockFetch = mockGeminiResponse("hello");
    vi.stubGlobal("fetch", mockFetch);

    await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Say hello",
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(url).toContain(`key=${encodeURIComponent(TEST_KEY)}`);
  });

  it("uses the model passed in the input", async () => {
    const mockFetch = mockGeminiResponse("ok");
    vi.stubGlobal("fetch", mockFetch);

    await callGemini({
      model: "gemini-2.5-flash-lite",
      userPrompt: "Test",
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-2.5-flash-lite:generateContent");
  });
});

/* --------------------------------------------------------------------------
 * Request body shape
 * -------------------------------------------------------------------------- */

describe("callGemini request body", () => {
  it("sends userPrompt as contents[0].parts[0].text with role=user", async () => {
    const mockFetch = mockGeminiResponse("response text");
    vi.stubGlobal("fetch", mockFetch);

    await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Write me an email",
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    const contents = body.contents as Array<{ role: string; parts: Array<{ text: string }> }>;
    expect(contents[0]!.role).toBe("user");
    expect(contents[0]!.parts[0]!.text).toBe("Write me an email");
  });

  it("sends systemPrompt as top-level systemInstruction field", async () => {
    const mockFetch = mockGeminiResponse("response");
    vi.stubGlobal("fetch", mockFetch);

    await callGemini({
      model: "gemini-2.5-flash",
      systemPrompt: "You are a helpful assistant.",
      userPrompt: "Hello",
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    const si = body.systemInstruction as { parts: Array<{ text: string }> };
    expect(si.parts[0]!.text).toBe("You are a helpful assistant.");
  });

  it("does not send systemInstruction when systemPrompt is absent", async () => {
    const mockFetch = mockGeminiResponse("ok");
    vi.stubGlobal("fetch", mockFetch);

    await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "No system prompt",
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.systemInstruction).toBeUndefined();
  });

  it("sends maxOutputTokens in generationConfig", async () => {
    const mockFetch = mockGeminiResponse("ok");
    vi.stubGlobal("fetch", mockFetch);

    await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Test",
      maxOutputTokens: 512,
      temperature: 0.3,
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    const gc = body.generationConfig as Record<string, unknown>;
    expect(gc.maxOutputTokens).toBe(512);
    expect(gc.temperature).toBe(0.3);
  });

  it("sets responseMimeType when responseJsonSchema is provided", async () => {
    const mockFetch = mockGeminiResponse('{"result":"ok"}');
    vi.stubGlobal("fetch", mockFetch);

    await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Return JSON",
      responseJsonSchema: { type: "object" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    const gc = body.generationConfig as Record<string, unknown>;
    expect(gc.responseMimeType).toBe("application/json");
  });
});

/* --------------------------------------------------------------------------
 * Response parsing
 * -------------------------------------------------------------------------- */

describe("callGemini response parsing", () => {
  it("extracts text from candidates[0].content.parts[0].text", async () => {
    vi.stubGlobal("fetch", mockGeminiResponse("The quick brown fox"));

    const result = await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Tell me about foxes",
    });

    expect(result.text).toBe("The quick brown fox");
  });

  it("concatenates multiple parts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: "Hello " }, { text: "World" }],
                },
              },
            ],
          }),
      })
    );

    const result = await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Test",
    });

    expect(result.text).toBe("Hello World");
  });

  it("returns empty string when candidates is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      })
    );

    const result = await callGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Test",
    });

    expect(result.text).toBe("");
  });
});

/* --------------------------------------------------------------------------
 * Error handling
 * -------------------------------------------------------------------------- */

describe("callGemini error handling", () => {
  it("throws on non-200 HTTP status", async () => {
    vi.stubGlobal("fetch", mockGeminiResponse("", false));

    await expect(
      callGemini({ model: "gemini-2.5-flash", userPrompt: "Test" })
    ).rejects.toThrow(/Gemini HTTP 400/);
  });

  it("throws when response contains error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            error: { message: "API key invalid" },
          }),
      })
    );

    await expect(
      callGemini({ model: "gemini-2.5-flash", userPrompt: "Test" })
    ).rejects.toThrow(/API key invalid/);
  });
});

/* --------------------------------------------------------------------------
 * Dev-stub mode
 * -------------------------------------------------------------------------- */

describe("callGemini dev-stub mode", () => {
  it("returns __gemini_stub__ text when GEMINI_API_KEY is absent in test env", async () => {
    // Need fresh module to bypass module-level _cachedEnv cache
    vi.resetModules();

    (getRuntimeEnv as ReturnType<typeof vi.fn>).mockResolvedValue({
      GEMINI_API_KEY: undefined,
    });
    vi.stubEnv("NODE_ENV", "test");

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    // Re-import after resetting modules to get fresh _cachedEnv
    const { callGemini: freshCallGemini } = await import("@/lib/ai/gemini");

    const result = await freshCallGemini({
      model: "gemini-2.5-flash",
      userPrompt: "Test",
    });

    expect(result.text).toBe("__gemini_stub__");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

/* --------------------------------------------------------------------------
 * Model env helpers
 * -------------------------------------------------------------------------- */

describe("getGeminiModelDraft", () => {
  it("returns gemini-2.5-flash by default", async () => {
    const model = await getGeminiModelDraft();
    expect(model).toBe("gemini-2.5-flash");
  });
});

describe("getGeminiModelClassifier", () => {
  it("returns gemini-2.5-flash-lite by default", async () => {
    const model = await getGeminiModelClassifier();
    expect(model).toBe("gemini-2.5-flash-lite");
  });
});
