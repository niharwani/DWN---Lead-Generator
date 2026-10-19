/**
 * POST /api/billing/manage/cancel
 * Cancels the authenticated workspace's Razorpay subscription.
 * By default cancels at end of cycle. Pass cancelAtCycleEnd=false to cancel immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getWorkspace, updateRazorpayFields } from "@/lib/db/repos/workspaces";
import { cancelSubscription } from "@/lib/billing/razorpay";

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

  const db = await getDb();
  const workspace = await getWorkspace(db, owner.id);

  if (!workspace?.razorpaySubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription found." },
      { status: 422 }
    );
  }

  // Read cancelAtCycleEnd from form data (defaults to true)
  let cancelAtCycleEnd = true;
  try {
    const formData = await request.formData();
    const raw = formData.get("cancelAtCycleEnd");
    if (raw === "false") cancelAtCycleEnd = false;
  } catch {
    // ignore — fall back to default
  }

  try {
    await cancelSubscription(workspace.razorpaySubscriptionId, cancelAtCycleEnd);

    if (!cancelAtCycleEnd) {
      // Immediate cancel — downgrade now
      await updateRazorpayFields(db, owner.id, {
        plan: "free",
        subscriptionId: undefined,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/manage/cancel] error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
