import type { IndustryPreset } from "./types";

/**
 * Fitness coach / personal trainer preset.
 *
 * Weight rationale:
 * - Coaches often use Instagram instead of a website, so `no_website` is
 *   worth fewer points — it is common and doesn't always signal opportunity.
 * - `service_fit` and `niche_match` are elevated because the coach's specific
 *   offer must map tightly to the prospect's fitness category.
 * - `useful_contact_path` gets a boost — phone/DM is how fitness clients
 *   prefer to book.
 * - `strong_site_penalty` is reduced — many great coaches have a simple site;
 *   a clean one is less likely to mean "nothing to improve."
 */
export const fitnessPreset: IndustryPreset = {
  id: "fitness",
  name: "Fitness Coach",
  emoji: "💪",
  tagline: "Online and in-person coaching, training programs, and nutrition plans.",
  recommendedFor: [
    "Personal trainers and fitness coaches",
    "Gym owners looking for clients",
    "Online fitness program creators",
    "Nutrition and wellness coaches",
  ],
  defaults: {
    pitch:
      "A certified fitness coach helping busy professionals lose weight, build strength, and build habits that stick — online or in-person.",
    shortBio:
      "I help people build sustainable fitness habits through personalised coaching programs, online accountability groups, and nutrition guidance.",
    defaultCurrency: "USD",
    estimatedDealValueRange: { min: 500, max: 5000 },
  },
  services: [
    {
      name: "1:1 Coaching Program",
      description:
        "12-week personalised coaching program with weekly check-ins, custom workout plan, and nutrition guidance.",
      idealCustomer:
        "Fitness businesses or coaches offering premium 1:1 services but struggling to communicate the value online.",
      valueProposition:
        "A landing page and booking flow that pre-qualifies leads and fills the coaching calendar.",
    },
    {
      name: "Online Challenge Campaign",
      description:
        "28-day or 6-week challenge with a dedicated landing page, email sequence, and community element.",
      idealCustomer:
        "Coaches who want to launch a group challenge and need a high-converting registration page.",
      valueProposition:
        "Turn a challenge launch into a scalable funnel that grows an email list and converts to paid programs.",
    },
    {
      name: "Nutrition Plan Review Page",
      description:
        "A focused service page positioning nutrition audits or consultations as a front-end offer.",
      idealCustomer:
        "Nutrition coaches whose website buries or under-sells the nutrition consultation as an entry-point service.",
      valueProposition:
        "Shorter sales cycle from website visit to booked consultation.",
    },
    {
      name: "Client Testimonials & Results Page",
      description:
        "A social-proof hub showcasing before/after results, video testimonials, and transformation stories.",
      idealCustomer:
        "Coaches with great client results but no polished way to present them online.",
      valueProposition:
        "Social proof presented in a format that reduces hesitation for new visitors.",
    },
    {
      name: "Booking & Intake System",
      description:
        "A clean intake form + calendar booking flow integrated with their scheduling tool of choice.",
      idealCustomer:
        "Coaches still using DM-based booking who lose leads due to friction in the sign-up process.",
      valueProposition:
        "Cut time-to-book by 80% and reduce no-shows with automated confirmation and reminders.",
    },
  ],
  scoringOverrides: {
    no_website: { points: 10, enabled: true },       // coaches often use IG; lower signal
    inaccessible: { points: 14, enabled: true },
    outdated: { points: 12, enabled: true },
    service_fit: { points: 20, enabled: true },       // must map tightly to their offer
    niche_match: { points: 16, enabled: true },       // fitness sub-niche matters a lot
    missing_viewport: { points: 4, enabled: true },
    heavy_page: { points: 3, enabled: true },
    missing_contact_path: { points: 10, enabled: true },
    missing_https: { points: 8, enabled: true },
    useful_contact_path: { points: 8, enabled: true }, // phone / DM is primary channel
    low_evidence_penalty: { points: -12, enabled: true },
    strong_site_penalty: { points: -6, enabled: true }, // clean site ≠ no room to improve
  },
  suggestedNiches: [
    "Personal Training",
    "Online Fitness Coach",
    "Yoga & Pilates",
    "Nutrition Coaching",
    "Crossfit & Functional Fitness",
    "Weight Loss Coaching",
    "Sports Performance",
    "Kettlebell & Strength",
    "Mindset & Wellness",
    "Group Fitness Classes",
  ],
  suggestedCities: [
    "Los Angeles",
    "Miami",
    "New York",
    "Austin",
    "London",
    "Sydney",
    "Toronto",
    "Melbourne",
    "Dubai",
    "Singapore",
  ],
  draftTemplate: {
    subjectTemplate: "Idea for {{lead.business_name}}'s online presence",
    bodyTemplate: `Hi {{lead.first_name_or_team}},

I spotted {{lead.business_name}} while researching {{lead.niche}} coaches in {{lead.city}} and wanted to share a quick observation.

{{audit.headline_finding}}

I help fitness coaches turn their online presence into a consistent source of qualified leads — whether that's a cleaner booking flow, a results page that converts, or a launch page for a new program.

Would a 15-minute call make sense to explore it?

{{owner.full_name}}
{{owner.website_url}}`,
  },
  firstCampaign: {
    name: "Fitness Coaches — Online Presence",
    niche: "Personal Training",
    idealCustomerDescription:
      "Fitness coaches and personal trainers with 50+ followers and at least one paid program but no clear online booking or results page.",
    offer: "Landing page or booking system build",
    valueProposition:
      "A professional online presence that fills the coaching calendar without relying on DM hustles.",
    minimumScore: 45,
  },
};
