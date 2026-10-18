/**
 * Phase B — Preset library unit tests.
 *
 * Asserts that:
 *   1. All 12 presets load without errors.
 *   2. Each preset has a valid IndustryPreset shape (required fields present).
 *   3. Services array is non-empty for all presets except 'other'.
 *   4. scoringOverrides keys are valid ScoreFactorCode strings.
 *   5. The PRESETS registry keys match the preset IDs.
 *   6. listPresets() returns all 12 presets with 'other' last.
 *   7. getPreset() throws for unknown IDs.
 */

import { describe, expect, it } from "vitest";
import { PRESETS, listPresets, getPreset } from "@/lib/presets";
import type { IndustryPreset } from "@/lib/presets/types";
import { DEFAULT_WEIGHTS, type ScoreFactorCode } from "@/lib/scoring/engine";

const VALID_FACTOR_CODES = new Set<string>(Object.keys(DEFAULT_WEIGHTS));

const EXPECTED_PRESET_IDS = [
  "agency",
  "fitness",
  "saas",
  "real-estate",
  "home-services",
  "consultant",
  "ecommerce",
  "marketing",
  "accounting",
  "legal",
  "dental-medical",
  "other",
];

describe("PRESETS registry", () => {
  it("has exactly 12 presets", () => {
    expect(Object.keys(PRESETS)).toHaveLength(12);
  });

  it("contains all expected preset IDs", () => {
    for (const id of EXPECTED_PRESET_IDS) {
      expect(PRESETS).toHaveProperty(id);
    }
  });

  it("registry keys match preset IDs", () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(preset.id).toBe(key);
    }
  });
});

