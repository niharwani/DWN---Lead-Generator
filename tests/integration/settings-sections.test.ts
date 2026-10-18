/**
 * SSR smoke tests for Phase C settings section components.
 *
 * These tests verify that the pure-logic / non-React parts of the section
 * modules import without error and that the exported types/functions are
 * present. Full React SSR rendering requires a Next.js test environment which
 * is not available in Vitest's node environment; this suite focuses on the
 * JS module layer.
 */
import { describe, expect, it } from "vitest";
import { substitute } from "@/lib/variables/registry";
import { evaluateCustomFactors } from "@/lib/scoring/custom-factors";
import { evaluateCustomSignals } from "@/lib/audit/custom-signals";
import { buildTemplateDraft } from "@/lib/outreach/draft";

describe("Settings section modules — import smoke", () => {
  it("variable registry exports substitute() function", () => {
    expect(typeof substitute).toBe("function");
  });

  it("custom-factors exports evaluateCustomFactors() function", () => {
    expect(typeof evaluateCustomFactors).toBe("function");
  });

  it("custom-signals exports evaluateCustomSignals() function", () => {
    expect(typeof evaluateCustomSignals).toBe("function");
  });

  it("draft.ts exports buildTemplateDraft() function", () => {
    expect(typeof buildTemplateDraft).toBe("function");
  });
});

describe("Settings section modules — basic rendering contracts", () => {
  it("substitute() returns a string output object", () => {
    const { output } = substitute("Hello {{lead.business_name}}", {
      lead: { businessName: "Test" },
    });
    expect(typeof output).toBe("string");
    expect(output).toBe("Hello Test");
  });

  it("evaluateCustomFactors() returns an array", () => {
    const result = evaluateCustomFactors([], {
      lead: {
        id: "l1",
        businessName: "Test",
        normalizedName: "test",
        category: "",
        niche: "Test",
        city: "Mumbai",
        country: "India",
        sourceName: "manual",
        websiteCondition: "unknown",
        pipelineStage: "new",
        currency: "INR",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
        doNotContact: { flagged: false },
        tags: [],
      },
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("evaluateCustomSignals() returns an array", () => {
    const result = evaluateCustomSignals([], { html: "<html></html>" });
    expect(Array.isArray(result)).toBe(true);
  });
});
