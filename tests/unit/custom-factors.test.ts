import { describe, expect, it } from "vitest";
import {
  evaluateCustomFactors,
  type CustomScoreFactor,
} from "@/lib/scoring/custom-factors";
import type { ScoreInputs } from "@/lib/scoring/engine";
import type { Lead, WebsiteAudit } from "@/lib/demo/types";

const BASE_LEAD: Lead = {
  id: "lead_test",
  businessName: "Test Studio",
  normalizedName: "test studio",
  category: "D2C skincare brand",
  niche: "D2C consumer brands",
  city: "Mumbai",
  country: "India",
  sourceName: "manual",
  websiteCondition: "unknown",
  pipelineStage: "new",
  currency: "INR",
  createdAt: "2026-10-10T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z",
  doNotContact: { flagged: false },
  tags: [],
  publicEmail: "hello@test.studio",
};

const SUCCESS_AUDIT: WebsiteAudit = {
  id: "aud_01",
  leadId: "lead_test",
  requestedUrl: "https://test.studio",
  finalUrl: "https://test.studio/",
  status: "success",
  httpStatus: 200,
  auditVersion: "audit/v0.1",
  startedAt: "2026-10-14T08:00:00Z",
  completedAt: "2026-10-14T08:00:01Z",
  findings: [
    {
      code: "missing_viewport",
      title: "Missing viewport",
      severity: "high",
      description: "No viewport meta tag found.",
      evidence: "instagram.com link found in page",
      confidence: "high",
      recommendation: "Add meta viewport.",
    },
  ],
};

const INPUTS: ScoreInputs = {
  lead: BASE_LEAD,
  audit: SUCCESS_AUDIT,
};

describe("evaluateCustomFactors() — presence method", () => {
  it("fires when the specified lead field is non-empty", () => {
    const factor: CustomScoreFactor = {
      id: "f1",
      code: "has_email",
      label: "Has email",
      points: 5,
      enabled: true,
      detectionMethod: "presence",
      detectionConfig: { field: "publicEmail" },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe("has_email");
    expect(results[0]!.points).toBe(5);
  });

  it("does not fire when the specified field is absent", () => {
    const factor: CustomScoreFactor = {
      id: "f2",
      code: "has_phone",
      label: "Has phone",
      points: 5,
      enabled: true,
      detectionMethod: "presence",
      detectionConfig: { field: "publicPhone" },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(0);
  });

  it("does not fire when factor is disabled", () => {
    const factor: CustomScoreFactor = {
      id: "f3",
      code: "has_email_disabled",
      label: "Has email (disabled)",
      points: 5,
      enabled: false,
      detectionMethod: "presence",
      detectionConfig: { field: "publicEmail" },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(0);
  });
});

describe("evaluateCustomFactors() — regex method", () => {
  it("fires when regex matches audit finding evidence", () => {
    const factor: CustomScoreFactor = {
      id: "f4",
      code: "mentions_instagram",
      label: "Mentions Instagram",
      points: 8,
      enabled: true,
      detectionMethod: "regex",
      detectionConfig: { pattern: "instagram", flags: "i" },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe("mentions_instagram");
  });

  it("does not fire when regex does not match", () => {
    const factor: CustomScoreFactor = {
      id: "f5",
      code: "mentions_tiktok",
      label: "Mentions TikTok",
      points: 8,
      enabled: true,
      detectionMethod: "regex",
      detectionConfig: { pattern: "tiktok\\.com", flags: "i" },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(0);
  });

  it("fires when regex matches lead business name", () => {
    const factor: CustomScoreFactor = {
      id: "f6",
      code: "name_has_studio",
      label: "Name contains studio",
      points: 3,
      enabled: true,
      detectionMethod: "regex",
      detectionConfig: { pattern: "studio", flags: "i" },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(1);
  });

  it("gracefully handles invalid regex", () => {
    const factor: CustomScoreFactor = {
      id: "f7",
      code: "invalid_regex",
      label: "Invalid",
      points: 5,
      enabled: true,
      detectionMethod: "regex",
      detectionConfig: { pattern: "[invalid(", flags: "" },
    };
    // Should not throw
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(0);
  });
});

describe("evaluateCustomFactors() — count method", () => {
  it("fires when auditFindingsCount meets threshold", () => {
    const factor: CustomScoreFactor = {
      id: "f8",
      code: "many_findings",
      label: "Has audit findings",
      points: 10,
      enabled: true,
      detectionMethod: "count",
      detectionConfig: { field: "auditFindingsCount", operator: ">=", threshold: 1 },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(1);
    expect(results[0]!.points).toBe(10);
  });

  it("does not fire when count is below threshold", () => {
    const factor: CustomScoreFactor = {
      id: "f9",
      code: "many_findings_3",
      label: "Has 3+ findings",
      points: 10,
      enabled: true,
      detectionMethod: "count",
      detectionConfig: { field: "auditFindingsCount", operator: ">=", threshold: 3 },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(0);
  });

  it("fires for == operator at exact match", () => {
    const factor: CustomScoreFactor = {
      id: "f10",
      code: "exact_1_finding",
      label: "Exactly 1 finding",
      points: 5,
      enabled: true,
      detectionMethod: "count",
      detectionConfig: { field: "auditFindingsCount", operator: "==", threshold: 1 },
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(1);
  });

  it("does not fire when audit is absent", () => {
    const factor: CustomScoreFactor = {
      id: "f11",
      code: "no_audit",
      label: "Needs audit",
      points: 5,
      enabled: true,
      detectionMethod: "count",
      detectionConfig: { field: "auditFindingsCount", operator: ">=", threshold: 1 },
    };
    const noAuditInputs: ScoreInputs = { lead: BASE_LEAD };
    const results = evaluateCustomFactors([factor], noAuditInputs);
    expect(results).toHaveLength(0);
  });
});

describe("evaluateCustomFactors() — manual method", () => {
  it("always fires when enabled", () => {
    const factor: CustomScoreFactor = {
      id: "f12",
      code: "always_on",
      label: "Always applies",
      points: -5,
      enabled: true,
      detectionMethod: "manual",
      detectionConfig: null,
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(1);
    expect(results[0]!.points).toBe(-5);
  });

  it("does not fire when disabled", () => {
    const factor: CustomScoreFactor = {
      id: "f13",
      code: "always_off",
      label: "Disabled",
      points: -5,
      enabled: false,
      detectionMethod: "manual",
      detectionConfig: null,
    };
    const results = evaluateCustomFactors([factor], INPUTS);
    expect(results).toHaveLength(0);
  });
});

describe("evaluateCustomFactors() — weight merging", () => {
  it("returns multiple firing factors in sequence", () => {
    const factors: CustomScoreFactor[] = [
      {
        id: "m1",
        code: "f_email",
        label: "Has email",
        points: 5,
        enabled: true,
        detectionMethod: "presence",
        detectionConfig: { field: "publicEmail" },
      },
      {
        id: "m2",
        code: "f_manual",
        label: "Always on",
        points: -3,
        enabled: true,
        detectionMethod: "manual",
        detectionConfig: null,
      },
    ];
    const results = evaluateCustomFactors(factors, INPUTS);
    expect(results).toHaveLength(2);
    const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
    expect(totalPoints).toBe(2); // 5 + (-3)
  });

  it("returns empty array when no factors are provided", () => {
    const results = evaluateCustomFactors([], INPUTS);
    expect(results).toHaveLength(0);
  });
});
