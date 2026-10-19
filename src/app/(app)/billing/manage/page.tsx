/**
 * /billing/manage — Subscription management page.
 *
 * COMING SOON: Billing is not yet live. Shows a simple informational message.
 * The original Razorpay subscription management UI is commented out below for
 * easy restoration once billing goes live.
 */

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageOwner } from "@/lib/data";

export const metadata: Metadata = { title: "Manage Subscription" };

export default async function ManageSubscriptionPage() {
  // coming-soon-restore: uncomment to re-enable subscription management
  // const owner = await requirePageOwner();
  // const db = await getDb();
  // const workspace = await getWorkspace(db, owner.id);
  // const subscriptionId = workspace?.razorpaySubscriptionId ?? null;
  // const currentPlan = workspace?.plan ?? "free";

  // Page still needs owner for auth guard
  await requirePageOwner();

  return (
    <>
      <PageHeader
        title="Manage subscription"
        description="Subscription management coming soon."
      />

      <div className="max-w-lg space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>No active subscription</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              Billing is coming soon — all workspaces currently have unlimited access.
            </p>
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              <a href="/billing" className="text-[var(--color-accent-700)] underline hover:no-underline">
                View plans
              </a>{" "}
              to join the waitlist and be notified when paid plans launch.
            </p>
          </CardBody>
        </Card>

        {/* coming-soon-restore: uncomment the ManageSubscriptionButtons block below
            and re-import ManageSubscriptionButtons from "./_components/manage-buttons"
            to re-enable Razorpay subscription controls

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
        */}

        <p className="text-[11px] text-[var(--color-text-subtle)]">
          Questions about your subscription? Email support.
        </p>
      </div>
    </>
  );
}
