import type { IndustryPreset } from "./types";

/**
 * Dentist / medical practice preset.
 *
 * Weight rationale:
 * - Healthcare patients research practices carefully online before booking;
 *   `no_website` and `outdated` carry high weight.
 * - `missing_https` is very high — a medical website without HTTPS is both a
 *   trust signal failure and a potential compliance concern (HIPAA context).
 * - `missing_contact_path` is critical — patients need to call or book easily.
 * - `useful_contact_path` is elevated — phone and online booking are both
 *   expected entry points for a medical practice.
 * - `strong_site_penalty` is reduced — even modern-looking practice sites
 *   often have poor new-patient conversion.
 */
export const dentalMedicalPreset: IndustryPreset = {
  id: "dental-medical",
  name: "Dental & Medical",
  emoji: "🦷",
  tagline: "New-patient landing pages, booking widgets, and treatment pages for practices.",
  recommendedFor: [
    "Dental practices and orthodontists",
    "GP clinics and specialist medical practices",
    "Physiotherapy and allied health clinics",
    "Mental health and counselling practices",
  ],
  defaults: {
    pitch:
      "A studio that builds new-patient-focused websites for dental and medical practices — appointment booking, treatment pages, and trust-building patient testimonials.",
    shortBio:
      "We help dental and medical practices attract more new patients online through professional, conversion-focused websites and appointment booking systems.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 3000, max: 20000 },
  },
  services: [
    {
      name: "New-Patient Landing Page",
      description:
        "A dedicated landing page for new patients: what to expect, meet the team, insurance/payment options, and an online booking CTA.",
      idealCustomer:
        "Practices running Google Ads or local SEO campaigns but sending traffic to a generic homepage instead of a new-patient-focused destination.",
      valueProposition:
        "Convert more new-patient searches and ad clicks by giving prospective patients a clear, reassuring landing experience.",
    },
    {
      name: "Appointment Booking Widget",
      description:
        "An online appointment booking integration — synced with the practice's scheduling software — so patients can book 24/7 without calling.",
      idealCustomer:
        "Practices with phone-only booking who miss after-hours appointment requests and spend staff time on scheduling calls.",
      valueProposition:
        "Capture appointment bookings around the clock and reduce front-desk call volume.",
    },
    {
      name: "Treatment Pages",
      description:
        "Dedicated, patient-language pages for each treatment or service: what it is, who it's for, what the process looks like, and FAQs.",
      idealCustomer:
        "Practices with a services page that lists treatments by name only, with no explanation for patients who are unfamiliar with the procedure.",
      valueProposition:
        "Educated patients arrive at appointments with fewer anxieties and are easier to convert from enquiry to booking.",
    },
    {
      name: "Patient Testimonials & Trust Page",
      description:
        "A structured social proof page: patient stories, star-rating summary, before/after visuals (for cosmetic treatments), and accreditation badges.",
      idealCustomer:
        "Practices with strong patient reviews on Google but no page to surface them to first-time website visitors.",
      valueProposition:
        "Build trust with hesitant patients before they pick up the phone — evidence-led credibility.",
    },
    {
      name: "Practice Brand Website",
      description:
        "A full practice website: home, about the team, services/treatments, patient resources, new patient info, and booking.",
      idealCustomer:
        "Practices with a DIY or decade-old website that no longer reflects the quality of care or the current team.",
      valueProposition:
        "A modern, trustworthy online home that positions the practice competitively in the local market.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 20, enabled: true },
    inaccessible: { points: 15, enabled: true },
    outdated: { points: 18, enabled: true },
    service_fit: { points: 18, enabled: true },
    niche_match: { points: 12, enabled: true },
    missing_viewport: { points: 5, enabled: true },
    heavy_page: { points: 4, enabled: true },
    missing_contact_path: { points: 15, enabled: true }, // patients must be able to book
    missing_https: { points: 18, enabled: true },        // HIPAA + trust = critical
    useful_contact_path: { points: 10, enabled: true },  // phone + booking both expected
    low_evidence_penalty: { points: -12, enabled: true },
    strong_site_penalty: { points: -6, enabled: true },
  },
  suggestedNiches: [
    "General Dentistry",
    "Orthodontics & Braces",
    "Cosmetic Dentistry",
    "General Practice (GP)",
    "Physiotherapy",
    "Chiropractic",
    "Mental Health & Counselling",
    "Dermatology",
    "Optometry",
    "Podiatry",
  ],
  suggestedCities: [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Phoenix",
    "Sydney",
    "Melbourne",
    "London",
    "Toronto",
    "Miami",
  ],
  draftTemplate: {
    subjectTemplate: "New-patient experience idea for {{lead.business_name}}",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I was researching {{lead.niche}} practices in {{lead.city}} and wanted to share one observation about {{lead.business_name}}'s online presence.

{{audit.headline_finding}}

I build websites for dental and medical practices — focused on helping more new patients find you, understand your services, and book an appointment online.

Would a 20-minute call make sense to walk through what I found?

{{owner.full_name}}
{{owner.studio_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Dental Practices — New Patient Flow",
    niche: "General Dentistry",
    idealCustomerDescription:
      "Dental or medical practices with 1–5 practitioners, an active patient load, and a website that hasn't been updated in 3+ years.",
    offer: "New-patient landing page + booking widget",
    valueProposition:
      "Attract more new patients online and reduce front-desk call volume through a modern, conversion-focused web presence.",
    minimumScore: 50,
  },
};
