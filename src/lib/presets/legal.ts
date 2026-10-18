import type { IndustryPreset } from "./types";

/**
 * Attorney / legal services preset.
 *
 * Weight rationale:
 * - Trust and credibility are paramount. `missing_https`, `outdated`, and
 *   `no_website` all carry significant weight.
 * - `missing_contact_path` is critical — potential clients in legal situations
 *   need to reach the attorney quickly; any friction loses the case.
 * - `useful_contact_path` is elevated — phone number is how clients prefer
 *   to make first contact in legal matters.
 * - `service_fit` is very high — legal specialisations don't cross over
 *   (family law ≠ IP law); the pitch must be precise.
 *
 * Caution note: legal outreach must respect bar association ethics rules.
 * Avoid any language that could be construed as solicitation of accident
 * victims or criminal defendants. The draft template is conservative.
 */
export const legalPreset: IndustryPreset = {
  id: "legal",
  name: "Attorney & Legal",
  emoji: "⚖️",
  tagline: "Practice-area pages, intake forms, and credibility sites for attorneys.",
  recommendedFor: [
    "Solo attorneys and small law firms",
    "Family law, estate planning, and business law practices",
    "IP and contract attorneys",
    "Legal services companies (non-attorney, e.g. process serving)",
  ],
  defaults: {
    pitch:
      "A studio that builds credibility-first law firm websites — practice area pages, client intake forms, and attorney bio pages that earn trust before the consultation.",
    shortBio:
      "We help solo attorneys and small law firms build a professional online presence that earns trust, ranks locally, and converts website visitors into consultation bookings.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 3000, max: 20000 },
  },
  services: [
    {
      name: "Practice-Area Pages",
      description:
        "Well-structured, keyword-optimised pages for each legal practice area the firm handles — written for the prospective client, not the attorney.",
      idealCustomer:
        "Law firms whose website lists practice areas in dense legal jargon with no clear explanation of who they help or what the process looks like.",
      valueProposition:
        "Educate prospective clients, build trust, and rank for specific practice-area searches in the firm's geography.",
    },
    {
      name: "Client Intake Form System",
      description:
        "A secure, multi-step intake form that collects case details, schedules a consultation, and sends confirmation emails automatically.",
      idealCustomer:
        "Attorneys still using a generic contact form or phone-only intake who lose enquiries outside business hours.",
      valueProposition:
        "Capture client enquiries 24/7 with a structured intake that pre-qualifies cases before the first call.",
    },
    {
      name: "Case Result Highlight Page",
      description:
        "A tastefully presented page showcasing notable case outcomes and settlements, with appropriate anonymisation where required.",
      idealCustomer:
        "Attorneys with strong outcomes who lack a credible way to present results without running afoul of ethics rules.",
      valueProposition:
        "Build credibility through outcomes while respecting client confidentiality and bar association guidelines.",
    },
    {
      name: "Attorney Bio & Credibility Page",
      description:
        "A professional attorney bio page: credentials, bar admissions, education, speaking/publications, and a human-tone introduction.",
      idealCustomer:
        "Attorneys with a generic firm profile page and no standalone bio that communicates their background and approach.",
      valueProposition:
        "A compelling bio that differentiates the attorney from generic firm pages and builds personal trust.",
    },
    {
      name: "Law Firm Brand Website",
      description:
        "A 6–8 page law firm site: practice areas, attorneys, about, FAQ, contact, and a consultation-booking CTA.",
      idealCustomer:
        "Solo attorneys or small firms with an outdated or template-generated website that doesn't reflect the quality of their legal work.",
      valueProposition:
        "A professional, credibility-building website that generates consultation requests and supports Google ranking.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 20, enabled: true },
    inaccessible: { points: 16, enabled: true },
    outdated: { points: 18, enabled: true },            // stale site = credibility risk
    service_fit: { points: 20, enabled: true },         // practice area must match
    niche_match: { points: 14, enabled: true },
    missing_viewport: { points: 5, enabled: true },
    heavy_page: { points: 4, enabled: true },
    missing_contact_path: { points: 15, enabled: true }, // legal clients need fast contact
    missing_https: { points: 16, enabled: true },        // essential for a legal site
    useful_contact_path: { points: 10, enabled: true },
    low_evidence_penalty: { points: -14, enabled: true },
    strong_site_penalty: { points: -8, enabled: true },
  },
  suggestedNiches: [
    "Family Law",
    "Estate Planning Attorney",
    "Business & Contract Law",
    "Intellectual Property",
    "Immigration Attorney",
    "Personal Injury",
    "Criminal Defense",
    "Real Estate Attorney",
    "Employment Law",
    "Tax Attorney",
  ],
  suggestedCities: [
    "New York",
    "Chicago",
    "Los Angeles",
    "Houston",
    "Atlanta",
    "Miami",
    "Dallas",
    "Philadelphia",
    "Phoenix",
    "Boston",
  ],
  draftTemplate: {
    subjectTemplate: "Website observation for {{lead.business_name}}",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I was researching {{lead.niche}} practices in {{lead.city}} and noticed something about {{lead.business_name}}'s online presence worth sharing.

{{audit.headline_finding}}

I build websites for attorneys and small law firms — practice-area pages, intake systems, and credibility pages designed to earn trust with prospective clients before the consultation.

If it's worth 20 minutes, I'm happy to share what I found in more detail.

{{owner.full_name}}
{{owner.studio_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Law Firms — Credibility & Intake",
    niche: "Family Law",
    idealCustomerDescription:
      "Solo attorneys or small law firms (1–5 attorneys) with a live practice and active client load but a website that hasn't been updated in 3+ years.",
    offer: "Law firm brand website or practice-area pages",
    valueProposition:
      "A professional, credibility-first web presence that earns trust and books consultations.",
    minimumScore: 55,
  },
};
