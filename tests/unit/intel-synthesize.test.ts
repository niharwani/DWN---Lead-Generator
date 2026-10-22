/**
 * Unit tests for Web Intelligence Stream E — `synthesizeOutreachHooks`.
 *
 * Patterns followed from tests/unit/intel-llm-extract.test.ts and
 * tests/unit/gemini-client.test.ts:
 *   - Mock `@/lib/env` so the Gemini client reads a known key.
 *   - Mock `globalThis.fetch` so the Gemini endpoint returns canned JSON.
 *
 * Invariants under test:
 *   - Returns null when GEMINI_API_KEY is missing (no fetch call made).
 *   - Returns a well-shaped SynthesizedBrief when Gemini responds correctly.
 *   - Returns null (never throws) when Gemini returns malformed JSON.
 *   - System prompt contains the "Only report what is directly stated" line.
 *   - Observations are clamped at the length limits.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { AuditFinding, ServiceOffering } from "@/lib/demo/types";
import type {
  CompanyIntel,
  ExtractedPersonCandidate,
} from "@/lib/intel/types";

/* --------------------------------------------------------------------------
 * Env mock — must be set up BEFORE importing modules that read env.
 * -------------------------------------------------------------------------- */

vi.mock("@/lib/env", () => ({
  getRuntimeEnv: vi.fn(),
}));

import { getRuntimeEnv } from "@/lib/env";

/* --------------------------------------------------------------------------
 * Fixtures
 * -------------------------------------------------------------------------- */

const TEST_KEY = "AIzaSy_test_key_synthesize_e";

function emptyIntel(overrides: Partial<CompanyIntel> = {}): CompanyIntel {
  return {
    domain: "acme.example",
    name: "Acme Jewels",
    description: "Mumbai heritage brand",
    services: ["bespoke jewellery", "repairs"],
    categories: [],
    emails: [],
    phones: [],
    socialUrls: [],
    techIndicators: ["WordPress"],
    ...overrides,
  };
}

const SAMPLE_FINDINGS: AuditFinding[] = [
  {
    code: "intel_missing_viewport",
    title: "No mobile viewport meta",
    severity: "high",
    description: "Unusable on phones.",
    evidence: "No meta[name=viewport] found.",
    evidenceUrl: "https://acme.example/",
    confidence: "high",
    recommendation: "Add viewport meta.",
  },
  {
    code: "intel_missing_meta_description",
    title: "Missing meta description",
    severity: "medium",
    description: "Search engines synthesize description.",
    evidence: "No meta[name=description] on the page.",
    evidenceUrl: "https://acme.example/",
    confidence: "high",
    recommendation: "Write 140–160 char description.",
  },
  {
    code: "intel_missing_cta",
    title: "No obvious call-to-action detected",
    severity: "medium",
    description: "No matching CTA phrasing found.",
    evidence: "Scanned anchors and buttons.",
    evidenceUrl: "https://acme.example/",
    confidence: "medium",
    recommendation: "Add a primary CTA.",
  },
];

const SAMPLE_PEOPLE: ExtractedPersonCandidate[] = [
  {
    fullName: "Priya Sharma",
    jobTitle: "Founder",
    sourceUrl: "https://acme.example/team",
    confidence: "high",
  },
];

const SAMPLE_SERVICES: ServiceOffering[] = [
  {
    id: "svc-1",
    name: "Brand website rebuild",
    description: "A 6-page mobile-first site with a working enquiry path.",
    idealCustomer: "D2C brands with an outdated storefront.",
    valueProposition: "Credible digital home that converts enquiries.",
    isActive: true,
  },
  {
    id: "svc-2",
    name: "Landing page sprint",
    description: "One-page focused funnel for a paid campaign.",
    idealCustomer: "Operators running paid traffic to a weak landing page.",
    valueProposition: "Higher conversion for the same ad spend.",
    isActive: true,
  },
];

