import { describe, it, expect } from "vitest";
import { rowToLead, scoreBreakdownToColumns } from "@/lib/db/adapt";
import type { Lead as LeadRow } from "@/lib/db/schema";

/**
 * Confidence that the adapter round-trips the score shape without data loss
 * and that `do_not_contact` fields unflatten into the nested view-model.
 */

function baseRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead_test",
    ownerId: "owner_test",
    businessName: "Test Business",
    normalizedName: "test business",
    category: "cat",
    niche: "test",
    websiteUrl: null,
    normalizedDomain: null,
    publicEmail: null,
    publicPhone: null,
    address: null,
    city: "Mumbai",
    region: null,
    country: "India",
    sourceName: "manual",
    sourceUrl: null,
    sourceExternalId: null,
    sourceLastCheckedAt: null,
    websiteCondition: "unknown",
    fitScore: null,
    evidenceConfidence: "insufficient",
    scoreBand: null,
    scoreBreakdown: null,
    scoreVersion: null,
    scoredAt: null,
    pipelineStage: "new",
    estimatedDealValue: null,
    currency: "INR",
    lossReason: null,
    lastContactedAt: null,
    nextActionAt: null,
    tags: [],
    doNotContact: false,
    doNotContactReason: null,
    doNotContactAt: null,
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

describe("rowToLead", () => {
  it("returns no score object when scoring columns are null", () => {
    const view = rowToLead(baseRow());
    expect(view.score).toBeUndefined();
  });

  it("assembles the nested score object when all scoring columns are populated", () => {
    const factors = [
      { code: "no_website", label: "No website", points: 20, evidence: "manual" },
    ];
    const view = rowToLead(
      baseRow({
        fitScore: 85,
        evidenceConfidence: "high",
        scoreBand: "priority_review",
        scoreBreakdown: factors,
        scoreVersion: "scoring/v0.1-template",
        scoredAt: "2026-10-14T00:00:00.000Z",
      })
    );
    expect(view.score).toBeDefined();
    expect(view.score!.total).toBe(85);
    expect(view.score!.confidence).toBe("high");
    expect(view.score!.band).toBe("priority_review");
    expect(view.score!.factors).toEqual(factors);
  });

  it("unflattens do_not_contact fields into a nested object", () => {
    const view = rowToLead(
      baseRow({
        doNotContact: true,
        doNotContactReason: "requested removal",
        doNotContactAt: "2026-10-14T00:00:00.000Z",
      })
    );
    expect(view.doNotContact).toEqual({
      flagged: true,
      reason: "requested removal",
      flaggedAt: "2026-10-14T00:00:00.000Z",
    });
  });
});

describe("scoreBreakdownToColumns", () => {
  it("derives the band when the input omits one", () => {
    const cols = scoreBreakdownToColumns({
      total: 85,
      version: "scoring/v0.1-template",
      computedAt: "2026-10-14T00:00:00.000Z",
      confidence: "high",
      factors: [],
      // Casting around the discriminated-type requirement — the helper derives
      // the band from (total, confidence).
      band: undefined as unknown as "priority_review",
    });
    expect(cols.scoreBand).toBe("priority_review");
    expect(cols.fitScore).toBe(85);
    expect(cols.evidenceConfidence).toBe("high");
    expect(cols.scoreVersion).toBe("scoring/v0.1-template");
  });

  it("preserves an explicit band when supplied", () => {
    const cols = scoreBreakdownToColumns({
      total: 55,
      version: "v",
      computedAt: "2026-10-14T00:00:00.000Z",
      confidence: "medium",
      factors: [],
      band: "needs_manual_review",
    });
    expect(cols.scoreBand).toBe("needs_manual_review");
  });
});
