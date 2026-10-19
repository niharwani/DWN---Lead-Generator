/**
 * POST /api/billing/checkout
 *
 * Creates a Razorpay Subscription for the authenticated workspace.
 * Returns { url } (the subscription short_url) for the client to redirect to.
 *
 * If the workspace does not yet have a Razorpay customer ID, one is created
 * first and persisted before creating the subscription.
 *
 * Rate limited: billing_checkout bucket (10/min/workspace).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { createSubscription, createCustomer } from "@/lib/billing/razorpay";
import { assertWithinRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getRuntimeEnv } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { getWorkspace, updateRazorpayFields } from "@/lib/db/repos/workspaces";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // TODO: unblock when Razorpay plans are live in prod
  // coming-soon-restore: remove this block and the Razorpay code below runs automatically
  return Response.json(
    { error: "coming_soon", message: "Billing is coming soon. Please join the waitlist." },
    { status: 503 }
  ) as NextResponse;

  // ---- Razorpay code below — kept intact for when billing goes live ----
  // eslint-disable-next-line no-unreachable
  let owner;
  try {
    owner = await requireOwner();
  } catch (response: unknown) {
    if (response instanceof Response) {
      const r = response as Response;
      return NextResponse.json(await r.json().catch(() => ({})), {
        status: r.status,
      });
    }
    throw response;
  }

  // Rate limit
  try {
    assertWithinRateLimit(owner.id, "billing_checkout");
  } catch (err: unknown) {
    if (err instanceof RateLimitError) {
      const rl = err as RateLimitError;
      return NextResponse.json(
        { error: { code: "rate_limited", message: rl.message } },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSeconds) },
        }
      );
    }
    throw err;
  }

  let body: { planId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { planId } = body;
  if (!planId || typeof planId !== "string") {
    return NextResponse.json(
      { error: { code: "bad_request", message: "planId is required" } },
      { status: 400 }
    );
  }

  const env = await getRuntimeEnv();

  // Determine totalCount: annual plans run ~10 cycles, monthly ~120
  // We identify annual plans by checking env keys; fall back to 120 (monthly)
  const isAnnualPlan =
    planId === env.RAZORPAY_PLAN_ID_FREELANCER_ANNUAL ||
    planId === env.RAZORPAY_PLAN_ID_TEAMS_ANNUAL;
  const totalCount = isAnnualPlan ? 10 : 120;

  try {
    const db = await getDb();
    let workspace = await getWorkspace(db, owner.id);

    // Ensure workspace has a Razorpay customer ID
    let razorpayCustomerId: string | undefined = workspace?.razorpayCustomerId ?? undefined;
    if (!razorpayCustomerId) {
      // Create a customer — use email from owner; name from workspace
      const customer = await createCustomer({
        name: workspace?.name ?? owner.email,
        email: owner.email,
      });
      razorpayCustomerId = customer.id;
      workspace = await updateRazorpayFields(db, owner.id, {
        customerId: razorpayCustomerId,
      });
    }

    // Create the Razorpay subscription
    const subscription = await createSubscription({
      planId: planId as string,
      workspaceId: owner.id,
      totalCount,
      notes: {
        workspace_id: owner.id,
      },
    });

    // Persist the subscription ID immediately
    await updateRazorpayFields(db, owner.id, {
      subscriptionId: subscription.id,
    });

    return NextResponse.json({ url: subscription.short_url });
  } catch (err) {
    console.error("[billing/checkout] error:", err);
    return NextResponse.json(
      { error: { code: "razorpay_error", message: (err as Error).message } },
      { status: 502 }
    );
  }
}