const SAMPLE_LEAD = {
  businessName: "Acme Jewels",
  niche: "Jewellery D2C",
  city: "Mumbai",
  country: "India",
  offer: "Website rebuild",
};

/**
 * Build a Gemini-shape response wrapping a JSON payload (same helper the
 * llm-extract tests use).
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

const originalFetch = globalThis.fetch;

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

describe("synthesizeOutreachHooks — API key missing", () => {
  it("returns null when GEMINI_API_KEY is absent and does not call fetch", async () => {
    const { synthesizeOutreachHooks } = await import("@/lib/intel/synthesize");
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const out = await synthesizeOutreachHooks(
      {
        intel: emptyIntel(),
        people: SAMPLE_PEOPLE,
        findings: SAMPLE_FINDINGS,
        lead: SAMPLE_LEAD,
        services: SAMPLE_SERVICES,
      },
      { /* no GEMINI_API_KEY */ }
    );

    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("synthesizeOutreachHooks — well-formed Gemini response", () => {
  it("returns a brief whose shape matches NewOpportunityBrief minus id/leadId/createdAt", async () => {
    const { synthesizeOutreachHooks } = await import("@/lib/intel/synthesize");

    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return geminiJson({
          summary:
            "Acme Jewels' site has no mobile viewport and no primary CTA — rebuild is a credible first conversation.",
          observations: [
            {
              observation: "No mobile viewport meta",
              evidence: "No meta[name=viewport] found.",
              evidenceUrl: "https://acme.example/",
            },
            {
              observation: "Missing meta description",
              evidence: "No meta[name=description] on the page.",
              evidenceUrl: "https://acme.example/",
            },
          ],
          possibleOpportunity:
            "A focused brand website rebuild that gives Acme Jewels a mobile-first, conversion-oriented home.",
          recommendedService: "Brand website rebuild",
          suggestedDeliverable:
            "A 5-8 page mobile-first site with a working enquiry path, launched in 4 weeks.",
          confidence: "high",
          unknowns: [
            "Who approves website rebuild spend?",
            "Is there a target launch date tied to a campaign?",
          ],
        });
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const out = await synthesizeOutreachHooks(
      {
        intel: emptyIntel(),
        people: SAMPLE_PEOPLE,
        findings: SAMPLE_FINDINGS,
        lead: SAMPLE_LEAD,
        services: SAMPLE_SERVICES,
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    expect(out).not.toBeNull();
    const brief = out!;
    expect(brief.source).toBe("ai");
    expect(brief.modelMetadata).toEqual({
      provider: "gemini",
      model: expect.stringMatching(/^gemini-/),
    });
    expect(brief.confidence).toBe("high");
    expect(brief.summary.length).toBeGreaterThan(0);
    expect(brief.summary.length).toBeLessThanOrEqual(500);
    expect(brief.observations!.length).toBe(2);
    expect(brief.observations![0]?.observation).toBe("No mobile viewport meta");
    expect(brief.observations![0]?.evidenceUrl).toBe("https://acme.example/");
    // When the model named an existing service, the exact operator-string is used.
    expect(brief.recommendedService).toBe("Brand website rebuild");
    expect(brief.suggestedDeliverable).toContain("mobile-first");
    expect(brief.unknowns!.length).toBe(2);
    expect(brief.campaignId).toBeNull();
  });
});

describe("synthesizeOutreachHooks — malformed JSON", () => {
  it("returns null (and does not throw) when Gemini returns non-JSON text", async () => {
    const { synthesizeOutreachHooks } = await import("@/lib/intel/synthesize");

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
                  content: {
                    parts: [{ text: "this is not JSON at all, apologies." }],
                  },
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

    // Must not throw.
    const out = await synthesizeOutreachHooks(
      {
        intel: emptyIntel(),
        people: SAMPLE_PEOPLE,
        findings: SAMPLE_FINDINGS,
        lead: SAMPLE_LEAD,
        services: SAMPLE_SERVICES,
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    expect(out).toBeNull();
  });

  it("returns null when Gemini returns JSON with missing required fields", async () => {
    const { synthesizeOutreachHooks } = await import("@/lib/intel/synthesize");

    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        // Missing summary + possibleOpportunity + confidence
        return geminiJson({
          observations: [],
          recommendedService: "Brand website rebuild",
          suggestedDeliverable: "A 6-page site",
          unknowns: [],
        });
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const out = await synthesizeOutreachHooks(
      {
        intel: emptyIntel(),
        people: SAMPLE_PEOPLE,
        findings: SAMPLE_FINDINGS,
        lead: SAMPLE_LEAD,
        services: SAMPLE_SERVICES,
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    expect(out).toBeNull();
  });
});

describe("synthesizeOutreachHooks — system prompt enforcement", () => {
  it("includes the 'Only report what is directly stated' instruction in the request body", async () => {
    const { synthesizeOutreachHooks, SYNTHESIS_SYSTEM_PROMPT } = await import(
      "@/lib/intel/synthesize"
    );

    const fetchSpy = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return geminiJson({
          summary: "Short summary.",
          observations: [],
          possibleOpportunity: "A clear opportunity.",
          recommendedService: "Brand website rebuild",
          suggestedDeliverable: "A 6-page site.",
          confidence: "medium",
          unknowns: [],
        });
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await synthesizeOutreachHooks(
      {
        intel: emptyIntel(),
        people: SAMPLE_PEOPLE,
        findings: SAMPLE_FINDINGS,
        lead: SAMPLE_LEAD,
        services: SAMPLE_SERVICES,
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    // Grep every fetch call body for the enforcement sentence.
    const bodies: string[] = [];
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      if (init && typeof init.body === "string") bodies.push(init.body);
    }
    const joined = bodies.join("\n");
    expect(joined).toContain(
      "Only report what is directly stated in the extracted facts and findings"
    );
    // Also confirm the module exports a system-prompt constant that matches.
    expect(SYNTHESIS_SYSTEM_PROMPT).toContain(
      "Only report what is directly stated in the extracted facts and findings"
    );
  });
});

describe("synthesizeOutreachHooks — length clamping", () => {
  it("clamps summary, observation, and possibleOpportunity to their limits", async () => {
    const { synthesizeOutreachHooks } = await import("@/lib/intel/synthesize");

    const longSummary = "A".repeat(900); // > 500
    const longObservation = "B".repeat(600); // > 300
    const longOpportunity = "C".repeat(900); // > 400

    globalThis.fetch = vi.fn().mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : String(url);
      if (u.includes("generativelanguage.googleapis.com")) {
        return geminiJson({
          summary: longSummary,
          observations: [
            {
              observation: longObservation,
              evidence: "E".repeat(600),
              evidenceUrl: "https://acme.example/",
            },
          ],
          possibleOpportunity: longOpportunity,
          recommendedService: "Brand website rebuild",
          suggestedDeliverable: "A 6-page site.",
          confidence: "medium",
          unknowns: ["U".repeat(400)],
        });
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const out = await synthesizeOutreachHooks(
      {
        intel: emptyIntel(),
        people: SAMPLE_PEOPLE,
        findings: SAMPLE_FINDINGS,
        lead: SAMPLE_LEAD,
        services: SAMPLE_SERVICES,
      },
      { GEMINI_API_KEY: TEST_KEY }
    );

    expect(out).not.toBeNull();
    const brief = out!;
    expect(brief.summary.length).toBeLessThanOrEqual(500);
    expect(brief.observations![0]!.observation.length).toBeLessThanOrEqual(300);
    expect(brief.observations![0]!.evidence.length).toBeLessThanOrEqual(300);
    expect(brief.possibleOpportunity!.length).toBeLessThanOrEqual(400);
  });
});
