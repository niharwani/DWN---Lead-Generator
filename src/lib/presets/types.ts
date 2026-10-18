import type { ScoreFactorCode } from "@/lib/scoring/engine";

/**
 * An industry preset encapsulates all the configuration needed to set up a
 * fresh workspace for a specific niche. The onboarding wizard loads a preset
 * when the user picks their industry tile, pre-fills every step, and the user
 * can adjust before saving.
 *
 * Nothing in this file touches the database — it is pure config data.
 */
export type IndustryPreset = {
  /** Stable identifier — used as the key in the PRESETS registry. */
  id: string;

  /** Human-readable name shown in the preset picker tile. */
  name: string;

  /** Optional emoji rendered on the tile to aid fast recognition. */
  emoji?: string;

  /** One-line description rendered below the name on the picker tile. */
  tagline: string;

  /** Short bullets shown on hover / focus of the tile. Max 4 bullets. */
  recommendedFor: string[];

  defaults: {
    /** Workspace short pitch — used in outreach drafts as the fallback VP. */
    pitch: string;
    /** Short professional bio for draft templates. */
    shortBio: string;
    /** ISO 4217 currency code for deal-value estimates. */
    defaultCurrency: string;
    /** Ballpark deal value range in the default currency. */
    estimatedDealValueRange: { min: number; max: number };
  };

  /**
   * Pre-written service offerings seeded when the preset is applied.
   * 3–6 entries. The 'other' preset ships 1 placeholder.
   */
  services: Array<{
    name: string;
    description: string;
    idealCustomer: string;
    valueProposition: string;
  }>;

  /**
   * Partial weight overrides relative to DEFAULT_WEIGHTS.
   * Only keys that differ from defaults need to be listed.
   * Keys must be valid ScoreFactorCode strings.
   */
  scoringOverrides: Partial<Record<ScoreFactorCode, { points: number; enabled: boolean }>>;

  /** 5–10 suggested niche strings pre-populated on the ICP step. */
  suggestedNiches: string[];

  /** 5–10 example cities to seed the geography search. */
  suggestedCities: string[];

  /** Draft template used to generate the first outreach email. */
  draftTemplate: {
    /** Subject line — supports {{lead.business_name}}, {{lead.city}} etc. */
    subjectTemplate: string;
    /** Body — supports same variable set. Use plain text, no HTML. */
    bodyTemplate: string;
  };

  /**
   * Config for the first campaign created when the preset is applied.
   * Shown on step 3 (ICP) pre-populated.
   */
  firstCampaign: {
    name: string;
    niche: string;
    idealCustomerDescription: string;
    offer: string;
    valueProposition: string;
    minimumScore: number;
  };
};
