import type { IndustryPreset } from "./types";

/**
 * B2B SaaS founder preset.
 *
 * Weight rationale:
 * - SaaS companies almost always have a website, so `no_website` is essentially
 *   disabled — the opportunity is in the quality of the site, not its absence.
 * - `outdated` and `service_fit` are most predictive because poorly converting
 *   trial flows or thin landing pages are the actual problem.
 * - `missing_contact_path` is less important — SaaS companies have sign-up
 *   forms, but that doesn't mean the page converts.
 * - `strong_site_penalty` is reduced — a slick site in SaaS often still has
 *   conversion or onboarding problems worth fixing.
 */
export const saasPreset: IndustryPreset = {
  id: "saas",
  name: "B2B SaaS",
  emoji: "🚀",
  tagline: "Landing pages, onboarding UX, and growth for SaaS founders.",
  recommendedFor: [
    "B2B SaaS founders and growth teams",
    "Product marketers at early-stage startups",
    "Indie hackers with paying customers",
    "CRO consultants serving SaaS companies",
  ],
  defaults: {
    pitch:
      "A CRO and product design studio that helps B2B SaaS teams improve trial-to-paid conversion and onboarding experience.",
    shortBio:
      "We work with B2B SaaS companies on landing page audits, onboarding UX, and trial conversion — turning more sign-ups into paying customers.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 5000, max: 40000 },
  },
  services: [
    {
      name: "Landing Page Audit & Redesign",
      description:
        "Full audit of the marketing site with annotated teardown, prioritised findings, and a redesigned hero or key conversion section.",
      idealCustomer:
        "SaaS companies with <2% visitor-to-trial conversion who haven't done a structured CRO audit.",
      valueProposition:
        "Identify and fix the 3–5 messaging or UX issues causing the most drop-off in under 4 weeks.",
    },
    {
      name: "Onboarding Redesign Sprint",
      description:
        "Map the new-user onboarding flow, identify friction points, and prototype + implement improvements.",
      idealCustomer:
        "SaaS companies with >40% trial-to-churn in the first 7 days who haven't instrumented onboarding.",
      valueProposition:
        "Improve activation rate and first-week retention through a focused 3-week sprint.",
    },
    {
      name: "Trial-to-Paid Analytics Setup",
      description:
        "Instrument key funnel events (sign-up, activation, upgrade) and build a dashboard to track conversion at each stage.",
      idealCustomer:
        "Founders who don't know where users are dropping in the trial-to-paid flow because they lack event tracking.",
      valueProposition:
        "Go from 'we don't know why we're losing trials' to a clear, instrumented funnel in 2 weeks.",
    },
    {
      name: "Pricing Page Optimisation",
      description:
        "Audit and redesign the pricing page: plan naming, feature highlights, social proof, and FAQ positioning.",
      idealCustomer:
        "SaaS companies seeing high pricing-page bounce rates or low plan-upgrade conversion.",
      valueProposition:
        "Reduce pricing-page hesitation and increase upgrade-click rate through clearer value communication.",
    },
    {
      name: "Feature Announcement Template System",
      description:
        "A reusable template system for in-app feature announcements, release notes, and changelog pages.",
      idealCustomer:
        "SaaS teams shipping weekly but with no consistent way to announce features to existing users.",
      valueProposition:
        "Consistent, on-brand feature communication that reduces support tickets and increases feature adoption.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 3, enabled: false },       // SaaS almost always has a site
    inaccessible: { points: 14, enabled: true },
    outdated: { points: 18, enabled: true },          // thin/weak site is the main signal
    service_fit: { points: 20, enabled: true },
    niche_match: { points: 12, enabled: true },
    missing_viewport: { points: 3, enabled: true },
    heavy_page: { points: 5, enabled: true },
    missing_contact_path: { points: 6, enabled: true }, // sign-up form usually exists
    missing_https: { points: 10, enabled: true },
    useful_contact_path: { points: 4, enabled: true },
    low_evidence_penalty: { points: -15, enabled: true },
    strong_site_penalty: { points: -5, enabled: true }, // good-looking SaaS site still has issues
  },
  suggestedNiches: [
    "B2B SaaS",
    "Developer Tools",
    "HR & People Ops SaaS",
    "Marketing Automation",
    "Analytics & BI",
    "Project Management SaaS",
    "Finance & Accounting SaaS",
    "Sales Enablement",
    "Customer Success Platform",
    "Security & Compliance SaaS",
  ],
  suggestedCities: [
    "San Francisco",
    "New York",
    "Austin",
    "Boston",
    "London",
    "Berlin",
    "Toronto",
    "Amsterdam",
    "Tel Aviv",
    "Stockholm",
  ],
  draftTemplate: {
    subjectTemplate: "CRO observation for {{lead.business_name}}",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I spent 10 minutes in {{lead.business_name}}'s sign-up flow and wanted to share what I noticed.

{{audit.headline_finding}}

I work with B2B SaaS teams on trial conversion and onboarding UX — specifically the gap between "visitor signs up" and "visitor becomes a paying customer." A focused audit usually surfaces 3–5 concrete wins.

Worth a call to walk through the specifics?

{{owner.full_name}}
{{owner.studio_name}}`,
  },
  firstCampaign: {
    name: "B2B SaaS — Conversion Audit",
    niche: "B2B SaaS",
    idealCustomerDescription:
      "Early-to-mid stage B2B SaaS companies (Seed to Series A) with a live product and at least 100 trial sign-ups per month.",
    offer: "Landing page audit + onboarding redesign sprint",
    valueProposition:
      "Lift trial-to-paid conversion by finding and fixing the highest-impact UX and messaging gaps.",
    minimumScore: 50,
  },
};
