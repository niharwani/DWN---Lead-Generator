/**
 * Preset application — seeds a workspace with the chosen IndustryPreset.
 *
 * This is the write side of the onboarding wizard. It runs during
 * `applyPresetAction` and also at the completion of step 2 when the user
 * advances past the preset selector.
 *
 * What it does:
 *   1. Loads the preset from the registry.
 *   2. Clears any existing service_offerings for the owner (preset re-apply).
 *   3. Inserts the preset's services into service_offerings.
 *   4. Writes scoring weight overrides to app_settings under `scoring/weights/v1`.
 *   5. Writes business profile (pitch, bio, currency) to `profile/v1`.
 *   6. Creates the preset's first campaign in the campaigns table.
 *   7. Returns a summary of what was created.
 *
 * Overrides can be passed to adjust any of the preset values before they're
 * persisted (e.g., the user edited the pitch on step 2).
 */

import { getDb } from "@/lib/db/client";
import { getPreset } from "@/lib/presets";
import type { IndustryPreset } from "@/lib/presets/types";
import type { ScoreFactorCode, WeightMap, FactorWeight } from "@/lib/scoring/engine";
import { DEFAULT_WEIGHTS } from "@/lib/scoring/engine";
import { setSetting } from "@/lib/db/repos/settings";
import { createServiceOffering } from "@/lib/db/repos/service-offerings";
import { createCampaign } from "@/lib/db/repos/campaigns";
import { serviceOfferings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Optional overrides the caller can provide to adjust preset values. */
export type PresetOverrides = {
  pitch?: string;
  shortBio?: string;
  defaultCurrency?: string;
  dealMin?: number;
  dealMax?: number;
  /** Campaign geography seeded from step 3 inputs. */
  geography?: { city?: string; region?: string; country?: string };
};

export type ApplyPresetSummary = {
  presetId: string;
  presetName: string;
  servicesCreated: number;
  campaignId: string;
  campaignName: string;
};

const PROFILE_KEY = "profile/v1";
const SCORING_WEIGHTS_KEY = "scoring/weights/v1";

/**
 * Apply a preset to a workspace. Idempotent — calling it again with the same
 * presetId overwrites the previous application.
 *
 * @param ownerId   The workspace / owner ID (Phase A makes these equivalent).
 * @param presetId  The preset to apply (e.g. 'fitness', 'agency').
 * @param overrides Optional caller-provided overrides to adjust preset values.
 */
export async function applyPreset(
  ownerId: string,
  presetId: string,
  overrides?: PresetOverrides
): Promise<ApplyPresetSummary> {
  const preset = getPreset(presetId);
  const db = await getDb();

  // 1. Delete existing service_offerings for this owner so re-applying is clean.
  await db
    .delete(serviceOfferings)
    .where(eq(serviceOfferings.ownerId, ownerId));

  // 2. Insert preset services.
  const now = new Date().toISOString();
  for (const svc of preset.services) {
    await createServiceOffering(db, ownerId, {
      name: svc.name,
      description: svc.description,
      idealCustomer: svc.idealCustomer,
      valueProposition: svc.valueProposition,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 3. Build and persist scoring weight map.
  //    Start from engine defaults, then apply preset overrides.
  const weights: WeightMap = { ...DEFAULT_WEIGHTS };
  for (const [code, override] of Object.entries(preset.scoringOverrides) as Array<
    [ScoreFactorCode, FactorWeight]
  >) {
    if (code in weights) {
      weights[code] = {
        points: typeof override.points === "number" ? override.points : weights[code].points,
        enabled: typeof override.enabled === "boolean" ? override.enabled : weights[code].enabled,
      };
    }
  }
  await setSetting(db, ownerId, SCORING_WEIGHTS_KEY, weights);

  // 4. Persist business profile.
  const profile = {
    presetId,
    pitch: overrides?.pitch ?? preset.defaults.pitch,
    shortBio: overrides?.shortBio ?? preset.defaults.shortBio,
    defaultCurrency: overrides?.defaultCurrency ?? preset.defaults.defaultCurrency,
    estimatedDealValueRange: {
      min: overrides?.dealMin ?? preset.defaults.estimatedDealValueRange.min,
      max: overrides?.dealMax ?? preset.defaults.estimatedDealValueRange.max,
    },
  };
  await setSetting(db, ownerId, PROFILE_KEY, profile);

  // 5. Create the first campaign.
  const fc = preset.firstCampaign;
  const campaign = await createCampaign(db, ownerId, {
    name: fc.name,
    status: "draft",
    niche: fc.niche,
    geography: overrides?.geography ?? {},
    idealCustomerDescription: fc.idealCustomerDescription,
    offer: fc.offer,
    valueProposition: fc.valueProposition,
    minimumScore: fc.minimumScore,
  });

  return {
    presetId,
    presetName: preset.name,
    servicesCreated: preset.services.length,
    campaignId: campaign.id,
    campaignName: campaign.name,
  };
}

/**
 * Build a full WeightMap from a preset's overrides.
 * Exported so the scoring-weights step in the onboarding wizard can
 * pre-populate sliders without calling applyPreset.
 */
export function buildWeightMapFromPreset(preset: IndustryPreset): WeightMap {
  const weights: WeightMap = { ...DEFAULT_WEIGHTS };
  for (const [code, override] of Object.entries(preset.scoringOverrides) as Array<
    [ScoreFactorCode, FactorWeight]
  >) {
    if (code in weights) {
      weights[code] = {
        points: typeof override.points === "number" ? override.points : weights[code].points,
        enabled: typeof override.enabled === "boolean" ? override.enabled : weights[code].enabled,
      };
    }
  }
  return weights;
}
