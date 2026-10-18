import type { IndustryPreset } from "./types";

/**
 * Home services preset — plumbing, HVAC, landscaping, electrical, cleaning.
 *
 * Weight rationale:
 * - `useful_contact_path` is highest: phone calls are the primary channel for
 *   home service bookings. A missing phone number is a catastrophic loss.
 * - `missing_contact_path` similarly elevated for the same reason.
 * - `no_website` is still significant but slightly lower — many tradespeople
 *   run primarily via Google My Business and word-of-mouth with a thin or no site.
 * - `service_fit` is high — the offer must match the specific trade.
 * - `heavy_page` is less important — speed matters but buyers are forgiving
 *   of home service sites vs. e-commerce.
 */
export const homeServicesPreset: IndustryPreset = {
  id: "home-services",
  name: "Home Services",
  emoji: "🔧",
  tagline: "Websites, booking widgets, and local SEO for tradespeople.",
  recommendedFor: [
    "Plumbers, electricians, and HVAC companies",
    "Landscapers and lawn care services",
    "Cleaning and maid services",
    "Handymen and general contractors",
  ],
  defaults: {
    pitch:
      "A web studio that builds local-lead-generating websites for home service businesses — booking widgets, service-area pages, and Google My Business optimisation.",
    shortBio:
      "We help plumbers, electricians, landscapers, and other tradespeople get more phone calls and online bookings through a professional, locally-optimised web presence.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 1500, max: 8000 },
  },
  services: [
    {
      name: "Booking Widget & Scheduling System",
      description:
        "An online booking form integrated with the business's calendar so customers can request quotes or schedule appointments 24/7.",
      idealCustomer:
        "Home service businesses still taking all bookings by phone who lose after-hours enquiries.",
      valueProposition:
        "Capture and confirm bookings automatically — no missed calls, no manual back-and-forth.",
    },
    {
      name: "Google My Business Optimisation",
      description:
        "Full GMB profile audit and optimisation: categories, service descriptions, photo upload, Q&A, and review response templates.",
      idealCustomer:
        "Tradespeople with unclaimed, incomplete, or poorly-maintained GMB profiles who aren't appearing in local map pack results.",
      valueProposition:
        "Appear in the local map pack for key service searches without spending on ads.",
    },
    {
      name: "Service-Area Landing Pages",
      description:
        "Dedicated, keyword-optimised pages for each suburb, town, or ZIP code the business serves.",
      idealCustomer:
        "Home service companies operating in multiple areas but with a single generic homepage that doesn't rank locally.",
      valueProposition:
        "Rank for '[service] in [suburb]' searches across every area you service.",
    },
    {
      name: "Home Service Brand Website",
      description:
        "A clean 4–6 page website: services, about, service area map, reviews, and a contact/booking CTA.",
      idealCustomer:
        "Tradesperson or small crew with no website or a DIY site that looks unprofessional next to competitors.",
      valueProposition:
        "A credible online presence that converts review-readers and Google searchers into booked jobs.",
    },
    {
      name: "Review & Reputation Page",
      description:
        "A dedicated testimonials and review-aggregation page pulling from Google, Yelp, and Facebook with a 'Leave a Review' CTA.",
      idealCustomer:
        "Home service businesses with 50+ positive reviews scattered across platforms but no single page to direct prospects to.",
      valueProposition:
        "Build trust instantly by surfacing your best reviews in one place before the prospect picks up the phone.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 18, enabled: true },
    inaccessible: { points: 15, enabled: true },
    outdated: { points: 13, enabled: true },
    service_fit: { points: 18, enabled: true },
    niche_match: { points: 12, enabled: true },
    missing_viewport: { points: 4, enabled: true },
    heavy_page: { points: 3, enabled: true },            // less critical for home services
    missing_contact_path: { points: 16, enabled: true }, // phone = #1 conversion path
    missing_https: { points: 8, enabled: true },
    useful_contact_path: { points: 12, enabled: true },  // phone number is essential
    low_evidence_penalty: { points: -10, enabled: true },
    strong_site_penalty: { points: -8, enabled: true },
  },
  suggestedNiches: [
    "Plumbing",
    "Electrical",
    "HVAC",
    "Landscaping",
    "Cleaning Services",
    "Roofing",
    "Pest Control",
    "Handyman Services",
    "Pool & Spa Services",
    "General Contracting",
  ],
  suggestedCities: [
    "Houston",
    "Phoenix",
    "Dallas",
    "Chicago",
    "Atlanta",
    "Miami",
    "Denver",
    "Charlotte",
    "Seattle",
    "Nashville",
  ],
  draftTemplate: {
    subjectTemplate: "More bookings for {{lead.business_name}} — quick idea",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I found {{lead.business_name}} while researching {{lead.niche}} businesses in {{lead.city}} and noticed something that might be costing you bookings.

{{audit.headline_finding}}

I build websites and booking systems for home service businesses — the kind that turn Google searches and GMB visits into actual phone calls and scheduled jobs.

Would you be open to a 15-minute call to walk through what I found?

{{owner.full_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Home Services — Local SEO & Booking",
    niche: "Plumbing",
    idealCustomerDescription:
      "Tradespeople and home service companies with 1–10 employees operating in a specific metro area, actively taking jobs but with a weak or missing web presence.",
    offer: "Brand website + booking widget",
    valueProposition:
      "Get found in local searches and convert visitors into booked jobs without relying entirely on referrals.",
    minimumScore: 45,
  },
};
