/**
 * POST /api/billing/webhook
 *
 * Razorpay webhook handler. Unauthenticated — verified via HMAC-SHA256 signature.
 *
 * IMPORTANT: This route must bypass Cloudflare Access when deployed to
 * production. Add an Access bypass rule for this path, or configure the route
 * in wrangler.jsonc with a public zone route that skips Access. Razorpay cannot
 * add CF Access JWT headers.
 *
 * Signature: Razorpay sets the `X-Razorpay-Signature` header to
 * HMAC-SHA256(RAZORPAY_WEBHOOK_SECRET, rawBody) as a hex digest. No timestamp
 * is involved — simpler than Stripe.
 *
 * Handled events:
 *   - subscription.authenticated  → log, no-op (user has authorised mandate)
 *   - subscription.activated      → set plan based on plan_id match
 *   - subscription.charged        → clear payment_failed flag (successful charge)
 *   - subscription.halted         → set payment_failed flag
 *   - subscription.pending        → log, no-op
 *   - subscription.cancelled      → downgrade to free
 *   - subscription.completed      → downgrade to free
 *   - payment.failed              → set payment_failed flag
 *
 * Idempotency: processed Razorpay event IDs are tracked in an in-memory LRU
 * (bounded to 500 entries). Pragmatic for a single-isolate Worker. A D1-backed
 * dedupe table can replace this if multi-isolate consistency becomes necessary.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { getRuntimeEnv } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import {
  updateRazorpayFields,
  getByRazorpayCustomerId,
  getByRazorpaySubscriptionId,
  getWorkspace,
} from "@/lib/db/repos/workspaces";
import { setSetting } from "@/lib/db/repos/settings";
import type { PlanId } from "@/lib/billing/plans";

/* --------------------------------------------------------------------------
 * In-memory LRU for processed event IDs
 * -------------------------------------------------------------------------- */

const PROCESSED_EVENT_LRU_SIZE = 500;
const processedEvents: string[] = [];

function hasProcessed(eventId: string): boolean {
  return processedEvents.includes(eventId);
}

function markProcessed(eventId: string): void {
  if (processedEvents.length >= PROCESSED_EVENT_LRU_SIZE) {
    processedEvents.shift(); // drop oldest
  }
  processedEvents.push(eventId);
}

/* --------------------------------------------------------------------------
 * Plan derivation from Razorpay plan ID
 * -------------------------------------------------------------------------- */

async function planFromPlanId(planId: string): Promise<PlanId> {
  const env = await getRuntimeEnv();
  if (
    planId === env.RAZORPAY_PLAN_ID_FREELANCER_MONTHLY ||
    planId === env.RAZORPAY_PLAN_ID_FREELANCER_ANNUAL
  ) {
    return "freelancer";
  }
  if (
    planId === env.RAZORPAY_PLAN_ID_TEAMS_MONTHLY ||
    planId === env.RAZORPAY_PLAN_ID_TEAMS_ANNUAL
  ) {
    return "teams";
  }
  // Unknown plan — default to freelancer as a safe fallback
  console.warn(`[billing/webhook] Unknown planId "${planId}" — defaulting to freelancer`);
  return "freelancer";
}

/* --------------------------------------------------------------------------
 * Razorpay event types (minimal shapes we need)
 * -------------------------------------------------------------------------- */

type RazorpayEvent = {
  /** Unique event ID — used for idempotency */
  event: string;
  /** ISO timestamp string */
  created_at: number;
  entity: string;
  contains: string[];
  payload: {
    subscription?: {
      entity: {
        id: string;
        plan_id: string;
        customer_id: string | null;
        status: string;
        notes: Record<string, string> | null;
        current_end: number | null;
        ended_at: number | null;
      };
    };
    payment?: {
      entity: {
        id: string;
        subscription_id: string | null;
        customer_id: string | null;
        status: string;
        error_code: string | null;
        error_description: string | null;
      };
    };
  };
};

