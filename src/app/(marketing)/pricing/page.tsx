import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { PLANS, type Feature } from "@/lib/billing/plans";

/* ============================================================================
 * Pricing page
 *
 * Reads directly from PLANS in src/lib/billing/plans.ts.
 * The Razorpay agent renames stripePriceId* → razorpayPlanId* — this page
 * reads the plan shape but does not reference price IDs directly (checkout is
 * handled server-side). Price display uses priceMonthlyUsd / priceAnnualUsd.
 * ========================================================================== */

export const metadata = {
  title: "Pricing — Lead Engine",
  description: "Simple, transparent pricing. Free to start, pay as you grow.",
};

/* Human-readable labels for every Feature value */
const FEATURE_LABELS: Record<Feature, string> = {
  ai_drafts: "AI-assisted outreach drafts",
  gmail_send: "Gmail send + reply polling",
  outlook_send: "Outlook / Microsoft 365",
  cadences: "Follow-up cadences",
  variant_analytics: "A/B variant winner analytics",
  slack_notifications: "Slack + Discord notifications",
  webhooks: "Outbound webhooks (Zapier / n8n)",
  calendar: "Calendar integration (Cal.com / Calendly)",
  scheduled_exports: "Scheduled CSV exports",
  audit_log: "Audit log (compliance-ready)",
  custom_factors: "Custom scoring factor definitions",
  custom_signals: "Custom audit signals",
  rbac: "Role-based access control",
  sso: "SSO / SAML",
  white_label: "White-label (custom domain + branding)",
};

/* All features in the matrix, ordered */
const ALL_FEATURES: Feature[] = [
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
];

function formatPrice(usd: number | null): string {
  if (usd === null) return "TBD";
  return `$${usd}`;
}

