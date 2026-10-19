"use client";

/**
 * Client component for the "Choose plan" button on the billing page.
 * Calls the /api/billing/checkout endpoint with the Razorpay plan ID
 * and redirects to the subscription short_url.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlanId } from "@/lib/billing/plans";

type Props = {
  planId: PlanId;
  planName: string;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
};

export function BillingCheckoutButton({
  planId: _planId,
  planName,
  monthlyPriceId,
  annualPriceId,
}: Props) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // monthlyPriceId / annualPriceId here hold Razorpay plan IDs (named for
  // backwards-compat with the billing page component interface)
  const razorpayPlanId = isAnnual
    ? (annualPriceId ?? monthlyPriceId)
    : (monthlyPriceId ?? annualPriceId);

  async function handleCheckout() {
    if (!razorpayPlanId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: razorpayPlanId }),
      });
      const data = (await res.json()) as { url?: string; error?: { message: string } };
      if (!res.ok || !data.url) {
        setError(data.error?.message ?? "Checkout failed. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Annual toggle */}
      {(monthlyPriceId || annualPriceId) && (
        <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <button
            type="button"
            onClick={() => setIsAnnual(false)}
            className={`rounded px-1.5 py-0.5 ${!isAnnual ? "bg-[var(--color-neutral-200)] font-medium text-[var(--color-text)]" : ""}`}
          >
            Monthly
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => setIsAnnual(true)}
            className={`rounded px-1.5 py-0.5 ${isAnnual ? "bg-[var(--color-neutral-200)] font-medium text-[var(--color-text)]" : ""}`}
          >
            Annual
          </button>
        </div>
      )}

      <Button
        variant="primary"
        size="sm"
        className="w-full"
        disabled={loading || !razorpayPlanId}
        onClick={handleCheckout}
      >
        {loading ? "Redirecting…" : `Choose ${planName}`}
      </Button>

      {error && (
        <p className="text-center text-[11px] text-red-600">{error}</p>
      )}
    </div>
  );
}
