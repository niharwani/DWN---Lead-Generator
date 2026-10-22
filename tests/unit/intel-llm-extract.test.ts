/**
 * Unit tests for the LLM extraction fallback.
 *
 * Mocks:
 *   - `@/lib/env` so `getRuntimeEnv` returns the GEMINI_API_KEY we want.
 *   - `globalThis.fetch` for both the Gemini endpoint and the auditFetch page
 *     re-fetch (both go through the same fetch).
 *
 * Covers the invariants in the Stream B spec:
 *   - returns input unchanged when GEMINI_API_KEY is missing
 *   - LLM-returned people appear in the merged output when heuristics return 0
 *   - dedup by case-insensitive name (prefers higher confidence)
 *   - fill-only merge for CompanyIntel (non-empty heuristic fields preserved)
 *   - any LLM error is swallowed — enrichWithLlm never throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CompanyIntel, ExtractedPersonCandidate } from "@/lib/intel/types";

/* --------------------------------------------------------------------------
 * Env mock (must be set up BEFORE importing modules that read env).
 * -------------------------------------------------------------------------- */

vi.mock("@/lib/env", () => ({
  getRuntimeEnv: vi.fn(),
}));

import { getRuntimeEnv } from "@/lib/env";

/* --------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */

const originalFetch = globalThis.fetch;

const TEST_KEY = "AIzaSy_test_key_for_llm_extract";

function emptyIntel(overrides: Partial<CompanyIntel> = {}): CompanyIntel {
  return {
    domain: "example.com",
    services: [],
    categories: [],
    emails: [],
    phones: [],
    socialUrls: [],
    techIndicators: [],
    ...overrides,
  };
}

/**
 * Build a Gemini candidates response wrapping the given JSON payload.
 */
function geminiJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify(payload) }] },
            finishReason: "STOP",
          },
        ],
      }),
    text: () => Promise.resolve(""),
  };
}

/* --------------------------------------------------------------------------
 * Lifecycle
 * -------------------------------------------------------------------------- */

