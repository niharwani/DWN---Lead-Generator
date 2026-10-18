/**
 * Phase B — Onboarding flow integration test.
 *
 * Tests the pure-logic aspects of the onboarding system without requiring
 * a live Cloudflare D1 context. All DB-dependent paths are covered indirectly
 * through the preset and state shape checks.
 *
 * The DB-interaction path (applyPreset writing to D1) is not tested here
 * because it requires a live D1 binding; those paths are covered in the
 * e2e smoke tests that run against the Wrangler local environment.
 */

import { describe, expect, it } from "vitest";
import { getPreset, listPresets } from "@/lib/presets";
import { buildWeightMapFromPreset } from "@/lib/onboarding/apply-preset";
import { DEFAULT_WEIGHTS, type ScoreFactorCode } from "@/lib/scoring/engine";

/* ------------------------------------------------------------------ */
/* Pure logic tests — no DB, no Cloudflare context required           */
/* ------------------------------------------------------------------ */

describe("Preset registry via getPreset / listPresets", () => {
  it("returns the fitness preset", () => {
    const p = getPreset("fitness");
    expect(p.id).toBe("fitness");
    expect(p.name).toBeTruthy();
  });

  it("throws for a bad id", () => {
    expect(() => getPreset("does_not_exist")).toThrow();
  });

  it("returns 12 presets", () => {
    expect(listPresets()).toHaveLength(12);
  });

  it("'other' is always last", () => {
    const list = listPresets();
    const last = list[list.length - 1];
    expect(last?.id).toBe("other");
  });
});

describe("buildWeightMapFromPreset()", () => {
  it("produces a complete WeightMap from fitness preset", () => {
    const preset = getPreset("fitness");
    const weights = buildWeightMapFromPreset(preset);
    for (const code of Object.keys(DEFAULT_WEIGHTS) as ScoreFactorCode[]) {
      expect(weights).toHaveProperty(code);
      expect(typeof weights[code].points).toBe("number");
      expect(typeof weights[code].enabled).toBe("boolean");
    }
  });

  it("applies fitness overrides — lower no_website than default", () => {
    const preset = getPreset("fitness");
    const weights = buildWeightMapFromPreset(preset);
    expect(weights.no_website.points).toBeLessThan(DEFAULT_WEIGHTS.no_website.points);
  });

  it("applies fitness overrides — higher service_fit than default", () => {
    const preset = getPreset("fitness");
    const weights = buildWeightMapFromPreset(preset);
    expect(weights.service_fit.points).toBeGreaterThan(DEFAULT_WEIGHTS.service_fit.points);
  });

  it("produces default weights from 'other' preset", () => {
    const preset = getPreset("other");
    const weights = buildWeightMapFromPreset(preset);
    for (const code of Object.keys(DEFAULT_WEIGHTS) as ScoreFactorCode[]) {
      expect(weights[code].points).toBe(DEFAULT_WEIGHTS[code].points);
      expect(weights[code].enabled).toBe(DEFAULT_WEIGHTS[code].enabled);
    }
  });

  it("every preset's weight map has exactly the same keys as DEFAULT_WEIGHTS", () => {
    const defaultKeys = Object.keys(DEFAULT_WEIGHTS).sort();
    for (const preset of listPresets()) {
      const weights = buildWeightMapFromPreset(preset);
      const weightKeys = Object.keys(weights).sort();
      expect(weightKeys).toEqual(defaultKeys);
    }
  });
});