/* --------------------------------------------------------------------------
 * Handler
 * -------------------------------------------------------------------------- */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = await getRuntimeEnv();
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

  // Read the raw body — MUST NOT be parsed before signature check
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  // Verify signature
  if (webhookSecret) {
    const valid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!valid) {
      console.warn("[billing/webhook] Invalid Razorpay signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[billing/webhook] RAZORPAY_WEBHOOK_SECRET not set in production");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  } else {
    console.warn("[billing/webhook] Skipping signature check — RAZORPAY_WEBHOOK_SECRET not set in dev");
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Idempotency: use event.event + created_at as a dedup key since Razorpay
  // does not guarantee a globally unique event ID field in all versions.
  // Using the subscription/payment entity ID + event type provides a stable key.
  const subEntity = event.payload?.subscription?.entity;
  const payEntity = event.payload?.payment?.entity;
  const entityId = subEntity?.id ?? payEntity?.id ?? "unknown";
  const dedupKey = `${event.event}:${entityId}:${event.created_at}`;

  if (hasProcessed(dedupKey)) {
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }
  markProcessed(dedupKey);

  const db = await getDb();

  try {
    switch (event.event) {
      // -----------------------------------------------------------------------
      // subscription.authenticated — user has authorised the mandate; not yet charged
      // -----------------------------------------------------------------------
      case "subscription.authenticated": {
        if (!subEntity) break;
        console.info(
          `[billing/webhook] subscription.authenticated: sub=${subEntity.id} status=${subEntity.status}`
        );
        // Store subscription ID if we can resolve the workspace from notes
        const workspaceId = subEntity.notes?.workspace_id;
        if (workspaceId) {
          await updateRazorpayFields(db, workspaceId, {
            subscriptionId: subEntity.id,
          });
        }
        break;
      }

      // -----------------------------------------------------------------------
      // subscription.activated — first payment succeeded, plan is live
      // -----------------------------------------------------------------------
      case "subscription.activated": {
        if (!subEntity) break;

        const workspaceId = subEntity.notes?.workspace_id;
        let workspace = workspaceId
          ? await getWorkspace(db, workspaceId)
          : null;

        // Fallback: try customer ID if workspace not found via notes
        if (!workspace && subEntity.customer_id) {
          workspace = await getByRazorpayCustomerId(db, subEntity.customer_id) ?? null;
        }

        if (!workspace) {
          console.warn(
            `[billing/webhook] subscription.activated — could not resolve workspace for sub=${subEntity.id}`
          );
          break;
        }

        const plan = await planFromPlanId(subEntity.plan_id);
        await updateRazorpayFields(db, workspace.id, {
          plan,
          subscriptionId: subEntity.id,
        });
        // Clear any payment-failed state
        await setSetting(db, workspace.id, "billing_state/v1", {
          paymentFailed: false,
          clearedAt: new Date().toISOString(),
        });
        break;
      }

      // -----------------------------------------------------------------------
      // subscription.charged — recurring charge succeeded
      // -----------------------------------------------------------------------
      case "subscription.charged": {
        if (!subEntity) break;

        let workspace = await getByRazorpaySubscriptionId(db, subEntity.id) ?? null;
        if (!workspace && subEntity.customer_id) {
          workspace = await getByRazorpayCustomerId(db, subEntity.customer_id) ?? null;
        }

        if (!workspace) {
          console.warn(
            `[billing/webhook] subscription.charged — could not resolve workspace for sub=${subEntity.id}`
          );
          break;
        }

        // Clear any payment-failed state
        await setSetting(db, workspace.id, "billing_state/v1", {
          paymentFailed: false,
          clearedAt: new Date().toISOString(),
        });
        break;
      }

      // -----------------------------------------------------------------------
      // subscription.halted — repeated payment failures; subscription halted
      // -----------------------------------------------------------------------
      case "subscription.halted": {
        if (!subEntity) break;

        let workspace = await getByRazorpaySubscriptionId(db, subEntity.id) ?? null;
        if (!workspace && subEntity.customer_id) {
          workspace = await getByRazorpayCustomerId(db, subEntity.customer_id) ?? null;
        }

        if (!workspace) {
          console.warn(
            `[billing/webhook] subscription.halted — could not resolve workspace for sub=${subEntity.id}`
          );
          break;
        }

        await setSetting(db, workspace.id, "billing_state/v1", {
          paymentFailed: true,
          failedAt: new Date().toISOString(),
          subscriptionId: subEntity.id,
        });
        break;
      }

      // -----------------------------------------------------------------------
      // subscription.pending — payment pending (e.g. bank processing)
      // -----------------------------------------------------------------------
      case "subscription.pending": {
        if (!subEntity) break;
        console.info(
          `[billing/webhook] subscription.pending: sub=${subEntity.id} — no action taken`
        );
        break;
      }

      // -----------------------------------------------------------------------
      // subscription.cancelled — user or system cancelled
      // -----------------------------------------------------------------------
      case "subscription.cancelled": {
        if (!subEntity) break;

        let workspace = await getByRazorpaySubscriptionId(db, subEntity.id) ?? null;
        if (!workspace && subEntity.customer_id) {
          workspace = await getByRazorpayCustomerId(db, subEntity.customer_id) ?? null;
        }

        if (!workspace) {
          console.warn(
            `[billing/webhook] subscription.cancelled — could not resolve workspace for sub=${subEntity.id}`
          );
          break;
        }

        await updateRazorpayFields(db, workspace.id, {
          plan: "free",
          subscriptionId: undefined,
          trialEndsAt: null,
        });
        break;
      }

      // -----------------------------------------------------------------------
      // subscription.completed — subscription ran its full term
      // -----------------------------------------------------------------------
      case "subscription.completed": {
        if (!subEntity) break;

        let workspace = await getByRazorpaySubscriptionId(db, subEntity.id) ?? null;
        if (!workspace && subEntity.customer_id) {
          workspace = await getByRazorpayCustomerId(db, subEntity.customer_id) ?? null;
        }

        if (!workspace) {
          console.warn(
            `[billing/webhook] subscription.completed — could not resolve workspace for sub=${subEntity.id}`
          );
          break;
        }

        await updateRazorpayFields(db, workspace.id, {
          plan: "free",
          subscriptionId: undefined,
          trialEndsAt: null,
        });
        break;
      }

      // -----------------------------------------------------------------------
      // payment.failed — individual payment failure (may recover without halting)
      // -----------------------------------------------------------------------
      case "payment.failed": {
        if (!payEntity) break;

        // Try to resolve workspace via subscription ID first
        let workspace = null;
        if (payEntity.subscription_id) {
          workspace = await getByRazorpaySubscriptionId(db, payEntity.subscription_id) ?? null;
        }
        if (!workspace && payEntity.customer_id) {
          workspace = await getByRazorpayCustomerId(db, payEntity.customer_id) ?? null;
        }

        if (!workspace) {
          console.warn(
            `[billing/webhook] payment.failed — could not resolve workspace for payment=${payEntity.id}`
          );
          break;
        }

        await setSetting(db, workspace.id, "billing_state/v1", {
          paymentFailed: true,
          failedAt: new Date().toISOString(),
          paymentId: payEntity.id,
          errorCode: payEntity.error_code,
          errorDescription: payEntity.error_description,
        });
        break;
      }

      default:
        // Other events are intentionally ignored
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] Error handling ${event.event}:`, err);
    // Return 200 to prevent Razorpay from retrying — log and investigate
    return NextResponse.json({ received: true, error: (err as Error).message });
  }

  return NextResponse.json({ received: true });
}
