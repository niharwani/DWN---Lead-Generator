"use client";

/**
 * Billing settings section.
 *
 * COMING SOON: Billing is not yet live. Shows a simple coming-soon card
 * with a waitlist form. The full usage-metering + checkout UI is commented
 * out below for easy restoration.
 *
 * coming-soon-restore: swap this file's export with the commented-out
 * BillingSection below. The Props type and imports are preserved.
 */

import { CreditCard } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { WaitlistForm } from "@/components/waitlist/waitlist-form";

// coming-soon-restore: uncomment these imports when billing goes live
// import { useState } from "react";
// import { CreditCard, TrendingUp, AlertTriangle } from "lucide-react";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { comparePlans, PLANS, type PlanId, type MeteredResource } from "@/lib/billing/plans";
// import type { WorkspaceUsage } from "@/lib/db/schema";

// coming-soon-restore: keep these type definitions for when billing goes live
// const RESOURCE_LABELS: Record<MeteredResource, string> = {
//   audits: "Audits",
//   ai_drafts: "AI Drafts",
//   reply_triages: "Reply Triages",
//   enrichments: "Enrichments",
//   discovery_runs: "Discovery Runs",
//   gmail_sends: "Gmail Sends",
// };

// coming-soon-restore Props type kept for easy restoration:
// type Props = {
//   currentPlan: PlanId;
//   hasRazorpayCustomer: boolean;
//   usage: WorkspaceUsage | null;
//   trialEndsAt: string | null;
//   paymentFailed: boolean;
//   nextPlanId: string | null;
//   nextPlanName: string | null;
// };

export type BillingSectionProps = {
  currentPlan?: string;
  hasRazorpayCustomer?: boolean;
  usage?: unknown;
  trialEndsAt?: string | null;
  paymentFailed?: boolean;
  nextPlanId?: string | null;
  nextPlanName?: string | null;
};

export function BillingSection(_props: BillingSectionProps) {
  return (
    <Card id="billing">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <CreditCard aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle>Billing</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Billing is coming soon — all workspaces currently have unlimited access.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Join the waitlist to be notified when paid plans launch. No spam.
        </p>

        <WaitlistForm source="settings_banner" compact />

        <p className="text-xs text-[var(--color-text-subtle)]">
          <a href="/billing" className="text-[var(--color-accent-700)] underline hover:no-underline">
            View all plans
          </a>{" "}
          to see what&apos;s included in each tier.
        </p>

        {/* coming-soon-restore: paste the full BillingSection body from git history here.
            The full UI included:
            - Payment-failed banner (paymentFailed prop)
            - Trial countdown banner (trialEndsAt prop)
            - Usage meter bars for each MeteredResource
            - Upgrade button → handleCheckout() calling /api/billing/checkout
            - Manage subscription button → /billing/manage
            - View all plans link
        */}
      </CardBody>
    </Card>
  );
}
