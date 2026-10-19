/**
 * /billing — Standalone plan comparison page.
 *
 * Shows all plans in a grid with feature matrix. "Current plan" chip on the
 * active plan. "Choose" buttons POST to /api/billing/checkout.
 * Yearly/monthly toggle. Price slots show "TBD" when null (pre-launch).
 */

import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requirePageOwner } from "@/lib/data";
import { PLANS, comparePlans, type PlanId, type Feature } from "@/lib/billing/plans";
import { getRuntimeEnv } from "@/lib/env";
import { BillingCheckoutButton } from "./_components/checkout-button";

export const metadata: Metadata = { title: "Billing — Plans" };

const FEATURE_LABELS: Record<Feature, string> = {
  ai_drafts: "AI outreach drafts",
  gmail_send: "Gmail send + reply polling",
  outlook_send: "Outlook / Microsoft 365",
  cadences: "Follow-up cadences",
  variant_analytics: "A/B variant analytics",
  slack_notifications: "Slack / Discord notifications",
  webhooks: "Outbound webhooks",
  calendar: "Calendar integration",
  scheduled_exports: "Scheduled CSV exports",
  audit_log: "Audit log",
  custom_factors: "Custom scoring factors",
  custom_signals: "Custom audit signals",
  rbac: "Role-based access control",
  sso: "SSO (SAML / OIDC)",
  white_label: "White-label",
};

