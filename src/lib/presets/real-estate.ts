import type { IndustryPreset } from "./types";

/**
 * Real estate agent preset.
 *
 * Weight rationale:
 * - Agents without a website lose buyer/seller trust immediately — `no_website`
 *   stays high.
 * - `missing_contact_path` is critical: buyers and sellers need to reach the
 *   agent fast — any friction is a lead lost.
 * - `useful_contact_path` gets a significant boost — phone number is mandatory.
 * - `service_fit` is high because the agent's specific market niche must match
 *   the pitch (luxury ≠ first-home buyer).
 */
export const realEstatePreset: IndustryPreset = {
  id: "real-estate",
  name: "Real Estate Agent",
  emoji: "🏡",
  tagline: "Listing pages, neighbourhood SEO, and lead-magnet funnels for agents.",
  recommendedFor: [
    "Independent real estate agents",
    "Boutique real estate brokerages",
    "Property developers building a buyer audience",
    "Relocation and buyer-specialist agents",
  ],
  defaults: {
    pitch:
      "A web studio that builds lead-generating property websites for real estate agents — listing pages, neighbourhood guides, and mortgage calculator landing pages.",
    shortBio:
      "We help real estate agents get found online and convert site visitors into listing appointments and buyer consultations.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 2000, max: 12000 },
  },
  services: [
    {
      name: "Listing Page Template",
      description:
        "A reusable, high-quality property listing template with photo galleries, virtual tour embeds, floor plans, and a contact form.",
      idealCustomer:
        "Agents who rely on portal listings but have no branded, standalone listing page to send buyers to.",
      valueProposition:
        "A branded listing presentation that differentiates from generic portal pages and drives direct enquiries.",
    },
    {
      name: "Neighbourhood Guide SEO Page",
      description:
        "A detailed, keyword-optimised neighbourhood guide page targeting local buyer searches.",
      idealCustomer:
        "Agents specialising in specific neighbourhoods who aren't ranking for local property searches.",
      valueProposition:
        "Capture organic search traffic from buyers researching the area before they contact a portal.",
    },
    {
      name: "Lead-Magnet Landing Page",
      description:
        "A conversion-focused landing page offering a home valuation report, buyer guide, or market report in exchange for contact details.",
      idealCustomer:
        "Agents running Google or Facebook ads who need a dedicated destination page to maximise CPL.",
      valueProposition:
        "Lower cost-per-lead by sending paid traffic to a purpose-built page instead of a generic homepage.",
    },
    {
      name: "Agent Personal Brand Site",
      description:
        "A professional 5-page personal website: bio, testimonials, current listings, contact, and a home-valuation CTA.",
      idealCustomer:
        "Agents at large brokerages with a generic brokerage profile page but no personal brand online.",
      valueProposition:
        "Build trust with sellers and buyers through a polished independent presence that competes with the brokerage brand.",
    },
    {
      name: "Open House Booking System",
      description:
        "An automated registration and follow-up system for open houses, complete with reminder emails and lead capture.",
      idealCustomer:
        "Agents hosting regular open houses who still use manual sign-in sheets or Eventbrite.",
      valueProposition:
        "Capture every visitor's contact info automatically and trigger a personalised follow-up sequence.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 20, enabled: true },
    inaccessible: { points: 15, enabled: true },
    outdated: { points: 14, enabled: true },
    service_fit: { points: 18, enabled: true },
    niche_match: { points: 12, enabled: true },
    missing_viewport: { points: 5, enabled: true },
    heavy_page: { points: 4, enabled: true },
    missing_contact_path: { points: 15, enabled: true }, // critical for agents
    missing_https: { points: 8, enabled: true },
    useful_contact_path: { points: 10, enabled: true },  // phone = primary channel
    low_evidence_penalty: { points: -12, enabled: true },
    strong_site_penalty: { points: -8, enabled: true },
  },
  suggestedNiches: [
    "Residential Real Estate",
    "Luxury Property",
    "First-Home Buyer Specialist",
    "Commercial Real Estate",
    "Rental Property Management",
    "Investment Property",
    "Relocation Specialist",
    "New Developments",
    "Rural & Land Sales",
    "Buyer's Agent",
  ],
  suggestedCities: [
    "Miami",
    "Los Angeles",
    "New York",
    "Austin",
    "Phoenix",
    "London",
    "Sydney",
    "Toronto",
    "Dubai",
    "Singapore",
  ],
  draftTemplate: {
    subjectTemplate: "Quick thought on {{lead.business_name}}'s online listings",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I was researching {{lead.niche}} agents in {{lead.city}} and took a look at your current online presence.

{{audit.headline_finding}}

I build property websites for agents — listing pages, neighbourhood guides, and lead-magnet landing pages that generate direct buyer and seller enquiries without depending entirely on portals.

Would a 20-minute call be worthwhile?

{{owner.full_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Real Estate Agents — Personal Brand",
    niche: "Residential Real Estate",
    idealCustomerDescription:
      "Independent agents or small teams with 3+ years experience and active listings but no strong personal web presence.",
    offer: "Agent personal brand site or listing page template",
    valueProposition:
      "A professional digital presence that builds trust with sellers and converts buyer search traffic into direct enquiries.",
    minimumScore: 50,
  },
};
