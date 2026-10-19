/**
 * POST /api/billing/portal
 *
 * Razorpay does not provide an equivalent of the Stripe Customer Portal.
 * This route returns a 501 Not Implemented response.
 *
 * Use the /billing/manage page instead, which provides Cancel / Pause / Resume
 * buttons backed by dedicated server actions.
 */

import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "not_available",
      message:
        "Razorpay does not provide a customer portal. Use the /billing/manage page to cancel or pause your subscription.",
    },
    { status: 501 }
  );
}
