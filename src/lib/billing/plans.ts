/**
 * Billing plan definitions — single source of truth for Phase E.
 *
 * ALL numeric quota values and ALL Razorpay plan IDs are intentionally null.
 * Fill them in before launch (Phase H pricing exercise).
 *
 * Feature-flag matrix follows PRODUCT_PLAN.md §2.4.
 */

export type PlanId = "free" | "freelancer" | "teams" | "studio";

export type Feature =
  | "ai_drafts"
  | "gmail_send"
  | "outlook_send"
  | "cadences"
  | "variant_analytics"
  | "slack_notifications"
  | "webhooks"
  | "calendar"
  | "scheduled_exports"
  | "audit_log"
  | "custom_factors"
  | "custom_signals"
  | "rbac"
  | "sso"
  | "white_label";

export type MeteredResource =
  | "audits"
  | "ai_drafts"
  | "reply_triages"
  | "enrichments"
  | "discovery_runs"
  | "gmail_sends";

export type Plan = {
  id: PlanId;
  name: string;
  features: Feature[];
  /** Per-month caps; null = unlimited. */
  limits: Partial<Record<MeteredResource, number | null>>;
  /** null = unlimited */
  maxLeads: number | null;
  /** null = unlimited */
  maxCampaigns: number | null;
  /** null = unlimited */
  maxSeats: number | null;
  // TODO: fill before launch
  priceMonthlyUsd: number | null;
  // TODO: fill before launch
  priceAnnualUsd: number | null;
  // TODO: fill before launch
  razorpayPlanIdMonthly: string | null;
  // TODO: fill before launch
  razorpayPlanIdAnnual: string | null;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    features: [],
    limits: {
      audits: null, // TODO: fill before launch (spec: 10/mo)
      ai_drafts: null, // TODO: fill before launch (spec: 0 — no AI drafts on free)
      reply_triages: null, // TODO: fill before launch
      enrichments: null, // TODO: fill before launch
      discovery_runs: null, // TODO: fill before launch
      gmail_sends: null, // TODO: fill before launch
    },
    maxLeads: null, // TODO: fill before launch (spec: 50)
    maxCampaigns: null, // TODO: fill before launch (spec: 1)
    maxSeats: 1,
    priceMonthlyUsd: null, // TODO: fill before launch
    priceAnnualUsd: null, // TODO: fill before launch
    razorpayPlanIdMonthly: null, // TODO: fill before launch
    razorpayPlanIdAnnual: null, // TODO: fill before launch
  },

  freelancer: {
    id: "freelancer",
    name: "Freelancer",
    features: [
      "ai_drafts",
      "gmail_send",
      "cadences",
    ],
    limits: {
      audits: null, // TODO: fill before launch (spec: 500/mo)
      ai_drafts: null, // TODO: fill before launch (spec: 300/mo, unlimited with BYO key)
      reply_triages: null, // TODO: fill before launch
      enrichments: null, // TODO: fill before launch
      discovery_runs: null, // TODO: fill before launch
      gmail_sends: null, // TODO: fill before launch
    },
    maxLeads: null, // unlimited
    maxCampaigns: null, // TODO: fill before launch (spec: 3 active)
    maxSeats: 1,
    priceMonthlyUsd: null, // TODO: fill before launch (spec: $29/mo)
    priceAnnualUsd: null, // TODO: fill before launch (spec: $23/mo billed annually)
    razorpayPlanIdMonthly: null, // TODO: fill before launch
    razorpayPlanIdAnnual: null, // TODO: fill before launch
  },

  teams: {
    id: "teams",
    name: "Teams",
    features: [
      "ai_drafts",
      "gmail_send",
      "outlook_send",
      "cadences",
      "variant_analytics",
      "slack_notifications",
      "webhooks",
      "calendar",
      "scheduled_exports",
      "audit_log",
      "custom_factors",
      "custom_signals",
      "rbac",
    ],
    limits: {
      audits: null, // TODO: fill before launch (spec: 2,500/mo)
      ai_drafts: null, // TODO: fill before launch (spec: 2,000/mo, unlimited with BYO key)
      reply_triages: null, // TODO: fill before launch
      enrichments: null, // TODO: fill before launch
      discovery_runs: null, // TODO: fill before launch
      gmail_sends: null, // TODO: fill before launch
    },
    maxLeads: null, // unlimited
    maxCampaigns: null, // unlimited
    maxSeats: null, // TODO: fill before launch (spec: 25)
    priceMonthlyUsd: null, // TODO: fill before launch (spec: $79/user/mo)
    priceAnnualUsd: null, // TODO: fill before launch (spec: $63/user/mo billed annually)
    razorpayPlanIdMonthly: null, // TODO: fill before launch
    razorpayPlanIdAnnual: null, // TODO: fill before launch
  },

  studio: {
    id: "studio",
    name: "Studio",
    features: [
      "ai_drafts",
      "gmail_send",
      "outlook_send",
      "cadences",
      "variant_analytics",
      "slack_notifications",
      "webhooks",
      "calendar",
      "scheduled_exports",
      "audit_log",
      "custom_factors",
      "custom_signals",
      "rbac",
      "sso",
      "white_label",
    ],
    limits: {
      audits: null, // unlimited
      ai_drafts: null, // unlimited
      reply_triages: null, // unlimited
      enrichments: null, // unlimited
      discovery_runs: null, // unlimited
      gmail_sends: null, // unlimited
    },
    maxLeads: null, // unlimited
    maxCampaigns: null, // unlimited
    maxSeats: null, // unlimited (hand-sold)
    priceMonthlyUsd: null, // TODO: fill before launch (spec: $499+/mo, hand-sold)
    priceAnnualUsd: null, // TODO: fill before launch
    razorpayPlanIdMonthly: null, // TODO: fill before launch
    razorpayPlanIdAnnual: null, // TODO: fill before launch
  },
};

/** Plan tier order for comparison (lower index = lower tier). */
const PLAN_ORDER: PlanId[] = ["free", "freelancer", "teams", "studio"];

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}

/**
 * Compare two plan IDs by tier.
 * Returns -1 if a < b (a is lower tier), 0 if equal, 1 if a > b (a is higher tier).
 */
export function comparePlans(a: PlanId, b: PlanId): -1 | 0 | 1 {
  const ai = PLAN_ORDER.indexOf(a);
  const bi = PLAN_ORDER.indexOf(b);
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}
