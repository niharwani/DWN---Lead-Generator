import type { IndustryPreset } from "./types";

/**
 * Marketing agency preset — agencies doing white-label CRO, ad campaigns,
 * content marketing, and growth for clients.
 */
export const marketingPreset: IndustryPreset = {
  id: "marketing",
  name: "Marketing Agency",
  emoji: "📣",
  tagline: "White-label CRO, landing page sprints, and lead funnels for agencies.",
  recommendedFor: [
    "Full-service marketing agencies",
    "Performance marketing and paid ads agencies",
    "Content and SEO agencies",
    "Growth agencies targeting SMBs",
  ],
  defaults: {
    pitch:
      "A white-label CRO and landing page studio for marketing agencies — we build the conversion assets your clients need, under your brand.",
    shortBio:
      "We partner with marketing agencies to deliver high-converting landing pages, lead funnels, and CRO audits for their clients — fast turnaround, white-label delivery.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 4000, max: 35000 },
  },
  services: [
    {
      name: "White-Label CRO Sprint",
      description:
        "A 2-week CRO audit and implementation sprint delivered under the agency's brand — annotated teardown, A/B test designs, and summary report.",
      idealCustomer:
        "Marketing agencies that need CRO deliverables for clients but don't have in-house conversion specialists.",
      valueProposition:
        "Deliver CRO work under your brand without hiring — faster than building the skill in-house.",
    },
    {
      name: "Landing Page Sprint",
      description:
        "A single high-converting landing page designed and built in 5–10 business days, fully handed off and ready to receive paid traffic.",
      idealCustomer:
        "Agencies managing Google or Meta ad campaigns for clients who need a dedicated landing page quickly.",
      valueProposition:
        "Get clients a conversion-optimised landing page in under 2 weeks, not the usual 6-week agency timeline.",
    },
    {
      name: "Lead-Magnet Funnel",
      description:
        "A full lead-generation funnel: lead-magnet landing page, thank-you page, email confirmation, and nurture sequence design.",
      idealCustomer:
        "Content or inbound agencies whose clients need a lead-generation asset to anchor content campaigns.",
      valueProposition:
        "Turn content traffic into a measurable lead pipeline with a purpose-built funnel.",
    },
    {
      name: "Campaign Microsite",
      description:
        "A standalone campaign microsite for product launches, events, or seasonal promotions — fast to build, easy to archive.",
      idealCustomer:
        "Agencies managing campaign launches for retail or consumer brands that need a temporary but polished web presence.",
      valueProposition:
        "A dedicated, on-brand campaign URL that focuses visitors on one action — no homepage distractions.",
    },
    {
      name: "Reporting Dashboard Design",
      description:
        "Custom client-facing reporting dashboards designed to communicate campaign performance clearly to non-technical stakeholders.",
      idealCustomer:
        "Agencies using DataStudio or Looker whose client reports look raw and hard to interpret.",
      valueProposition:
        "Impress clients with polished, branded dashboards that tell the performance story clearly.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 16, enabled: true },
    inaccessible: { points: 15, enabled: true },
    outdated: { points: 18, enabled: true },
    service_fit: { points: 20, enabled: true },
    niche_match: { points: 14, enabled: true },
    missing_viewport: { points: 5, enabled: true },
    heavy_page: { points: 6, enabled: true },
    missing_contact_path: { points: 10, enabled: true },
    missing_https: { points: 8, enabled: true },
    useful_contact_path: { points: 5, enabled: true },
    low_evidence_penalty: { points: -14, enabled: true },
    strong_site_penalty: { points: -8, enabled: true },
  },
  suggestedNiches: [
    "Full-Service Marketing Agency",
    "Performance Marketing",
    "SEO & Content Agency",
    "Social Media Agency",
    "Email Marketing Agency",
    "Paid Media Agency",
    "Growth Agency",
    "B2B Demand Generation",
    "PR & Comms Agency",
    "Influencer Marketing",
  ],
  suggestedCities: [
    "New York",
    "London",
    "Chicago",
    "Los Angeles",
    "Sydney",
    "Toronto",
    "Singapore",
    "Berlin",
    "Amsterdam",
    "Melbourne",
  ],
  draftTemplate: {
    subjectTemplate: "Partnership idea — {{lead.business_name}}",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I was researching {{lead.niche}} agencies in {{lead.city}} and had an idea worth running by you.

{{audit.headline_finding}}

I run a white-label CRO and landing page studio — a few agencies use us to deliver conversion assets for their clients quickly, under the agency's brand. No compete on account management or strategy.

Would a quick 15-minute call be worth it to see if there's a fit?

{{owner.full_name}}
{{owner.studio_name}}`,
  },
  firstCampaign: {
    name: "Marketing Agencies — White-Label CRO",
    niche: "Performance Marketing",
    idealCustomerDescription:
      "Mid-size marketing agencies (5–50 employees) managing paid ad campaigns for multiple clients who need landing page or CRO deliverables faster than they can produce in-house.",
    offer: "White-label CRO sprint or landing page sprint",
    valueProposition:
      "Deliver conversion assets under your brand without the hiring cost — fast turnaround, no compete on strategy.",
    minimumScore: 50,
  },
};
