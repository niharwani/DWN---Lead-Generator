import type { IndustryPreset } from "./types";

/**
 * DTC e-commerce brand preset — Shopify stores, consumer product brands.
 *
 * Weight rationale:
 * - `no_website` is low — DTC brands always have a store, but often a slow
 *   or poorly converting one.
 * - `heavy_page` is elevated — page speed is directly correlated with
 *   add-to-cart and checkout completion for e-commerce.
 * - `outdated` is high — an old Shopify theme actively hurts conversion.
 * - `service_fit` is critical — must match the specific e-commerce problem.
 * - `strong_site_penalty` is very low — even "nice-looking" e-commerce
 *   stores almost always have CRO opportunities.
 */
export const ecommercePreset: IndustryPreset = {
  id: "ecommerce",
  name: "E-commerce Brand",
  emoji: "🛍️",
  tagline: "CRO, speed, and UX for DTC Shopify brands.",
  recommendedFor: [
    "DTC consumer product brands on Shopify",
    "E-commerce founders with a live store",
    "Brands running paid ads needing better ROAS",
    "Shopify merchants experiencing high cart abandonment",
  ],
  defaults: {
    pitch:
      "A Shopify CRO studio that helps DTC brands increase revenue per visitor through faster sites, better product pages, and high-converting checkout flows.",
    shortBio:
      "We help DTC brands squeeze more revenue from existing traffic — Shopify theme optimisation, product page CRO, and post-purchase email flows that bring customers back.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 3000, max: 30000 },
  },
  services: [
    {
      name: "Product Page CRO Audit & Redesign",
      description:
        "A structured audit of the product page: copy hierarchy, imagery, trust signals, CTA placement, and social proof — followed by a redesign of the highest-traffic pages.",
      idealCustomer:
        "Shopify brands with healthy traffic but lower-than-industry-average add-to-cart rates (below 5%).",
      valueProposition:
        "Lift add-to-cart rate by identifying and fixing the specific friction points stopping visitors from buying.",
    },
    {
      name: "Post-Purchase Email Flow",
      description:
        "A 5-email post-purchase sequence: confirmation, shipping update, product tips, review request, and a repeat-purchase offer.",
      idealCustomer:
        "DTC brands with a growing customer base but no automated post-purchase sequence to drive repeat orders.",
      valueProposition:
        "Turn one-time buyers into repeat customers through an automated, on-brand email sequence.",
    },
    {
      name: "Shopify Theme Speed Audit",
      description:
        "A technical performance audit of the Shopify storefront: Core Web Vitals, image optimisation, app bloat analysis, and a prioritised fix list.",
      idealCustomer:
        "Shopify stores scoring below 40 on Google PageSpeed Mobile or seeing high bounce rates on product pages.",
      valueProposition:
        "A faster store converts more visitors — every 100ms improvement in LCP typically lifts conversion by 1–2%.",
    },
    {
      name: "Cart & Checkout Optimisation",
      description:
        "Audit and redesign of the cart and checkout experience: trust signals, progress indicators, upsell placement, and friction removal.",
      idealCustomer:
        "Stores with cart abandonment rates above 70% who haven't reviewed the checkout UX in over a year.",
      valueProposition:
        "Recover 5–15% of abandoned carts through targeted UX improvements at the highest-intent stage of the funnel.",
    },
    {
      name: "Homepage & Collection Page Redesign",
      description:
        "A conversion-focused redesign of the homepage hero and top collection pages, anchored to the brand's key audience segments.",
      idealCustomer:
        "DTC brands with a dated Shopify theme that doesn't reflect the current brand positioning or product range.",
      valueProposition:
        "A refreshed storefront that communicates brand story, drives collection exploration, and reduces homepage bounce.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 5, enabled: false },          // DTC always has a store
    inaccessible: { points: 14, enabled: true },
    outdated: { points: 18, enabled: true },             // old theme = conversion drag
    service_fit: { points: 20, enabled: true },
    niche_match: { points: 10, enabled: true },
    missing_viewport: { points: 8, enabled: true },
    heavy_page: { points: 14, enabled: true },           // speed = revenue for e-commerce
    missing_contact_path: { points: 6, enabled: true },
    missing_https: { points: 12, enabled: true },
    useful_contact_path: { points: 4, enabled: true },
    low_evidence_penalty: { points: -12, enabled: true },
    strong_site_penalty: { points: -4, enabled: true },  // always room to optimise
  },
  suggestedNiches: [
    "Shopify DTC Brand",
    "Skincare & Beauty",
    "Health & Supplements",
    "Fashion & Apparel",
    "Home & Lifestyle",
    "Pet Products",
    "Food & Beverage",
    "Outdoor & Sports",
    "Kids & Baby",
    "Jewellery & Accessories",
  ],
  suggestedCities: [
    "Los Angeles",
    "New York",
    "London",
    "Sydney",
    "Toronto",
    "Miami",
    "Austin",
    "Amsterdam",
    "Berlin",
    "Melbourne",
  ],
  draftTemplate: {
    subjectTemplate: "{{lead.business_name}} store — quick CRO observation",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I spent 10 minutes in {{lead.business_name}}'s store and wanted to share one thing I noticed.

{{audit.headline_finding}}

I work with DTC Shopify brands on conversion rate optimisation — product pages, speed, and post-purchase flows. A focused audit typically surfaces 3–5 concrete fixes that compound over time.

Would a quick call be useful to walk through what I found?

{{owner.full_name}}
{{owner.studio_name}}`,
  },
  firstCampaign: {
    name: "DTC Shopify Brands — CRO",
    niche: "Shopify DTC Brand",
    idealCustomerDescription:
      "DTC consumer brand on Shopify with at least $20k/month in revenue, running paid ads but with a conversion rate under 2.5%.",
    offer: "Product page CRO audit + redesign",
    valueProposition:
      "Lift conversion rate by fixing the specific UX and messaging gaps stopping visitors from adding to cart.",
    minimumScore: 50,
  },
};
