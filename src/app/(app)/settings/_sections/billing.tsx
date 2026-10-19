"use client";

/**
 * Billing settings section.
 *
 * Shows:
 *   - Current plan badge
 *   - Usage bars for each metered resource vs. cap ("unlimited" when null)
 *   - Trial countdown if on trial
 *   - "Payment failed" red banner if billing_state/v1 has paymentFailed = true
 *   - Upgrade button → checkout (for upgradeable plans)
 *   - Customer Portal button (for paid plans with a Stripe customer)
 */

import { useState } from "react";
import { CreditCard, TrendingUp, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { comparePlans, PLANS, type PlanId, type MeteredResource } from "@/lib/billing/plans";
import type { WorkspaceUsage } from "@/lib/db/schema";

const RESOURCE_LABELS: Record<MeteredResource, string> = {
  audits: "Audits",
  ai_drafts: "AI Drafts",
  reply_triages: "Reply Triages",
  enrichments: "Enrichments",
  discovery_runs: "Discovery Runs",
  gmail_sends: "Gmail Sends",
};

type UsageField = keyof Omit<WorkspaceUsage, "workspaceId" | "periodYyyyMm">;

const RESOURCE_TO_FIELD: Record<MeteredResource, UsageField> = {
  audits: "auditsUsed",
  ai_drafts: "aiDraftsUsed",
  reply_triages: "replyTriagesUsed",
  enrichments: "enrichmentsUsed",
  discovery_runs: "discoveryRunsUsed",
  gmail_sends: "gmailSendsUsed",
};

const METERED_RESOURCES: MeteredResource[] = [
  "audits",
  "ai_drafts",
  "discovery_runs",
  "gmail_sends",
  "enrichments",
  "reply_triages",
];

type Props = {
  currentPlan: PlanId;
  hasRazorpayCustomer: boolean;
  usage: WorkspaceUsage | null;
  trialEndsAt: string | null;
  paymentFailed: boolean;
  nextPlanId: string | null;
  nextPlanName: string | null;
};

export function BillingSection({
  currentPlan,
  hasRazorpayCustomer,
  usage,
  trialEndsAt,
  paymentFailed,
  nextPlanId,
  nextPlanName,
}: Props) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = PLANS[currentPlan];

  // Trial countdown
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  // Find the next upgradeable plan's ID
  const planOrder: PlanId[] = ["free", "freelancer", "teams", "studio"];
  const nextUpgradePlanId = planOrder.find((p) => comparePlans(p, currentPlan) > 0) ?? null;

  async function handleCheckout() {
    if (!nextPlanId) return;
    setLoading("checkout");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: nextPlanId }),
      });
      const data = (await res.json()) as { url?: string; error?: { message: string } };
      if (!res.ok || !data.url) {
        setError(data.error?.message ?? "Checkout failed.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  function handleManage() {
    window.location.href = "/billing/manage";
  }

  return (
    <Card id="billing">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <CreditCard aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Billing</CardTitle>
              <Badge variant={currentPlan === "free" ? "muted" : "accent"}>
                {plan.name}
              </Badge>
              {trialDaysLeft !== null && trialDaysLeft > 0 && (
                <Badge variant="warning">Trial: {trialDaysLeft}d left</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Plan, usage, and subscription management.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {/* Payment failed banner */}
        {paymentFailed && (
          <div className="mb-4 flex items-start gap-2 rounded-sm border border-red-300 bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <strong>Payment failed.</strong> Your workspace will lose paid features after a
              7-day grace period. Please{" "}
              <a href="/billing/manage" className="underline hover:no-underline">
                manage your subscription
              </a>{" "}
              to resolve the issue.
            </div>
          </div>
        )}

        {/* Trial countdown banner */}
        {trialDaysLeft !== null && trialDaysLeft > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-sm border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              Your trial ends in <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</strong>.
              Add a payment method to keep your {plan.name} features.
            </div>
          </div>
        )}

        {/* Usage meters */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            This month&apos;s usage
          </div>

          {METERED_RESOURCES.map((resource) => {
            const cap = plan.limits[resource] ?? null;
            const field = RESOURCE_TO_FIELD[resource];
            const used = usage ? (usage[field] as number) : 0;
            const pct = cap !== null ? Math.min(100, (used / cap) * 100) : 0;
            const isWarning = cap !== null && pct >= 80;
            const isOver = cap !== null && used >= cap;

            return (
              <div key={resource}>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--color-text-muted)]">
                    {RESOURCE_LABELS[resource]}
                  </span>
                  <span
                    className={
                      isOver
                        ? "font-medium text-red-600"
                        : isWarning
                        ? "font-medium text-yellow-700"
                        : "text-[var(--color-text-subtle)]"
                    }
                  >
                    {cap === null ? (
                      <>
                        {used}{" "}
                        <span className="text-[var(--color-success-700)]">/ unlimited</span>
                      </>
                    ) : (
                      <>
                        {used} / {cap}
                        {isWarning && !isOver && " ⚠"}
                        {isOver && " (limit reached)"}
                      </>
                    )}
                  </span>
                </div>
                {cap !== null && (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--color-neutral-200)]">
                    <div
                      className={`h-full rounded-full ${
                        isOver
                          ? "bg-red-500"
                          : isWarning
                          ? "bg-yellow-400"
                          : "bg-[var(--color-accent-600)]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          {nextUpgradePlanId && (
            <Button
              variant="primary"
              size="sm"
              disabled={loading === "checkout" || !nextPlanId}
              onClick={handleCheckout}
            >
              {loading === "checkout"
                ? "Redirecting…"
                : nextPlanId
                ? `Upgrade to ${PLANS[nextUpgradePlanId].name}`
                : `Upgrade to ${nextPlanName ?? PLANS[nextUpgradePlanId].name}`}
            </Button>
          )}

          {hasRazorpayCustomer && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleManage}
            >
              Manage subscription
            </Button>
          )}

          <a
            href="/billing"
            className="inline-flex h-7 items-center rounded-sm px-2.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]"
          >
            View all plans
          </a>
        </div>

        {error && (
          <p className="mt-2 text-xs text-red-600">{error}</p>
        )}
      </CardBody>
    </Card>
  );
}
