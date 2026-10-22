import { describe, it, expect, afterEach } from "vitest";
import { runWebSearch, webSearchProviderStatus } from "@/lib/intel/search";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("webSearchProviderStatus", () => {
  it("reports needs-key without API key", () => {
    expect(webSearchProviderStatus({})).toBe("needs-key");
  });
  it("reports ready with an API key", () => {
    expect(webSearchProviderStatus({ BRAVE_SEARCH_API_KEY: "abc" })).toBe("ready");
  });
});

describe("runWebSearch", () => {
  it("throws when API key is missing", async () => {
    await expect(
      runWebSearch({ industry: "x", resultLimit: 10 }, {})
    ).rejects.toThrow(/BRAVE_SEARCH_API_KEY/);
  });

  it("normalizes Brave results and filters excluded domains", async () => {
    globalThis.fetch = (async (url: string) => {
      expect(url).toContain("brave.com");
      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Acme Jewels | Fine Jewellery",
                url: "https://www.acmejewels.com/",
                description: "Mumbai heritage brand",
              },
              {
                title: "Spam Directory",
                url: "https://directoryspam.example/listing/acme",
                description: "listing",
              },
              {
                title: "Noise",
                url: "not-a-url",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const results = await runWebSearch(
      {
        industry: "Jewellery",
        location: "Mumbai",
        resultLimit: 10,
        excludedDomains: ["directoryspam.example"],
      },
      { BRAVE_SEARCH_API_KEY: "test-key" }
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.domain).toBe("acmejewels.com");
    expect(results[0]!.title).toContain("Acme Jewels");
  });

  it("surfaces 401 / 403 as actionable errors", async () => {
    globalThis.fetch = (async () => new Response("forbidden", { status: 401 })) as typeof fetch;
    await expect(
      runWebSearch({ industry: "x", resultLimit: 10 }, { BRAVE_SEARCH_API_KEY: "bad" })
    ).rejects.toThrow(/API key/);
  });

  it("surfaces 429 as a quota error", async () => {
    globalThis.fetch = (async () => new Response("too many", { status: 429 })) as typeof fetch;
    await expect(
      runWebSearch({ industry: "x", resultLimit: 10 }, { BRAVE_SEARCH_API_KEY: "k" })
    ).rejects.toThrow(/quota/i);
  });
});
