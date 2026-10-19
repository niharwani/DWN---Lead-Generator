/**
 * POST /api/billing/manage/pause
 * Pauses the authenticated workspace's Razorpay subscription.
 */

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getWorkspace } from "@/lib/db/repos/workspaces";
import { pauseSubscription } from "@/lib/billing/razorpay";

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

  const db = await getDb();
  const workspace = await getWorkspace(db, owner.id);

  if (!workspace?.razorpaySubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription found." },
      { status: 422 }
    );
  }

  try {
    await pauseSubscription(workspace.razorpaySubscriptionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/manage/pause] error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