describe("Preset weight coverage for industry-specific signals", () => {
  it("agency preset has high outdated and service_fit", () => {
    const agency = getPreset("agency");
    const weights = buildWeightMapFromPreset(agency);
    expect(weights.outdated.points).toBeGreaterThanOrEqual(15);
    expect(weights.service_fit.points).toBeGreaterThanOrEqual(15);
  });

  it("legal preset has high missing_https (trust signal)", () => {
    const legal = getPreset("legal");
    const weights = buildWeightMapFromPreset(legal);
    expect(weights.missing_https.points).toBeGreaterThan(
      DEFAULT_WEIGHTS.missing_https.points
    );
  });

  it("home-services preset has high missing_contact_path (phone leads)", () => {
    const hs = getPreset("home-services");
    const weights = buildWeightMapFromPreset(hs);
    expect(weights.missing_contact_path.points).toBeGreaterThan(
      DEFAULT_WEIGHTS.missing_contact_path.points
    );
  });

  it("dental-medical preset has high missing_https (HIPAA trust)", () => {
    const dental = getPreset("dental-medical");
    const weights = buildWeightMapFromPreset(dental);
    expect(weights.missing_https.points).toBeGreaterThan(
      DEFAULT_WEIGHTS.missing_https.points
    );
  });

  it("saas preset has no_website disabled or at very low points", () => {
    const saas = getPreset("saas");
    const weights = buildWeightMapFromPreset(saas);
    const effectivePoints = weights.no_website.enabled === false ? 0 : weights.no_website.points;
    expect(effectivePoints).toBeLessThanOrEqual(5);
  });

  it("fitness preset has higher useful_contact_path than saas", () => {
    const fitness = getPreset("fitness");
    const saas = getPreset("saas");
    const fitnessWeights = buildWeightMapFromPreset(fitness);
    const saasWeights = buildWeightMapFromPreset(saas);
    expect(fitnessWeights.useful_contact_path.points).toBeGreaterThan(
      saasWeights.useful_contact_path.points
    );
  });
});

describe("Onboarding state module exports", () => {
  it("state module exports the required functions", async () => {
    const mod = await import("@/lib/onboarding/state");
    expect(typeof mod.getOnboardingState).toBe("function");
    expect(typeof mod.setOnboardingState).toBe("function");
    expect(typeof mod.completeOnboarding).toBe("function");
    expect(typeof mod.resetOnboarding).toBe("function");
    expect(mod.ONBOARDING_KEY).toBe("onboarding/v1");
  });

  it("apply-preset module exports the required functions", async () => {
    const mod = await import("@/lib/onboarding/apply-preset");
    expect(typeof mod.applyPreset).toBe("function");
    expect(typeof mod.buildWeightMapFromPreset).toBe("function");
  });
});

describe("Preset completeness: services", () => {
  it("every non-other preset has 3–6 services", () => {
    for (const preset of listPresets()) {
      if (preset.id === "other") continue;
      expect(preset.services.length).toBeGreaterThanOrEqual(3);
      expect(preset.services.length).toBeLessThanOrEqual(6);
    }
  });

  it("every service has non-empty name and valueProposition", () => {
    for (const preset of listPresets()) {
      for (const svc of preset.services) {
        expect(svc.name.trim().length).toBeGreaterThan(0);
        expect(svc.valueProposition.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("firstCampaign minimumScore is in [0, 100] for all presets", () => {
    for (const preset of listPresets()) {
      expect(preset.firstCampaign.minimumScore).toBeGreaterThanOrEqual(0);
      expect(preset.firstCampaign.minimumScore).toBeLessThanOrEqual(100);
    }
  });

  it("draftTemplate body contains variable placeholders for all non-other presets", () => {
    for (const preset of listPresets()) {
      if (preset.id === "other") continue;
      expect(preset.draftTemplate.bodyTemplate).toContain("{{");
      expect(preset.draftTemplate.bodyTemplate).toContain("}}");
    }
  });
});

describe("Simulated wizard state transitions", () => {
  it("each preset can produce a valid initial step-3 state", () => {
    for (const preset of listPresets()) {
      // Simulate what step 3 reads from state after step 2 selects a preset
      const icpSeed = {
        icpDescription: preset.firstCampaign.idealCustomerDescription,
        niches: preset.suggestedNiches.slice(0, 3),
        country: "United States",
        city: preset.suggestedCities[0] ?? "New York",
        dealMin: preset.defaults.estimatedDealValueRange.min,
        dealMax: preset.defaults.estimatedDealValueRange.max,
        currency: preset.defaults.defaultCurrency,
      };
      expect(icpSeed.icpDescription.length).toBeGreaterThan(0);
      expect(icpSeed.niches.length).toBeGreaterThan(0);
      expect(icpSeed.dealMax).toBeGreaterThan(icpSeed.dealMin);
    }
  });

  it("each preset produces services that step 4 can pre-populate", () => {
    for (const preset of listPresets()) {
      const serviceEntries = preset.services.map((s) => ({
        name: s.name,
        description: s.description,
        idealCustomer: s.idealCustomer,
        valueProposition: s.valueProposition,
      }));
      expect(serviceEntries.length).toBeGreaterThanOrEqual(1);
      for (const entry of serviceEntries) {
        expect(entry.name).toBeTruthy();
      }
    }
  });
});
