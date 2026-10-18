import type { IndustryPreset } from "./types";

/**
 * Accountant / bookkeeper preset.
 *
 * Weight rationale:
 * - Clients trust accountants with sensitive financial information, so
 *   credibility signals (HTTPS, clear contact path, professional site) are
 *   elevated.
 * - `missing_https` penalty is higher — an accounting firm without HTTPS
 *   triggers immediate client distrust.
 * - `no_website` is moderate — small bookkeepers often run on referrals,
 *   but growth past a certain point requires a web presence.
 * - `service_fit` is high — the offer must match the specific practice area
 *   (personal tax ≠ corporate bookkeeping).
 */
export const accountingPreset: IndustryPreset = {
  id: "accounting",
  name: "Accountant & Bookkeeper",
  emoji: "📊",
  tagline: "Client portals, proposal templates, and trust-building sites for accountants.",
  recommendedFor: [
    "Independent accountants and CPA firms",
    "Bookkeepers and virtual CFOs",
    "Tax preparation specialists",
    "Payroll and financial advisory firms",
  ],
  defaults: {
    pitch:
      "A studio that builds trust-establishing websites and client onboarding portals for accounting and bookkeeping practices.",
    shortBio:
      "We help accountants and bookkeepers attract more of the right clients through a professional online presence — clear service pages, a smooth onboarding process, and a secure client portal.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 2000, max: 15000 },
  },
  services: [
    {
      name: "Client Onboarding Portal",
      description:
        "A secure, branded client portal for document collection, questionnaire completion, and progress tracking during onboarding.",
      idealCustomer:
        "Accounting firms with a manual onboarding process (email attachments, PDF forms) that frustrates new clients and takes staff time to manage.",
      valueProposition:
        "Cut new-client onboarding time by 60% and impress clients with a polished, professional intake experience.",
    },
    {
      name: "Proposal & Engagement Letter Template",
      description:
        "A beautifully designed, web-based proposal and engagement letter template that can be sent as a link and signed electronically.",
      idealCustomer:
        "Accountants using Word or generic PDF proposals who lose prospects to competitors with more polished pitch materials.",
      valueProposition:
        "Close more engagements by presenting services in a format that reflects the quality of the work.",
    },
    {
      name: "Quarterly Report Page",
      description:
        "A branded, interactive quarterly or annual financial summary page clients can access via a private link.",
      idealCustomer:
        "Accountants who send clients raw spreadsheets or PDF reports that are hard to interpret without a call.",
      valueProposition:
        "Increase client retention by delivering clear, beautifully formatted quarterly insights.",
    },
    {
      name: "Services & Pricing Page",
      description:
        "A transparent, well-structured services and pricing page that pre-qualifies leads before the discovery call.",
      idealCustomer:
        "Accounting practices whose website lists services generically without explaining who they serve or what's included.",
      valueProposition:
        "Attract higher-quality leads who already understand the offering and are pre-sold on the value.",
    },
    {
      name: "Accountant Brand Website",
      description:
        "A professional 5-page website: services, about, client testimonials, FAQ, and a contact/book call page.",
      idealCustomer:
        "Solo accountants or small practices still using a DIY site or LinkedIn as their primary online presence.",
      valueProposition:
        "A credible, trust-building web presence that converts referrals and search traffic into booked discovery calls.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 18, enabled: true },
    inaccessible: { points: 14, enabled: true },
    outdated: { points: 16, enabled: true },
    service_fit: { points: 18, enabled: true },
    niche_match: { points: 12, enabled: true },
    missing_viewport: { points: 5, enabled: true },
    heavy_page: { points: 4, enabled: true },
    missing_contact_path: { points: 12, enabled: true },
    missing_https: { points: 15, enabled: true },       // critical trust signal for finance
    useful_contact_path: { points: 8, enabled: true },
    low_evidence_penalty: { points: -14, enabled: true },
    strong_site_penalty: { points: -8, enabled: true },
  },
  suggestedNiches: [
    "Certified Public Accountant",
    "Bookkeeping Services",
    "Tax Preparation",
    "Virtual CFO",
    "Payroll Services",
    "Audit & Assurance",
    "Financial Advisory",
    "Startup Accounting",
    "Real Estate Accounting",
    "Small Business Bookkeeper",
  ],
  suggestedCities: [
    "New York",
    "Chicago",
    "Los Angeles",
    "Houston",
    "Miami",
    "London",
    "Toronto",
    "Sydney",
    "Singapore",
    "Melbourne",
  ],
  draftTemplate: {
    subjectTemplate: "Quick thought on {{lead.business_name}}'s client experience",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I was researching {{lead.niche}} practices in {{lead.city}} and came across {{lead.business_name}}. One thing caught my attention.

{{audit.headline_finding}}

I build client portals, proposal systems, and brand websites for accounting and bookkeeping practices — the kind that improve first impressions and reduce manual onboarding work.

Would a 20-minute call be useful?

{{owner.full_name}}
{{owner.studio_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Accounting Practices — Client Experience",
    niche: "Bookkeeping Services",
    idealCustomerDescription:
      "Independent accountants or small CPA firms with 50+ active clients, growing by referral but lacking a professional online presence or client portal.",
    offer: "Client onboarding portal or brand website",
    valueProposition:
      "A polished digital experience that builds client trust, reduces onboarding friction, and supports practice growth.",
    minimumScore: 50,
  },
};
