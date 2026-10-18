/**
 * Preset registry — exports every IndustryPreset keyed by id.
 *
 * This is the single import point for all preset consumers.
 * Add new presets here and they'll be picked up by the onboarding
 * wizard, tests, and the settings "re-apply preset" surface.
 */

import type { IndustryPreset } from "./types";
import { agencyPreset } from "./agency";
import { fitnessPreset } from "./fitness";
import { saasPreset } from "./saas";
import { realEstatePreset } from "./real-estate";
import { homeServicesPreset } from "./home-services";
import { consultantPreset } from "./consultant";
import { ecommercePreset } from "./ecommerce";
import { marketingPreset } from "./marketing";
import { accountingPreset } from "./accounting";
import { legalPreset } from "./legal";
import { dentalMedicalPreset } from "./dental-medical";
import { otherPreset } from "./other";

/** Canonical registry. Keys match IndustryPreset.id. */
export const PRESETS: Record<string, IndustryPreset> = {
  [agencyPreset.id]: agencyPreset,
  [fitnessPreset.id]: fitnessPreset,
  [saasPreset.id]: saasPreset,
  [realEstatePreset.id]: realEstatePreset,
  [homeServicesPreset.id]: homeServicesPreset,
  [consultantPreset.id]: consultantPreset,
  [ecommercePreset.id]: ecommercePreset,
  [marketingPreset.id]: marketingPreset,
  [accountingPreset.id]: accountingPreset,
  [legalPreset.id]: legalPreset,
  [dentalMedicalPreset.id]: dentalMedicalPreset,
  [otherPreset.id]: otherPreset,
};

/**
 * Returns the preset for the given id, or throws if the id is unknown.
 * Use `listPresets()` to get safe IDs.
 */
export function getPreset(id: string): IndustryPreset {
  const preset = PRESETS[id];
  if (!preset) {
    throw new Error(
      `Unknown preset id "${id}". Valid ids: ${Object.keys(PRESETS).join(", ")}`
    );
  }
  return preset;
}

/**
 * Returns all presets as an ordered array suitable for rendering a tile grid.
 * "other" is always last.
 */
export function listPresets(): IndustryPreset[] {
  const all = Object.values(PRESETS);
  const others = all.filter((p) => p.id === "other");
  const rest = all.filter((p) => p.id !== "other");
  return [...rest, ...others];
}

export type { IndustryPreset } from "./types";
