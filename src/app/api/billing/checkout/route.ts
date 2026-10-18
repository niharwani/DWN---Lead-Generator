/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session for the authenticated workspace.
 * Returns { url } for the client to redirect to.
 *
 * Rate limited: billing_checkout bucket (10/min/workspace).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { createCheckoutSession } from "@/lib/billing/stripe";
import { assertWithinRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getRuntimeEnv } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { updateStripeFields } from "@/lib/db/repos/workspaces";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let owner;
  try {
    owner = await requireOwner();
  } catch (response) {
    if (response instanceof Response) {
      return NextResponse.json(await response.json().catch(() => ({})), {
        status: response.status,
      });
    }
    throw response;
  }

  // Rate limit
  try {
    assertWithinRateLimit(owner.id, "billing_checkout");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: err.message } },
        {
          status: 429,
          headers: { "Retry-After": String(err.retryAfterSeconds) },
        }
      );
    }
    throw err;
  }

  let body: { priceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { priceId } = body;
  if (!priceId || typeof priceId !== "string") {
    return NextResponse.json(
      { error: { code: "bad_request", message: "priceId is required" } },
      { status: 400 }
    );
  }

  const env = await getRuntimeEnv();
  const baseUrl = env.BILLING_RETURN_URL ?? env.APP_BASE_URL ?? "http://localhost:3000";

  try {
    const session = await createCheckoutSession({
      workspaceId: owner.id,
      priceId,
      successUrl: `${baseUrl}/billing?checkout=success`,
      cancelUrl: `${baseUrl}/billing?checkout=cancelled`,
      customerId: owner.workspace.plan !== "free" ? undefined : undefined, // will be set by webhook
    });

    // If Stripe returned a customer ID, persist it immediately
    if (session.customer) {
      const db = await getDb();
      await updateStripeFields(db, owner.id, { customerId: session.customer });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout] error:", err);
    return NextResponse.json(
      { error: { code: "stripe_error", message: (err as Error).message } },
      { status: 502 }
    );
  }
}
