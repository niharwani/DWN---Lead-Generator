import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyReply } from "@/lib/outreach/triage";

const ENV_WITH_KEY = { ANTHROPIC_API_KEY: "test-key" };
const ENV_NO_KEY = {};

function mockFetch(text: string, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () =>
      Promise.resolve({
        content: [{ type: "text", text }],
      }),
    text: () => Promise.resolve("error"),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyReply", () => {
  it("falls back to unclear when ANTHROPIC_API_KEY is missing", async () => {
    const result = await classifyReply("Hello!", ENV_NO_KEY);
    expect(result.class).toBe("unclear");
    expect(result.reason).toContain("not configured");
  });

  it("classifies 'interested' correctly", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(JSON.stringify({ class: "interested", reason: "They want to learn more." }))
    );
    const result = await classifyReply("Yes, I'd love to chat!", ENV_WITH_KEY);
    expect(result.class).toBe("interested");
    expect(result.reason).toBe("They want to learn more.");
  });

  it("classifies 'not_a_fit' correctly", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(JSON.stringify({ class: "not_a_fit", reason: "They declined politely." }))
    );
    const result = await classifyReply("Thanks but no thanks.", ENV_WITH_KEY);
    expect(result.class).toBe("not_a_fit");
  });

  it("classifies 'unsubscribe' correctly", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(JSON.stringify({ class: "unsubscribe", reason: "Explicitly asked to stop." }))
    );
    const result = await classifyReply("Please remove me from your list.", ENV_WITH_KEY);
    expect(result.class).toBe("unsubscribe");
  });

  it("classifies 'needs_info' correctly", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        JSON.stringify({
          class: "needs_info",
          reason: "They asked a question.",
          suggested_next_action: "Answer their question.",
        })
      )
    );
    const result = await classifyReply("What does this include?", ENV_WITH_KEY);
    expect(result.class).toBe("needs_info");
    expect(result.suggested_next_action).toBe("Answer their question.");
  });

  it("falls back to unclear when Anthropic returns non-200", async () => {
    vi.stubGlobal("fetch", mockFetch("", false));
    const result = await classifyReply("Some reply", ENV_WITH_KEY);
    expect(result.class).toBe("unclear");
  });

  it("falls back to unclear when JSON parse fails", async () => {
    vi.stubGlobal("fetch", mockFetch("not json at all"));
    const result = await classifyReply("Some reply", ENV_WITH_KEY);
    expect(result.class).toBe("unclear");
  });

  it("falls back to unclear when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const result = await classifyReply("Some reply", ENV_WITH_KEY);
    expect(result.class).toBe("unclear");
  });
});
