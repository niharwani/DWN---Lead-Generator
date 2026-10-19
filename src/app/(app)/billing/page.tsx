/**
 * /billing — Standalone plan comparison page.
 *
 * COMING SOON: Billing is not yet live. Shows a waitlist capture form instead
 * of checkout buttons. The original plan comparison grid is preserved below
 * with checkout buttons commented out for easy restoration.
 */

import type { Metadata } from "next";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requirePageOwner } from "@/lib/data";
import { PLANS, type PlanId, type Feature } from "@/lib/billing/plans";
import { WaitlistForm } from "@/components/waitlist/waitlist-form";

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

  // coming-soon-restore: uncomment these lines when Razorpay plans go live
  // const env = await getRuntimeEnv();
  // const monthlyPlanIds: Partial<Record<PlanId, string>> = {
  //   freelancer: env.RAZORPAY_PLAN_ID_FREELANCER_MONTHLY ?? undefined,
  //   teams: env.RAZORPAY_PLAN_ID_TEAMS_MONTHLY ?? undefined,
  // };
  // const annualPlanIds: Partial<Record<PlanId, string>> = {
  //   freelancer: env.RAZORPAY_PLAN_ID_FREELANCER_ANNUAL ?? undefined,
  //   teams: env.RAZORPAY_PLAN_ID_TEAMS_ANNUAL ?? undefined,
  // };

  return (
    <>
      <PageHeader
        title="Plans"
        description="Choose the plan that fits your workflow."
      />

      <div className="space-y-8">
        {/* Coming soon banner */}
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-accent-200)] bg-[var(--color-accent-50)] px-4 py-3 text-sm text-[var(--color-accent-700)]">
          <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Billing is coming soon.</strong> All workspaces currently have unlimited access
            while we finalise pricing. Join the waitlist below to be notified when paid plans launch.
          </div>
        </div>

        {/* Plan comparison grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId];
            const isCurrentPlan = planId === currentPlan;

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
                    {planId === "free" ? (
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

                  {/* CTA — coming-soon-restore: replace with BillingCheckoutButton when live */}
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
                    ) : planId === "free" ? (
                      <Button variant="ghost" size="sm" disabled className="w-full">
                        Your current tier
                      </Button>
                    ) : (
                      /* coming-soon-restore: replace the button below with
                         <BillingCheckoutButton planId={planId} ... /> */
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full"
                        disabled
                        title="Billing coming soon — join the waitlist"
                      >
                        Join waitlist
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

        {/* Waitlist form */}
        <Card>
          <CardHeader>
            <CardTitle>Join the waitlist</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              We&apos;ll let you know when paid plans launch. No spam.
            </p>
          </CardHeader>
          <CardBody>
            <WaitlistForm source="billing_page" />
          </CardBody>
        </Card>
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
