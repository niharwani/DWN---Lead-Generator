import type { IndustryPreset } from "./types";

/**
 * Consultant / coach preset — strategy consultants, executive coaches,
 * business advisors, and independent professionals.
 *
 * Weight rationale:
 * - Consultants derive enormous credibility from their online presence.
 *   `no_website` is significant — being unGoogleable is a trust deficit.
 * - `outdated` is very high — a stale consultant website actively damages
 *   credibility during the diligence phase.
 * - `service_fit` is high — the pitch must speak directly to their domain.
 * - `useful_contact_path` is elevated — discovery calls are the purchase
 *   event; a frictionless booking link is the #1 conversion lever.
 */
export const consultantPreset: IndustryPreset = {
  id: "consultant",
  name: "Consultant & Coach",
  emoji: "🧠",
  tagline: "Authority-building websites and booking funnels for consultants.",
  recommendedFor: [
    "Independent strategy and management consultants",
    "Executive and leadership coaches",
    "Business advisors and fractional executives",
    "Thought leaders building a personal brand",
  ],
  defaults: {
    pitch:
      "A studio that builds authority-establishing websites and discovery-call funnels for independent consultants and coaches.",
    shortBio:
      "We help consultants and coaches turn their expertise into a compelling online presence that attracts ideal clients and books discovery calls on autopilot.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 3000, max: 20000 },
  },
  services: [
    {
      name: "Discovery Call Booking Funnel",
      description:
        "A landing page + calendar booking integration designed to pre-qualify leads and fill the consultant's calendar with high-intent discovery calls.",
      idealCustomer:
        "Consultants whose website gets traffic but converts poorly to booked calls because the CTA is buried or the value proposition is unclear.",
      valueProposition:
        "Go from 'visitors browse and leave' to 'visitors book a call' with a focused funnel.",
    },
    {
      name: "Testimonials & Case Study Page",
      description:
        "A structured page presenting client outcomes, testimonials, and mini case studies that build credibility before the sales conversation.",
      idealCustomer:
        "Consultants with strong client results but no organised way to present social proof to prospects.",
      valueProposition:
        "Let past results do the selling — a well-structured proof page shortens the sales cycle.",
    },
    {
      name: "Signature Framework Landing Page",
      description:
        "A dedicated page explaining the consultant's proprietary methodology or framework with a clear path to engage.",
      idealCustomer:
        "Consultants with a distinctive approach or IP that sets them apart but no page to explain and anchor it.",
      valueProposition:
        "Position unique methodology as a differentiator and anchor all marketing content to it.",
    },
    {
      name: "Personal Brand Website",
      description:
        "A full 5–7 page personal brand site: about, services, framework, case studies, speaking, and a contact/book page.",
      idealCustomer:
        "Consultants with zero online presence or a generic LinkedIn profile as their only digital touchpoint.",
      valueProposition:
        "A credible, searchable presence that earns trust before the first conversation.",
    },
    {
      name: "Speaking & Media Page",
      description:
        "A press/speaker page with bio, past speaking engagements, topics, headshots, and a booking enquiry form.",
      idealCustomer:
        "Consultants trying to build a speaking revenue stream but lacking the credibility signals event organisers look for.",
      valueProposition:
        "A professional speaker profile that gives event organisers everything they need to say yes.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 22, enabled: true },          // unGoogleable = major trust deficit
    inaccessible: { points: 15, enabled: true },
    outdated: { points: 20, enabled: true },             // stale site damages credibility
    service_fit: { points: 18, enabled: true },
    niche_match: { points: 12, enabled: true },
    missing_viewport: { points: 5, enabled: true },
    heavy_page: { points: 4, enabled: true },
    missing_contact_path: { points: 12, enabled: true },
    missing_https: { points: 8, enabled: true },
    useful_contact_path: { points: 10, enabled: true },  // booking link = conversion event
    low_evidence_penalty: { points: -14, enabled: true },
    strong_site_penalty: { points: -8, enabled: true },
  },
  suggestedNiches: [
    "Management Consulting",
    "Executive Coaching",
    "Leadership Development",
    "Fractional CFO",
    "Fractional CMO",
    "HR & People Strategy",
    "Organisational Change",
    "Sales Strategy Consulting",
    "Operations Consulting",
    "Startup Advisor",
  ],
  suggestedCities: [
    "New York",
    "London",
    "Chicago",
    "San Francisco",
    "Boston",
    "Toronto",
    "Sydney",
    "Singapore",
    "Zurich",
    "Amsterdam",
  ],
  draftTemplate: {
    subjectTemplate: "Your online presence — quick observation",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I came across your work while researching {{lead.niche}} consultants and wanted to share something I noticed about {{lead.business_name}}'s online presence.

{{audit.headline_finding}}

I build websites and booking funnels specifically for consultants and coaches — the kind that build credibility and convert visitors into discovery-call bookings.

Worth a 20-minute conversation to see if there's a fit?

{{owner.full_name}}
{{owner.studio_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Consultants — Authority Site",
    niche: "Management Consulting",
    idealCustomerDescription:
      "Independent consultants and coaches with 5+ years of experience and strong client outcomes but a weak or absent online presence.",
    offer: "Personal brand site + discovery call funnel",
    valueProposition:
      "An authority-establishing online presence that attracts inbound enquiries and books discovery calls without cold outreach.",
    minimumScore: 55,
  },
};
