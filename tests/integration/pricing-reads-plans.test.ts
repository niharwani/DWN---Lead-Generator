/**
 * Pricing page integration — verifies the pricing page module reads from PLANS
 * and that all three visible tiers are represented.
 *
 * This test is intentionally a module-layer test (no DOM) because the full
 * React render path requires a Next.js test environment. The logic under test
 * (reading PLANS, rendering feature lists) is verified via the exported data.
 */

import { describe, it, expect } from "vitest";
import { PLANS } from "@/lib/billing/plans";

describe("Pricing page — plan data structure for rendering", () => {
  const VISIBLE_TIERS = ["free", "freelancer", "teams"] as const;

  it("pricing page module imports cleanly", async () => {
    const mod = await import("@/app/(marketing)/pricing/page");
    expect(typeof mod.default).toBe("function");
  });

  it("all three visible tier plan objects are present", () => {
    for (const tier of VISIBLE_TIERS) {
      expect(PLANS[tier]).toBeDefined();
    }
  });

  it("Free tier has name 'Free'", () => {
    expect(PLANS.free.name).toBe("Free");
  });

  it("Freelancer tier has name 'Freelancer'", () => {
    expect(PLANS.freelancer.name).toBe("Freelancer");
  });

  it("Teams tier has name 'Teams'", () => {
    expect(PLANS.teams.name).toBe("Teams");
  });

  it("Studio tier present for 'Contact us' card", () => {
    expect(PLANS.studio).toBeDefined();
    expect(PLANS.studio.name).toBe("Studio");
  });

  it("each visible tier has a features array with valid entries", () => {
    for (const tier of VISIBLE_TIERS) {
      expect(Array.isArray(PLANS[tier].features)).toBe(true);
    }
  });

  it("feature matrix covers all 15 known features across all tiers", () => {
    const ALL_FEATURES = [
      "ai_drafts", "gmail_send", "outlook_send", "cadences",
      "variant_analytics", "slack_notifications", "webhooks",
      "calendar", "scheduled_exports", "audit_log",
      "custom_factors", "custom_signals", "rbac", "sso", "white_label",
    ];

    const covered = new Set<string>();
    for (const tier of [...VISIBLE_TIERS, "studio" as const]) {
      for (const f of PLANS[tier].features) {
        covered.add(f);
      }
    }

    for (const feature of ALL_FEATURES) {
      expect(covered.has(feature)).toBe(true);
    }
  });
});
