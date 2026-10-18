/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session for the authenticated workspace.
 * Returns { url } for the client to redirect to.
 *
 * Requires that the workspace already has a Stripe customer ID (i.e., has
 * previously gone through a checkout session).
 */

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { createPortalSession } from "@/lib/billing/stripe";
import { getRuntimeEnv } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { getWorkspace } from "@/lib/db/repos/workspaces";

export async function POST(): Promise<NextResponse> {
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

  // Fetch the latest workspace row to get the Stripe customer ID
  const db = await getDb();
  const workspace = await getWorkspace(db, owner.id);
  const customerId = workspace?.stripeCustomerId;

  if (!customerId) {
    return NextResponse.json(
      {
        error: {
          code: "no_customer",
          message: "No Stripe customer found for this workspace. Complete a checkout first.",
        },
      },
      { status: 422 }
    );
  }

  const env = await getRuntimeEnv();
  const baseUrl = env.BILLING_RETURN_URL ?? env.APP_BASE_URL ?? "http://localhost:3000";

  try {
    const session = await createPortalSession({
      customerId,
      returnUrl: `${baseUrl}/settings#billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] error:", err);
    return NextResponse.json(
      { error: { code: "stripe_error", message: (err as Error).message } },
      { status: 502 }
    );
  }
}