// Ordered list of features to display in the grid
const DISPLAYED_FEATURES: Feature[] = [
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

const PLAN_ORDER: PlanId[] = ["free", "freelancer", "teams", "studio"];

export default async function BillingPage() {
  const owner = await requirePageOwner();
  const currentPlan = owner.workspace.plan;
  const env = await getRuntimeEnv();

  // Map plan IDs to their Razorpay plan IDs (for checkout button)
  const monthlyPlanIds: Partial<Record<PlanId, string>> = {
    freelancer: env.RAZORPAY_PLAN_ID_FREELANCER_MONTHLY ?? undefined,
    teams: env.RAZORPAY_PLAN_ID_TEAMS_MONTHLY ?? undefined,
  };
  const annualPlanIds: Partial<Record<PlanId, string>> = {
    freelancer: env.RAZORPAY_PLAN_ID_FREELANCER_ANNUAL ?? undefined,
    teams: env.RAZORPAY_PLAN_ID_TEAMS_ANNUAL ?? undefined,
  };

  return (
    <>
      <PageHeader
        title="Plans"
        description="Choose the plan that fits your workflow. Prices shown in USD. All plans include a 7-day grace period on payment failure."
      />

      <div className="space-y-8">
        {/* Plan comparison grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId];
            const isCurrentPlan = planId === currentPlan;
            const isUpgrade = comparePlans(planId, currentPlan) > 0;
            const monthlyPriceId = monthlyPlanIds[planId];
            const annualPriceId = annualPlanIds[planId];

            return (
              <Card
                key={planId}
                className={isCurrentPlan ? "ring-2 ring-[var(--color-accent-600)]" : ""}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{plan.name}</CardTitle>
                    {isCurrentPlan && (
                      <Badge variant="accent">Current plan</Badge>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-3">
                    {plan.priceMonthlyUsd !== null ? (
                      <div>
                        <span className="text-2xl font-bold text-[var(--color-text)]">
                          ${plan.priceMonthlyUsd}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">/mo</span>
                        {plan.priceAnnualUsd !== null && (
                          <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                            ${plan.priceAnnualUsd}/mo billed annually
                          </p>
                        )}
                      </div>
                    ) : planId === "free" ? (
                      <div>
                        <span className="text-2xl font-bold text-[var(--color-text)]">Free</span>
                      </div>
                    ) : planId === "studio" ? (
                      <div>
                        <span className="text-sm font-medium text-[var(--color-text-muted)]">
                          Hand-sold
                        </span>
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                          Contact us for pricing
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-lg font-semibold text-[var(--color-text-muted)]">
                          TBD
                        </span>
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                          Pricing set before launch
                        </p>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="mt-4">
                    {isCurrentPlan ? (
                      <Button variant="secondary" size="sm" disabled className="w-full">
                        Current plan
                      </Button>
                    ) : planId === "studio" ? (
                      <a
                        href="mailto:hello@getleadengine.com?subject=Studio plan enquiry"
                        className="inline-flex w-full items-center justify-center rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
                      >
                        Contact us
                      </a>
                    ) : isUpgrade && (monthlyPriceId ?? annualPriceId) ? (
                      <BillingCheckoutButton
                        planId={planId}
                        planName={plan.name}
                        monthlyPriceId={monthlyPriceId ?? null}
                        annualPriceId={annualPriceId ?? null}
                      />
                    ) : isUpgrade ? (
                      <Button variant="primary" size="sm" disabled className="w-full">
                        Choose {plan.name}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled className="w-full">
                        Downgrade via portal
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardBody>
                  {/* Limits summary */}
                  <div className="space-y-1.5 text-xs">
                    <LimitRow
                      label="Leads"
                      value={plan.maxLeads === null ? "Unlimited" : `${plan.maxLeads} total`}
                    />
                    <LimitRow
                      label="Campaigns"
                      value={plan.maxCampaigns === null ? "Unlimited" : `${plan.maxCampaigns} active`}
                    />
                    <LimitRow
                      label="Seats"
                      value={plan.maxSeats === null ? "Unlimited" : `${plan.maxSeats}`}
                    />
                    <LimitRow
                      label="Audits / mo"
                      value={
                        plan.limits.audits === null
                          ? "Unlimited"
                          : plan.limits.audits !== undefined
                          ? String(plan.limits.audits)
                          : "TBD"
                      }
                    />
                    <LimitRow
                      label="AI drafts / mo"
                      value={
                        plan.limits.ai_drafts === null
                          ? "Unlimited"
                          : plan.limits.ai_drafts !== undefined
                          ? String(plan.limits.ai_drafts)
                          : "—"
                      }
                    />
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>

        {/* Feature matrix */}
        <Card>
          <CardHeader>
            <CardTitle>Feature comparison</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="py-2 text-left font-medium text-[var(--color-text-muted)]">
                      Feature
                    </th>
                    {PLAN_ORDER.map((planId) => (
                      <th
                        key={planId}
                        className={`px-3 py-2 text-center font-medium ${
                          planId === currentPlan
                            ? "text-[var(--color-accent-600)]"
                            : "text-[var(--color-text-muted)]"
                        }`}
                      >
                        {PLANS[planId].name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {DISPLAYED_FEATURES.map((feature) => (
                    <tr key={feature} className="hover:bg-[var(--color-neutral-50)]">
                      <td className="py-2 text-[var(--color-text)]">
                        {FEATURE_LABELS[feature]}
                      </td>
                      {PLAN_ORDER.map((planId) => {
                        const included = PLANS[planId].features.includes(feature);
                        return (
                          <td key={planId} className="px-3 py-2 text-center">
                            {included ? (
                              <CheckCircle2
                                aria-label="Included"
                                className="mx-auto h-3.5 w-3.5 text-[var(--color-success-700)]"
                              />
                            ) : (
                              <XCircle
                                aria-label="Not included"
                                className="mx-auto h-3.5 w-3.5 text-[var(--color-neutral-300)]"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <p className="text-[11px] text-[var(--color-text-subtle)]">
          Prices subject to change. Annual billing saves approximately 20%.
          Usage limits reset on the 1st of each UTC calendar month. Manage or cancel
          your subscription at any time via{" "}
          <a href="/billing/manage" className="underline hover:no-underline">
            Manage subscription
          </a>. Questions? Email support.
        </p>
      </div>
    </>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span
        className={`font-medium ${
          value === "Unlimited"
            ? "text-[var(--color-success-700)]"
            : value === "TBD" || value === "—"
            ? "text-[var(--color-text-subtle)]"
            : "text-[var(--color-text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