beforeEach(() => {
  (getRuntimeEnv as ReturnType<typeof vi.fn>).mockResolvedValue({
    GEMINI_API_KEY: TEST_KEY,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/* --------------------------------------------------------------------------
 * Tests
 * -------------------------------------------------------------------------- */

describe("enrichWithLlm — API key missing", () => {
  it("returns input unchanged when GEMINI_API_KEY is absent", async () => {
    const { enrichWithLlm } = await import("@/lib/intel/llm-extract");
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const heuristicPeople: ExtractedPersonCandidate[] = [
      {
        fullName: "Priya Sharma",
        jobTitle: "Founder",
        sourceUrl: "https://acme.example/team",
        confidence: "high",
      },
    ];
    const heuristicIntel = emptyIntel({ name: "Acme Jewels" });

    const out = await enrichWithLlm(
      {
        intel: heuristicIntel,
        people: heuristicPeople,
        pages: [
          { url: "https://acme.example/", title: "Home", text: "..." },
          { url: "https://acme.example/team", title: "Team", text: "..." },
        ],
      },
      { /* no GEMINI_API_KEY */ }
    );

    expect(out.people).toEqual(heuristicPeople);
    expect(out.intel).toEqual(heuristicIntel);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("enrichWithLlm — heuristics returned 0 people", () => {
  it("merges LLM-returned people when the heuristic set is empty", async () => {
    const { enrichWithLlm } = await import("@/lib/intel/llm-extract");

    // Gemini responds with two people and a company name.
    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return geminiJson({
          people: [
            {
              fullName: "Anita Rao",
              jobTitle: "Head of Marketing",
              confidence: "high",
            },
            {
              fullName: "Vikram Singh",
              jobTitle: "Managing Director",
              confidence: "medium",
            },
          ],
          companyIntel: {
            name: "Acme Jewels",
            description: "Mumbai heritage brand",
          },
        });
      }
      // Fallback for any other URL
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const out = await enrichWithLlm(
      {
        intel: emptyIntel(),
        people: [],
        pages: [
          {
            url: "https://acme.example/team",
            title: "Our Team",
            // pre-populated text so llm-extract does not re-fetch via auditFetch
            text: "Anita Rao - Head of Marketing. Vikram Singh - Managing Director.",
          },
        ],
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    const names = out.people.map((p) => p.fullName).sort();
    expect(names).toEqual(["Anita Rao", "Vikram Singh"]);
    // Source URL propagated from the picked page.
    expect(out.people.every((p) => p.sourceUrl === "https://acme.example/team")).toBe(true);
    // Fill-only merge: name added to empty intel.
    expect(out.intel.name).toBe("Acme Jewels");
    expect(out.intel.description).toBe("Mumbai heritage brand");
  });
});

describe("enrichWithLlm — dedup by case-insensitive name", () => {
  it("keeps a single entry when heuristic + LLM report the same person", async () => {
    const { enrichWithLlm } = await import("@/lib/intel/llm-extract");

    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return geminiJson({
          people: [
            {
              fullName: "PRIYA SHARMA", // different casing
              jobTitle: "Founder & CEO",
              confidence: "high",
            },
          ],
        });
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const heuristic: ExtractedPersonCandidate[] = [
      {
        fullName: "Priya Sharma",
        jobTitle: "Founder",
        sourceUrl: "https://acme.example/team",
        confidence: "low", // lower than LLM so LLM should win
      },
    ];

    const out = await enrichWithLlm(
      {
        intel: emptyIntel(),
        people: heuristic,
        pages: [
          {
            url: "https://acme.example/team",
            title: "Team",
            text: "Priya Sharma, Founder & CEO",
          },
        ],
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    expect(out.people).toHaveLength(1);
    const sole = out.people[0]!;
    // Higher-confidence LLM entry wins — but the heuristic name casing is preserved
    // for deterministic downstream dedup.
    expect(sole.fullName).toBe("Priya Sharma");
    expect(sole.confidence).toBe("high");
    expect(sole.jobTitle).toBe("Founder & CEO");
  });
});

describe("enrichWithLlm — fill-only intel merge", () => {
  it("preserves non-empty heuristic intel fields and only fills gaps", async () => {
    const { enrichWithLlm } = await import("@/lib/intel/llm-extract");

    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return geminiJson({
          people: [],
          companyIntel: {
            name: "Acme Jewels Pvt Ltd (LLM)", // should NOT overwrite heuristic name
            description: "LLM-authored description", // heuristic has no description → fill
            city: "Delhi", // should NOT overwrite heuristic city
            country: "India", // heuristic missing → fill
            contactEmails: ["hello@acme.example"], // new email, union with existing
          },
        });
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const heuristicIntel: CompanyIntel = emptyIntel({
      name: "Acme Jewels (heuristic)",
      city: "Mumbai",
      emails: ["info@acme.example"],
    });

    const out = await enrichWithLlm(
      {
        intel: heuristicIntel,
        people: [],
        pages: [
          {
            url: "https://acme.example/about",
            title: "About",
            text: "Acme Jewels Pvt Ltd. Based in Mumbai.",
          },
        ],
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    // Non-empty heuristic fields untouched
    expect(out.intel.name).toBe("Acme Jewels (heuristic)");
    expect(out.intel.city).toBe("Mumbai");
    // Missing fields filled from LLM
    expect(out.intel.description).toBe("LLM-authored description");
    expect(out.intel.country).toBe("India");
    // Emails: union-merged, heuristic preserved, new email appended
    expect(out.intel.emails).toContain("info@acme.example");
    expect(out.intel.emails).toContain("hello@acme.example");
  });
});

describe("enrichWithLlm — never throws on LLM failure", () => {
  it("swallows an LLM HTTP error and returns the heuristic input unchanged", async () => {
    const { enrichWithLlm } = await import("@/lib/intel/llm-extract");

    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return {
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: "boom" } }),
          text: () => Promise.resolve("boom"),
        };
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const heuristic: ExtractedPersonCandidate[] = [
      {
        fullName: "Priya Sharma",
        jobTitle: "Founder",
        sourceUrl: "https://acme.example/team",
        confidence: "high",
      },
    ];
    const heuristicIntel = emptyIntel({ name: "Acme Jewels" });

    // Must NOT throw.
    const out = await enrichWithLlm(
      {
        intel: heuristicIntel,
        people: heuristic,
        pages: [
          {
            url: "https://acme.example/team",
            title: "Team",
            text: "Priya Sharma — Founder",
          },
        ],
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    expect(out.people).toEqual(heuristic);
    expect(out.intel).toEqual(heuristicIntel);
  });

  it("swallows malformed JSON from Gemini", async () => {
    const { enrichWithLlm } = await import("@/lib/intel/llm-extract");

    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: { parts: [{ text: "not valid json at all" }] },
                  finishReason: "STOP",
                },
              ],
            }),
          text: () => Promise.resolve(""),
        };
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const heuristicIntel = emptyIntel({ name: "Acme" });
    const out = await enrichWithLlm(
      {
        intel: heuristicIntel,
        people: [],
        pages: [{ url: "https://acme.example/", title: "Home", text: "hi" }],
      },
      { GEMINI_API_KEY: TEST_KEY }
    );
    // Nothing merged, nothing lost.
    expect(out.people).toEqual([]);
    expect(out.intel).toEqual(heuristicIntel);
  });
});

/* --------------------------------------------------------------------------
 * cleanVisibleText helper
 * -------------------------------------------------------------------------- */

describe("cleanVisibleText", () => {
  it("strips script and style, collapses whitespace", async () => {
    const { cleanVisibleText } = await import("@/lib/intel/llm-extract");
    const html = `
      <html>
        <head>
          <style>.x{color:red}</style>
          <script>console.log("nope")</script>
          <title>Ignore via main doc text</title>
        </head>
        <body>
          <h1>Priya Sharma</h1>
          <p>Founder   &amp;    CEO</p>
          <script>var secret = 1;</script>
        </body>
      </html>`;
    const text = cleanVisibleText(html);
    expect(text).not.toContain("console.log");
    expect(text).not.toContain("color:red");
    expect(text).toContain("Priya Sharma");
    expect(text).toMatch(/Founder\s+&\s+CEO/);
    // whitespace collapsed to single spaces
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("returns empty string for empty input", async () => {
    const { cleanVisibleText } = await import("@/lib/intel/llm-extract");
    expect(cleanVisibleText("")).toBe("");
  });
});
