import { describe, it, expect } from "vitest";
import {
  PLANS,
  getPlan,
  comparePlans,
  type PlanId,
  type Feature,
} from "@/lib/billing/plans";

const ALL_PLAN_IDS: PlanId[] = ["free", "freelancer", "teams", "studio"];

const ALL_FEATURES: Feature[] = [
  "ai_drafts",
  "gmail_send",
  "outlook_send",
  "cadences",
  "variant_analytics",
  "slack_notifications",
  "webhooks",
  "calendar",
  "scheduled_exports",
  "audit_log",
  "custom_factors",
  "custom_signals",
  "rbac",
  "sso",
  "white_label",
];

describe("PLANS shape", () => {
  it("has all four plan IDs", () => {
    expect(Object.keys(PLANS)).toEqual(
      expect.arrayContaining(ALL_PLAN_IDS)
    );
  });

  it("each plan has an id that matches its key", () => {
    for (const planId of ALL_PLAN_IDS) {
      expect(PLANS[planId].id).toBe(planId);
    }
  });

  it("each plan has a name string", () => {
    for (const planId of ALL_PLAN_IDS) {
      expect(typeof PLANS[planId].name).toBe("string");
      expect(PLANS[planId].name.length).toBeGreaterThan(0);
    }
  });

  it("each plan has features as an array", () => {
    for (const planId of ALL_PLAN_IDS) {
      expect(Array.isArray(PLANS[planId].features)).toBe(true);
    }
  });

  it("all feature values in features arrays are valid Feature types", () => {
    for (const planId of ALL_PLAN_IDS) {
      for (const feature of PLANS[planId].features) {
        expect(ALL_FEATURES).toContain(feature);
      }
    }
  });

  it("every Feature appears in at least one plan", () => {
    const coveredFeatures = new Set<Feature>();
    for (const planId of ALL_PLAN_IDS) {
      for (const feature of PLANS[planId].features) {
        coveredFeatures.add(feature);
      }
    }
    for (const feature of ALL_FEATURES) {
      expect(coveredFeatures.has(feature)).toBe(true);
    }
  });

  it("free plan has no features", () => {
    expect(PLANS.free.features).toHaveLength(0);
  });

  it("studio plan has the most features", () => {
    const studioCt = PLANS.studio.features.length;
    for (const planId of ALL_PLAN_IDS) {
      expect(studioCt).toBeGreaterThanOrEqual(PLANS[planId].features.length);
    }
  });

  it("teams plan includes all freelancer features", () => {
    for (const feature of PLANS.freelancer.features) {
      expect(PLANS.teams.features).toContain(feature);
    }
  });

  it("studio plan includes all teams features", () => {
    for (const feature of PLANS.teams.features) {
      expect(PLANS.studio.features).toContain(feature);
    }
  });
});

describe("numeric fields are null (pre-launch)", () => {
  it("priceMonthlyUsd is null for paid plans", () => {
    // free is free; paid plans should have null until launch
    expect(PLANS.freelancer.priceMonthlyUsd).toBeNull();
    expect(PLANS.teams.priceMonthlyUsd).toBeNull();
    expect(PLANS.studio.priceMonthlyUsd).toBeNull();
  });

  it("priceAnnualUsd is null for paid plans", () => {
    expect(PLANS.freelancer.priceAnnualUsd).toBeNull();
    expect(PLANS.teams.priceAnnualUsd).toBeNull();
    expect(PLANS.studio.priceAnnualUsd).toBeNull();
  });

  it("razorpayPlanIdMonthly is null for all plans", () => {
    for (const planId of ALL_PLAN_IDS) {
      expect(PLANS[planId].razorpayPlanIdMonthly).toBeNull();
    }
  });

  it("razorpayPlanIdAnnual is null for all plans", () => {
    for (const planId of ALL_PLAN_IDS) {
      expect(PLANS[planId].razorpayPlanIdAnnual).toBeNull();
    }
  });

  it("quota limits are null (unlimited placeholder) for all plans", () => {
    for (const planId of ALL_PLAN_IDS) {
      const plan = PLANS[planId];
      for (const [, val] of Object.entries(plan.limits)) {
        expect(val).toBeNull();
      }
    }
  });
});

describe("getPlan", () => {
  it("returns the correct plan object", () => {
    for (const planId of ALL_PLAN_IDS) {
      expect(getPlan(planId)).toBe(PLANS[planId]);
    }
  });
});

describe("comparePlans", () => {
  it("returns 0 for equal plans", () => {
    expect(comparePlans("free", "free")).toBe(0);
    expect(comparePlans("teams", "teams")).toBe(0);
  });

  it("free < freelancer < teams < studio", () => {
    expect(comparePlans("free", "freelancer")).toBe(-1);
    expect(comparePlans("freelancer", "teams")).toBe(-1);
    expect(comparePlans("teams", "studio")).toBe(-1);
  });

  it("is antisymmetric (reversal flips sign)", () => {
    expect(comparePlans("freelancer", "free")).toBe(1);
    expect(comparePlans("teams", "freelancer")).toBe(1);
    expect(comparePlans("studio", "teams")).toBe(1);
  });

  it("is transitive: free < teams", () => {
    expect(comparePlans("free", "teams")).toBe(-1);
  });

  it("studio > free", () => {
    expect(comparePlans("studio", "free")).toBe(1);
  });
});
