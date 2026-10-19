/**
 * POST /api/billing/manage/resume
 * Resumes the authenticated workspace's paused Razorpay subscription.
 */

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getWorkspace } from "@/lib/db/repos/workspaces";
import { resumeSubscription } from "@/lib/billing/razorpay";

export async function POST(): Promise<NextResponse> {
  // TODO: unblock when Razorpay plans are live in prod
  // coming-soon-restore: remove this block to re-enable subscription resume
  return NextResponse.json(
    { error: "coming_soon", message: "Billing is coming soon. Please join the waitlist." },
    { status: 503 }
  );

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

  const db = await getDb();
  const workspace = await getWorkspace(db, owner.id);
  const subscriptionId = workspace?.razorpaySubscriptionId;

  if (!subscriptionId) {
    return NextResponse.json(
      { error: "No subscription found." },
      { status: 422 }
    );
  }

  try {
    await resumeSubscription(subscriptionId as string);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/manage/resume] error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
