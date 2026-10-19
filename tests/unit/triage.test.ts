import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyReply } from "@/lib/outreach/triage";

// Triage now calls Gemini — mock the gemini module so no real HTTP is made
vi.mock("@/lib/ai/gemini", () => ({
  callGemini: vi.fn(),
  getGeminiModelClassifier: vi.fn().mockResolvedValue("gemini-2.5-flash-lite"),
}));

import { callGemini } from "@/lib/ai/gemini";

const ENV_WITH_KEY = { GEMINI_API_KEY: "test-key" };
const ENV_NO_KEY = {};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(callGemini).mockReset();
});

describe("classifyReply", () => {
  it("falls back to unclear when GEMINI_API_KEY is missing", async () => {
    const result = await classifyReply("Hello!", ENV_NO_KEY);
    expect(result.class).toBe("unclear");
    expect(result.reason).toContain("not configured");
  });

  it("classifies 'interested' correctly", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({ class: "interested", reason: "They want to learn more." }),
    });

    const result = await classifyReply("Yes, I'd love to chat!", ENV_WITH_KEY);
    expect(result.class).toBe("interested");
    expect(result.reason).toBe("They want to learn more.");
  });

  it("classifies 'not_a_fit' correctly", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({ class: "not_a_fit", reason: "They declined politely." }),
    });

    const result = await classifyReply("Thanks but no thanks.", ENV_WITH_KEY);
    expect(result.class).toBe("not_a_fit");
  });

  it("classifies 'unsubscribe' correctly", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({ class: "unsubscribe", reason: "Explicitly asked to stop." }),
    });

    const result = await classifyReply("Please remove me from your list.", ENV_WITH_KEY);
    expect(result.class).toBe("unsubscribe");
  });

  it("classifies 'needs_info' correctly", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({
        class: "needs_info",
        reason: "They asked a question.",
        suggested_next_action: "Answer their question.",
      }),
    });

    const result = await classifyReply("What does this include?", ENV_WITH_KEY);
    expect(result.class).toBe("needs_info");
    expect(result.suggested_next_action).toBe("Answer their question.");
  });

  it("falls back to unclear when Gemini returns stub sentinel", async () => {
    vi.mocked(callGemini).mockResolvedValue({ text: "__gemini_stub__" });

    const result = await classifyReply("Some reply", ENV_WITH_KEY);
    expect(result.class).toBe("unclear");
  });

  it("falls back to unclear when JSON parse fails", async () => {
    vi.mocked(callGemini).mockResolvedValue({ text: "not json at all" });

    const result = await classifyReply("Some reply", ENV_WITH_KEY);
    expect(result.class).toBe("unclear");
  });

  it("falls back to unclear when callGemini throws", async () => {
    vi.mocked(callGemini).mockRejectedValue(new Error("network error"));

    const result = await classifyReply("Some reply", ENV_WITH_KEY);
    expect(result.class).toBe("unclear");
  });

  it("falls back to unclear when schema validation fails (unknown class)", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({ class: "maybe", reason: "Unknown class value." }),
    });

    const result = await classifyReply("Hmm, maybe?", ENV_WITH_KEY);
    expect(result.class).toBe("unclear");
  });
});
