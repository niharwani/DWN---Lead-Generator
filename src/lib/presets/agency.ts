import type { IndustryPreset } from "./types";

/**
 * Design / development agency preset — mirrors the existing DWN defaults
 * extracted from the engine's DEFAULT_WEIGHTS and the current seed data.
 * This is the reference preset against which all others are calibrated.
 */
export const agencyPreset: IndustryPreset = {
  id: "agency",
  name: "Design & Dev Agency",
  emoji: "🎨",
  tagline: "Web design, development, and digital services for businesses.",
  recommendedFor: [
    "Freelance web designers and developers",
    "Small design and dev studios",
    "Digital-first brand agencies",
    "UX/UI consultants",
  ],
  defaults: {
    pitch:
      "A boutique studio specialising in websites, web applications, and digital brand systems for growing businesses.",
    shortBio:
      "We design and build clean, fast websites and apps that help service businesses and brands look credible and convert visitors into customers.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 3000, max: 25000 },
  },
  services: [
    {
      name: "Brand Website",
      description:
        "A 5–8 page marketing site with a fast, mobile-first layout, clear CTAs, and an enquiry path.",
      idealCustomer:
        "Service businesses, consultants, and local brands with no site or an outdated one.",
      valueProposition:
        "A credible online presence that converts visitors into enquiries within 4–6 weeks.",
    },
    {
      name: "Landing Page Sprint",
      description:
        "A single-focus conversion page built in 1–2 weeks, optimised for a specific campaign or offer.",
      idealCustomer:
        "Businesses running paid ads or promotions who need a dedicated destination page.",
      valueProposition:
        "Lower CPL and higher conversion rate compared to sending traffic to the homepage.",
    },
    {
      name: "E-commerce Storefront",
      description:
        "Shopify or custom storefront redesign focused on product storytelling, speed, and checkout UX.",
      idealCustomer:
        "DTC brands with an existing Shopify store that looks dated or converts poorly.",
      valueProposition:
        "Higher average order value and lower cart-abandonment through UX improvements.",
    },
    {
      name: "Web Application",
      description:
        "Custom internal or customer-facing web app: portals, booking systems, dashboards, and automation.",
      idealCustomer:
        "Businesses with manual, spreadsheet-driven workflows that need a proper tool.",
      valueProposition:
        "Saves 5–20 hours per week by automating repetitive processes end to end.",
    },
    {
      name: "Brand Identity System",
      description:
        "Logo, typography, colour palette, and usage guide delivered across the primary digital surfaces.",
      idealCustomer:
        "Early-stage brands or businesses refreshing an inconsistent visual identity.",
      valueProposition:
        "Looks polished and consistent across all touchpoints from day one.",
    },
  ],
  scoringOverrides: {
    // Agency is most impactful when there's a real website problem — keep defaults
    no_website: { points: 22, enabled: true },
    inaccessible: { points: 16, enabled: true },
    outdated: { points: 16, enabled: true },
    service_fit: { points: 18, enabled: true },
    niche_match: { points: 10, enabled: true },
    missing_viewport: { points: 6, enabled: true },
    heavy_page: { points: 6, enabled: true },
    missing_contact_path: { points: 10, enabled: true },
    missing_https: { points: 8, enabled: true },
    useful_contact_path: { points: 5, enabled: true },
    low_evidence_penalty: { points: -15, enabled: true },
    strong_site_penalty: { points: -12, enabled: true },
  },
  suggestedNiches: [
    "Restaurant",
    "Professional Services",
    "Interior Design Studio",
    "Jewellery Brand",
    "Wellness & Spa",
    "Legal Services",
    "Dental Practice",
    "Real Estate Agent",
    "Luxury Retail",
    "Boutique Hotel",
  ],
  suggestedCities: [
    "New York",
    "London",
    "Mumbai",
    "Sydney",
    "Toronto",
    "Singapore",
    "Dubai",
    "Los Angeles",
    "Berlin",
    "Amsterdam",
  ],
  draftTemplate: {
    subjectTemplate: "Quick idea for {{lead.business_name}}'s website",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I came across {{lead.business_name}} while looking at {{lead.niche}} businesses in {{lead.city}} and noticed a few things worth flagging.

{{audit.headline_finding}}

I'm a web designer who works with {{lead.niche}} businesses on exactly this type of problem. A focused engagement — typically 4–6 weeks — usually resolves it cleanly.

Would it be worth a 20-minute call to see if it makes sense?

{{owner.full_name}}
{{owner.studio_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Local Service Businesses",
    niche: "Professional Services",
    idealCustomerDescription:
      "Service-based SMBs with 2–20 employees that rely on referrals but have a weak or absent web presence.",
    offer: "Brand website or landing page sprint",
    valueProposition:
      "A credible, fast website that turns referrals and search traffic into real enquiries.",
    minimumScore: 55,
  },
};
