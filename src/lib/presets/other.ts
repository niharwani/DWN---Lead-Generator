import type { IndustryPreset } from "./types";
import { DEFAULT_WEIGHTS } from "@/lib/scoring/engine";

/**
 * Blank-slate "Other" preset.
 *
 * Weights are set directly from DEFAULT_WEIGHTS so no overrides are needed —
 * the user starts from the engine's stock configuration and adjusts manually.
 * Services array has one placeholder to satisfy the schema (non-empty).
 */
export const otherPreset: IndustryPreset = {
  id: "other",
  name: "Other / Custom",
  emoji: "⚙️",
  tagline: "Start with a blank slate and configure everything to match your niche.",
  recommendedFor: [
    "Businesses that don't fit the preset categories",
    "Mixed-service providers across multiple industries",
    "Users who want full manual control from the start",
  ],
  defaults: {
    pitch: "Describe your pitch here — what you do and who you help.",
    shortBio: "Add a short bio used in outreach drafts.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 1000, max: 10000 },
  },
  services: [
    {
      name: "Your Core Service",
      description: "Add a description of your primary service offering.",
      idealCustomer: "Describe the ideal customer for this service.",
      valueProposition: "What outcome does this service deliver for the client?",
    },
  ],
  // No overrides — use engine defaults exactly.
  scoringOverrides: {
    no_website: DEFAULT_WEIGHTS.no_website,
    inaccessible: DEFAULT_WEIGHTS.inaccessible,
    outdated: DEFAULT_WEIGHTS.outdated,
    missing_viewport: DEFAULT_WEIGHTS.missing_viewport,
    missing_contact_path: DEFAULT_WEIGHTS.missing_contact_path,
    missing_https: DEFAULT_WEIGHTS.missing_https,
    heavy_page: DEFAULT_WEIGHTS.heavy_page,
    niche_match: DEFAULT_WEIGHTS.niche_match,
    service_fit: DEFAULT_WEIGHTS.service_fit,
    useful_contact_path: DEFAULT_WEIGHTS.useful_contact_path,
    low_evidence_penalty: DEFAULT_WEIGHTS.low_evidence_penalty,
    strong_site_penalty: DEFAULT_WEIGHTS.strong_site_penalty,
  },
  suggestedNiches: [
    "Professional Services",
    "Retail",
    "Hospitality",
    "Education",
    "Non-profit",
  ],
  suggestedCities: [
    "New York",
    "London",
    "Sydney",
    "Toronto",
    "Singapore",
  ],
  draftTemplate: {
    subjectTemplate: "Quick thought for {{lead.business_name}}",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I came across {{lead.business_name}} and noticed something worth sharing.

{{audit.headline_finding}}

I'd love to explore whether there's a fit for what I do.

{{owner.full_name}}
{{owner.studio_name}}`,
  },
  firstCampaign: {
    name: "My First Campaign",
    niche: "Professional Services",
    idealCustomerDescription: "Describe your ideal customer here.",
    offer: "Describe your offer here.",
    valueProposition: "Describe the value you deliver.",
    minimumScore: 50,
  },
};
