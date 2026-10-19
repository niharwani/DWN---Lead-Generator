/**
 * /billing/manage — Subscription management page.
 *
 * Razorpay has no hosted customer portal equivalent. This page provides
 * in-app controls for Pause, Resume, and Cancel.
 *
 * Actions are wired to server actions in src/lib/actions.ts.
 */

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageOwner } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { getWorkspace } from "@/lib/db/repos/workspaces";
import { ManageSubscriptionButtons } from "./_components/manage-buttons";

export const metadata: Metadata = { title: "Manage Subscription" };

export default async function ManageSubscriptionPage() {
  const owner = await requirePageOwner();
  const db = await getDb();
  const workspace = await getWorkspace(db, owner.id);

  const subscriptionId = workspace?.razorpaySubscriptionId ?? null;
  const currentPlan = workspace?.plan ?? "free";

  return (
    <>
      <PageHeader
        title="Manage subscription"
        description="Pause, resume, or cancel your subscription. Changes take effect immediately or at the end of the billing cycle."
      />

      <div className="max-w-lg space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Current plan</span>
                <span className="font-medium capitalize text-[var(--color-text)]">
                  {currentPlan}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Subscription ID</span>
                <span className="font-mono text-xs text-[var(--color-text-subtle)]">
                  {subscriptionId ?? "—"}
                </span>
              </div>
            </div>

            {subscriptionId ? (
              <ManageSubscriptionButtons />
            ) : (
              <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                No active subscription found.{" "}
                <a href="/billing" className="underline hover:no-underline">
                  View plans
                </a>{" "}
                to subscribe.
              </p>
            )}
          </CardBody>
        </Card>

        <p className="text-[11px] text-[var(--color-text-subtle)]">
          Questions about your subscription? Email support.
        </p>
      </div>
    </>
  );
}