describe("listPresets()", () => {
  it("returns all 12 presets", () => {
    expect(listPresets()).toHaveLength(12);
  });

  it("places 'other' last", () => {
    const list = listPresets();
    const last = list[list.length - 1];
    expect(last?.id).toBe("other");
  });

  it("does not duplicate presets", () => {
    const ids = listPresets().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getPreset()", () => {
  it("returns the correct preset for a valid id", () => {
    const p = getPreset("fitness");
    expect(p.id).toBe("fitness");
    expect(p.name).toBeTruthy();
  });

  it("throws for an unknown id", () => {
    expect(() => getPreset("nonexistent_preset_xyz")).toThrow();
  });
});

describe.each(EXPECTED_PRESET_IDS)("preset '%s'", (presetId) => {
  let preset: IndustryPreset;

  it("loads without error", () => {
    preset = getPreset(presetId);
    expect(preset).toBeDefined();
  });

  it("has a non-empty id string", () => {
    preset = getPreset(presetId);
    expect(typeof preset.id).toBe("string");
    expect(preset.id.length).toBeGreaterThan(0);
  });

  it("has a non-empty name", () => {
    preset = getPreset(presetId);
    expect(typeof preset.name).toBe("string");
    expect(preset.name.length).toBeGreaterThan(0);
  });

  it("has a non-empty tagline", () => {
    preset = getPreset(presetId);
    expect(typeof preset.tagline).toBe("string");
    expect(preset.tagline.length).toBeGreaterThan(0);
  });

  it("has recommendedFor with at least 1 entry", () => {
    preset = getPreset(presetId);
    expect(Array.isArray(preset.recommendedFor)).toBe(true);
    expect(preset.recommendedFor.length).toBeGreaterThanOrEqual(1);
  });

  it("has valid defaults object", () => {
    preset = getPreset(presetId);
    expect(typeof preset.defaults.pitch).toBe("string");
    expect(preset.defaults.pitch.length).toBeGreaterThan(0);
    expect(typeof preset.defaults.shortBio).toBe("string");
    expect(typeof preset.defaults.defaultCurrency).toBe("string");
    expect(typeof preset.defaults.estimatedDealValueRange.min).toBe("number");
    expect(typeof preset.defaults.estimatedDealValueRange.max).toBe("number");
    expect(preset.defaults.estimatedDealValueRange.max).toBeGreaterThan(
      preset.defaults.estimatedDealValueRange.min
    );
  });

  it(
    presetId === "other"
      ? "has at least 1 service (placeholder) for 'other'"
      : "has 3–6 services",
    () => {
      preset = getPreset(presetId);
      expect(Array.isArray(preset.services)).toBe(true);
      expect(preset.services.length).toBeGreaterThanOrEqual(1);
      if (presetId !== "other") {
        expect(preset.services.length).toBeGreaterThanOrEqual(3);
        expect(preset.services.length).toBeLessThanOrEqual(6);
      }
    }
  );

  it("each service has name, description, idealCustomer, valueProposition", () => {
    preset = getPreset(presetId);
    for (const svc of preset.services) {
      expect(typeof svc.name).toBe("string");
      expect(svc.name.length).toBeGreaterThan(0);
      expect(typeof svc.description).toBe("string");
      expect(svc.description.length).toBeGreaterThan(0);
      expect(typeof svc.idealCustomer).toBe("string");
      expect(typeof svc.valueProposition).toBe("string");
    }
  });

  it("scoringOverrides contains only valid ScoreFactorCode keys", () => {
    preset = getPreset(presetId);
    for (const code of Object.keys(preset.scoringOverrides)) {
      expect(VALID_FACTOR_CODES.has(code)).toBe(true);
    }
  });

  it("scoringOverrides has at least 3 entries", () => {
    preset = getPreset(presetId);
    expect(Object.keys(preset.scoringOverrides).length).toBeGreaterThanOrEqual(3);
  });

  it("each scoringOverride entry has points (number) and enabled (boolean)", () => {
    preset = getPreset(presetId);
    for (const [, w] of Object.entries(preset.scoringOverrides)) {
      expect(typeof w.points).toBe("number");
      expect(typeof w.enabled).toBe("boolean");
    }
  });

  it("has at least 3 suggestedNiches", () => {
    preset = getPreset(presetId);
    expect(Array.isArray(preset.suggestedNiches)).toBe(true);
    expect(preset.suggestedNiches.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 3 suggestedCities", () => {
    preset = getPreset(presetId);
    expect(Array.isArray(preset.suggestedCities)).toBe(true);
    expect(preset.suggestedCities.length).toBeGreaterThanOrEqual(3);
  });

  it("has a draftTemplate with subjectTemplate and bodyTemplate", () => {
    preset = getPreset(presetId);
    expect(typeof preset.draftTemplate.subjectTemplate).toBe("string");
    expect(preset.draftTemplate.subjectTemplate.length).toBeGreaterThan(0);
    expect(typeof preset.draftTemplate.bodyTemplate).toBe("string");
    expect(preset.draftTemplate.bodyTemplate.length).toBeGreaterThan(0);
  });

  it("has a firstCampaign with required fields", () => {
    preset = getPreset(presetId);
    expect(typeof preset.firstCampaign.name).toBe("string");
    expect(preset.firstCampaign.name.length).toBeGreaterThan(0);
    expect(typeof preset.firstCampaign.niche).toBe("string");
    expect(preset.firstCampaign.niche.length).toBeGreaterThan(0);
    expect(typeof preset.firstCampaign.idealCustomerDescription).toBe("string");
    expect(typeof preset.firstCampaign.offer).toBe("string");
    expect(typeof preset.firstCampaign.valueProposition).toBe("string");
    expect(typeof preset.firstCampaign.minimumScore).toBe("number");
    expect(preset.firstCampaign.minimumScore).toBeGreaterThanOrEqual(0);
    expect(preset.firstCampaign.minimumScore).toBeLessThanOrEqual(100);
  });
});

describe("preset weight overrides are within reasonable bounds", () => {
  it("all points values are within [-100, 100]", () => {
    for (const preset of listPresets()) {
      for (const [code, w] of Object.entries(preset.scoringOverrides)) {
        expect(w.points).toBeGreaterThanOrEqual(-100);
        expect(w.points).toBeLessThanOrEqual(100);
      }
    }
  });

  it("fitness preset has lower no_website points than agency preset", () => {
    const fitness = getPreset("fitness");
    const agency = getPreset("agency");
    expect(fitness.scoringOverrides.no_website?.points ?? 0).toBeLessThan(
      agency.scoringOverrides.no_website?.points ?? 0
    );
  });

  it("home-services preset has higher useful_contact_path than saas preset", () => {
    const homeServices = getPreset("home-services");
    const saas = getPreset("saas");
    expect(homeServices.scoringOverrides.useful_contact_path?.points ?? 0).toBeGreaterThan(
      saas.scoringOverrides.useful_contact_path?.points ?? 0
    );
  });

  it("saas preset has no_website disabled or at very low points", () => {
    const saas = getPreset("saas");
    const noWebsite = saas.scoringOverrides.no_website;
    // SaaS always has a site — so points should be very low or disabled
    const effectivePoints = noWebsite?.enabled === false ? 0 : (noWebsite?.points ?? 0);
    expect(effectivePoints).toBeLessThanOrEqual(5);
  });
});