function PriceDisplay({ plan }: { plan: (typeof PLANS)[keyof typeof PLANS] }) {
  if (plan.priceMonthlyUsd === null) {
    return (
      <div className="mt-2">
        <span className="text-2xl font-bold text-[var(--color-text)]">TBD</span>
        <p className="mt-1 text-xs text-[var(--color-text-subtle)]">Pricing coming soon</p>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <span className="text-3xl font-bold text-[var(--color-text)]">
        {formatPrice(plan.priceMonthlyUsd)}
      </span>
      <span className="text-sm text-[var(--color-text-subtle)]">/mo</span>
      {plan.priceAnnualUsd !== null && (
        <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
          or {formatPrice(plan.priceAnnualUsd)}/mo billed annually
        </p>
      )}
    </div>
  );
}

function PlanCard({
  planId,
  highlighted = false,
}: {
  planId: "free" | "freelancer" | "teams";
  highlighted?: boolean;
}) {
  const plan = PLANS[planId];

  const badges: Record<string, string> = {
    free: "Lead-magnet",
    freelancer: "Most popular",
    teams: "For agencies",
  };

  const descriptions: Record<string, string> = {
    free: "Try the engine with up to 50 leads. No credit card required.",
    freelancer:
      "Solo consultants, freelancers, and indie founders doing outbound.",
    teams:
      "Agencies, SDR teams, and consultancies that work as a group.",
  };

  const limits: Record<string, string[]> = {
    free: [
      "1 user",
      "50 leads",
      "1 campaign",
      "10 audits / month",
      "No AI drafts",
      "Watermarked exports",
    ],
    freelancer: [
      "1 user",
      "Unlimited leads",
      "3 active campaigns",
      "500 audits / month",
      "300 AI drafts / month",
      "BYO Anthropic key for unlimited AI",
      "7-day activity history",
    ],
    teams: [
      "Up to 25 seats",
      "Unlimited leads + campaigns",
      "2,500 audits / month",
      "2,000 AI drafts / month",
      "BYO Anthropic key for unlimited AI",
      "90-day activity history",
      "Priority email support + Slack-Connect",
    ],
  };

  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        highlighted
          ? "border-[var(--color-accent-600)] ring-1 ring-[var(--color-accent-600)]"
          : "border-[var(--color-border)]"
      } bg-[var(--color-surface)]`}
    >
      {highlighted && (
        <div className="mb-3 inline-flex w-fit items-center rounded-full bg-[var(--color-accent-600)] px-2.5 py-0.5 text-[11px] font-semibold text-white">
          {badges[planId]}
        </div>
      )}
      {!highlighted && (
        <div className="mb-3 inline-flex w-fit items-center rounded-full bg-[var(--color-neutral-100)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
          {badges[planId]}
        </div>
      )}

      <h2 className="text-xl font-semibold text-[var(--color-text)]">{plan.name}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{descriptions[planId]}</p>

      <PriceDisplay plan={plan} />

      <Link
        href="/login"
        className={`mt-5 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors ${
          highlighted
            ? "bg-[var(--color-accent-600)] text-white hover:bg-[var(--color-accent-700)]"
            : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
        }`}
      >
        Get started
      </Link>

      <hr className="my-5 border-[var(--color-border)]" />

      <ul className="flex flex-col gap-2">
        {(limits[planId] ?? []).map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success-600)]" />
            {item}
          </li>
        ))}
      </ul>

      {plan.features.length > 0 && (
        <>
          <hr className="my-4 border-[var(--color-border)]" />
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
            Included features
          </p>
          <ul className="flex flex-col gap-2">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent-600)]" />
                {FEATURE_LABELS[f]}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
      {/* Hero */}
      <div className="mb-14 text-center">
        <h1 className="mb-3 text-4xl font-semibold text-[var(--color-text)]">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-[var(--color-text-muted)]">
          Free to start. Upgrade when your outreach grows.
        </p>
        <p className="mt-2 text-sm text-[var(--color-text-subtle)]">
          Annual billing saves ~20%. Prices in USD.
        </p>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <PlanCard planId="free" />
        <PlanCard planId="freelancer" highlighted />
        <PlanCard planId="teams" />
      </div>

      {/* Studio / Contact us */}
      <div className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-1 inline-flex items-center rounded-full bg-[var(--color-neutral-100)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
              Enterprise
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">
              {PLANS.studio.name}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
              Multi-workspace parent org, white-label, SSO / SAML, SLA, dedicated success manager,
              and a custom DPA. For agencies managing multiple client accounts.
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {["White-label", "SSO / SAML", "Unlimited seats", "SLA", "Dedicated support"].map(
                (item) => (
                  <li
                    key={item}
                    className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]"
                  >
                    <Check className="h-3 w-3 text-[var(--color-success-600)]" />
                    {item}
                  </li>
                )
              )}
            </ul>
          </div>
          <div className="shrink-0">
            <a
              href="mailto:hello@designwithnihar.com?subject=Lead Engine Studio inquiry"
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-neutral-100)]"
            >
              Contact us
            </a>
          </div>
        </div>
      </div>

      {/* Feature matrix table */}
      <section className="mt-16">
        <h2 className="mb-6 text-2xl font-semibold text-[var(--color-text)]">
          Full feature comparison
        </h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                <th className="px-4 py-3 text-left font-semibold text-[var(--color-text)]">
                  Feature
                </th>
                {(["free", "freelancer", "teams", "studio"] as const).map((id) => (
                  <th
                    key={id}
                    className="px-4 py-3 text-center font-semibold text-[var(--color-text)]"
                  >
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_FEATURES.map((feature, i) => (
                <tr
                  key={feature}
                  className={`border-b border-[var(--color-border)] ${
                    i % 2 === 0 ? "bg-[var(--color-surface)]" : "bg-[var(--color-bg)]"
                  }`}
                >
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {FEATURE_LABELS[feature]}
                  </td>
                  {(["free", "freelancer", "teams", "studio"] as const).map((planId) => {
                    const included = PLANS[planId].features.includes(feature);
                    return (
                      <td key={planId} className="px-4 py-3 text-center">
                        {included ? (
                          <Check className="mx-auto h-4 w-4 text-[var(--color-success-600)]" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[var(--color-neutral-300)]" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-16">
        <h2 className="mb-6 text-2xl font-semibold text-[var(--color-text)]">
          Frequently asked questions
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          {[
            {
              q: "Can I bring my own Anthropic API key?",
              a: "Yes. On Freelancer and Teams plans you can plug in your own key and AI drafts won't count against the monthly quota. BYO key = effectively unlimited AI.",
            },
            {
              q: "Does Lead Engine auto-send emails?",
              a: "No — and that's intentional. Every outreach draft goes through a human-approval gate before anything is sent. It's a core part of the product, not a limitation.",
            },
            {
              q: "What payment methods do you accept?",
              a: "Cards and UPI via Razorpay. Annual billing is available at ~20% off.",
            },
            {
              q: "Is there a free trial for Teams?",
              a: "Yes — 14 days, no card required. After the trial, you can keep a workspace on the Free plan or upgrade to Teams.",
            },
          ].map(({ q, a }) => (
            <div
              key={q}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <p className="mb-2 font-medium text-[var(--color-text)]">{q}</p>
              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="mt-16 rounded-xl bg-[var(--color-accent-50)] p-8 text-center">
        <h2 className="mb-2 text-2xl font-semibold text-[var(--color-text)]">
          Start your free account today
        </h2>
        <p className="mb-6 text-[var(--color-text-muted)]">
          50 leads, 1 campaign, no card required.
        </p>
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-md bg-[var(--color-accent-600)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-700)]"
        >
          Get started free
        </Link>
      </div>
    </div>
  );
}
