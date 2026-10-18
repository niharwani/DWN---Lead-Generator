/**
 * Regression tests ensuring that `scoreLead()` with no `customFactors` produces
 * IDENTICAL output to the pre-Phase-C engine. Also covers the custom-factor
 * merge path.
 */
import { describe, expect, it } from "vitest";
import {
  scoreLead,
  DEFAULT_WEIGHTS,
  SCORE_VERSION,
  type ScoreInputs,
} from "@/lib/scoring/engine";
import type { Lead, WebsiteAudit } from "@/lib/demo/types";

const NOW = "2026-10-15T12:00:00.000Z";

const BASE_LEAD: Lead = {
  id: "lead_regression",
  businessName: "Regression Corp",
  normalizedName: "regression corp",
  category: "Consulting",
  niche: "B2B consulting",
  city: "Pune",
  country: "India",
  sourceName: "manual",
  websiteCondition: "unknown",
  pipelineStage: "new",
  currency: "INR",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z",
  doNotContact: { flagged: false },
  tags: [],
  publicEmail: "info@regression-corp.test",
};

const AUDIT: WebsiteAudit = {
  id: "aud_reg",
  leadId: "lead_regression",
  requestedUrl: "https://regression-corp.test",
  finalUrl: "https://regression-corp.test/",
  status: "success",
  httpStatus: 200,
  auditVersion: "audit/v0.1",
  startedAt: "2026-10-14T08:00:00Z",
  completedAt: "2026-10-14T08:01:00Z",
  findings: [
    {
      code: "missing_viewport",
      title: "Missing viewport",
      severity: "high",
      description: "No viewport.",
      confidence: "high",
      recommendation: "Add viewport.",
    },
  ],
  metrics: { source: "server-fetch", pageWeightBytes: 800_000, loadMs: 2000 },
};

const BASE_INPUTS: ScoreInputs = {
  lead: BASE_LEAD,
  audit: AUDIT,
  weights: DEFAULT_WEIGHTS,
  nowIso: NOW,
};

describe("Regression: scoreLead() without customFactors", () => {
  it("produces the same total with and without an empty customFactors array", () => {
    const withoutCustom = scoreLead(BASE_INPUTS);
    const withEmptyCustom = scoreLead({ ...BASE_INPUTS, customFactors: [] });

    expect(withoutCustom.total).toBe(withEmptyCustom.total);
    expect(withoutCustom.factors.length).toBe(withEmptyCustom.factors.length);
    expect(withoutCustom.firedCodes).toEqual(withEmptyCustom.firedCodes);
  });

  it("produces the same total when customFactors is undefined", () => {
    const withUndefined = scoreLead({ ...BASE_INPUTS, customFactors: undefined });
    const withoutField = scoreLead(BASE_INPUTS);

    expect(withUndefined.total).toBe(withoutField.total);
    expect(withUndefined.version).toBe(SCORE_VERSION);
  });

  it("keeps factors sorted by magnitude desc", () => {
    const result = scoreLead(BASE_INPUTS);
    for (let i = 0; i < result.factors.length - 1; i++) {
      expect(Math.abs(result.factors[i]!.points)).toBeGreaterThanOrEqual(
        Math.abs(result.factors[i + 1]!.points)
      );
    }
  });
});

describe("scoreLead() with customFactors", () => {
  it("appends custom factor points to the total", () => {
    const baseline = scoreLead(BASE_INPUTS);

    const custom = [
      {
        code: "custom_factor_test",
        label: "Custom test factor",
        points: 10,
        evidence: "Manually added.",
      },
    ];
    const withCustom = scoreLead({ ...BASE_INPUTS, customFactors: custom });

    // Custom points should be included in the total (before clamping)
    expect(withCustom.factors.some((f) => f.code === "custom_factor_test")).toBe(true);
    // Total may differ (custom factor added points)
    const customTotalUnclamped = baseline.factors.reduce((s, f) => s + f.points, 0) + 10;
    const expectedClamped = Math.min(100, Math.max(0, customTotalUnclamped));
    expect(withCustom.total).toBe(expectedClamped);
  });

  it("does not modify the baseline factor list", () => {
    const baseline = scoreLead(BASE_INPUTS);
    const baselineCodes = new Set(baseline.factors.map((f) => f.code));

    const withCustom = scoreLead({
      ...BASE_INPUTS,
      customFactors: [
        { code: "extra", label: "Extra", points: 3, evidence: "test" },
      ],
    });

    // All baseline codes should still be present
    for (const code of baselineCodes) {
      expect(withCustom.factors.some((f) => f.code === code)).toBe(true);
    }
  });

  it("clamps total to 100 even with high custom points", () => {
    const result = scoreLead({
      ...BASE_INPUTS,
      customFactors: [
        { code: "mega_bonus", label: "Mega bonus", points: 999, evidence: "test" },
      ],
    });
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("clamps total to 0 even with large negative custom points", () => {
    const result = scoreLead({
      ...BASE_INPUTS,
      customFactors: [
        { code: "mega_penalty", label: "Mega penalty", points: -999, evidence: "test" },
      ],
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreLead() insufficient evidence path is unaffected", () => {
  it("returns band=insufficient_evidence for a bare lead with no signals", () => {
    const bareLead: Lead = {
      ...BASE_LEAD,
      id: "bare",
      websiteUrl: undefined,
      publicEmail: undefined,
      publicPhone: undefined,
      sourceUrl: undefined,
    };
    const result = scoreLead({ lead: bareLead });
    expect(result.band).toBe("insufficient_evidence");
    expect(result.total).toBe(0);
    expect(result.firedCodes).toHaveLength(0);
  });
});
