/**
 * Unit tests for the pricing page data layer.
 *
 * Verifies that PLANS contains the correct structure for what the pricing page
 * renders: Free, Freelancer, Teams visible tiers + Studio "contact us" card.
 */

import { describe, it, expect } from "vitest";
import { PLANS, type PlanId, type Feature } from "@/lib/billing/plans";

const VISIBLE_TIERS: PlanId[] = ["free", "freelancer", "teams"];
const CONTACT_TIER: PlanId = "studio";

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

describe("pricing page — plan data from PLANS", () => {
  it("all three visible tiers are present in PLANS", () => {
    for (const tier of VISIBLE_TIERS) {
      expect(PLANS[tier]).toBeDefined();
      expect(PLANS[tier].id).toBe(tier);
    }
  });

  it("Studio tier is present for the contact card", () => {
    expect(PLANS[CONTACT_TIER]).toBeDefined();
    expect(PLANS[CONTACT_TIER].id).toBe(CONTACT_TIER);
  });

  it("each visible tier has a name string", () => {
    for (const tier of VISIBLE_TIERS) {
      expect(typeof PLANS[tier].name).toBe("string");
      expect(PLANS[tier].name.length).toBeGreaterThan(0);
    }
  });

  it("each visible tier has a features array", () => {
    for (const tier of VISIBLE_TIERS) {
      expect(Array.isArray(PLANS[tier].features)).toBe(true);
    }
  });

  it("features in each tier are valid Feature values", () => {
    for (const tier of [...VISIBLE_TIERS, CONTACT_TIER]) {
      for (const feature of PLANS[tier].features) {
        expect(ALL_FEATURES).toContain(feature);
      }
    }
  });

  it("free plan has no features (watermarked / lead-magnet tier)", () => {
    expect(PLANS.free.features).toHaveLength(0);
  });

  it("freelancer plan has ai_drafts and gmail_send", () => {
    expect(PLANS.freelancer.features).toContain("ai_drafts");
    expect(PLANS.freelancer.features).toContain("gmail_send");
  });

  it("teams plan has all freelancer features plus more", () => {
    for (const feature of PLANS.freelancer.features) {
      expect(PLANS.teams.features).toContain(feature);
    }
    // Teams-exclusive features
    expect(PLANS.teams.features).toContain("rbac");
    expect(PLANS.teams.features).toContain("outlook_send");
    expect(PLANS.teams.features).toContain("webhooks");
  });

  it("pricing values are null (pre-launch placeholder)", () => {
    // Pricing page should render 'TBD' / 'Contact us' for null prices
    for (const tier of VISIBLE_TIERS) {
      expect(PLANS[tier].priceMonthlyUsd).toBeNull();
      expect(PLANS[tier].priceAnnualUsd).toBeNull();
    }
  });

  it("Razorpay plan ID fields (renamed from Stripe) are null until launch", () => {
    // The Razorpay agent renames stripePriceId* → razorpayPlanId*
    // Razorpay is the sole billing provider. Fields are null until launch.
    for (const tier of VISIBLE_TIERS) {
      const plan = PLANS[tier];
      expect(plan.razorpayPlanIdMonthly).toBeNull();
      expect(plan.razorpayPlanIdAnnual).toBeNull();
    }
  });

  it("feature matrix covers all 15 Feature values across all plans", () => {
    const coveredFeatures = new Set<Feature>();
    for (const tier of [...VISIBLE_TIERS, CONTACT_TIER]) {
      for (const f of PLANS[tier].features) {
        coveredFeatures.add(f);
      }
    }
    for (const feature of ALL_FEATURES) {
      expect(coveredFeatures.has(feature)).toBe(true);
    }
  });
});
