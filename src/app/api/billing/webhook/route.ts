/**
 * POST /api/billing/webhook
 *
 * Stripe webhook handler. Unauthenticated — verified via HMAC-SHA256 signature.
 *
 * IMPORTANT: This route must bypass Cloudflare Access when deployed to
 * production. Add an Access bypass rule for this path, or configure the route
 * in wrangler.jsonc with a public zone route that skips Access. Stripe cannot
 * add CF Access JWT headers.
 *
 * Handled events:
 *   - checkout.session.completed  → activate subscription, store customer + sub IDs
 *   - customer.subscription.updated → plan change (upgrade/downgrade/seat change)
 *   - customer.subscription.deleted → downgrade to free, clear subscription ID
 *   - invoice.payment_failed       → set billing_state flag for payment-failed banner
 *   - invoice.paid                 → clear payment-failed flag, confirm active
 *
 * Idempotency: processed Stripe event IDs are tracked in an in-memory LRU
 * (bounded to 500 entries). This is pragmatic for a single-isolate Worker.
 * A D1-backed dedupe table can replace this if multi-isolate consistency
 * becomes necessary.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/billing/stripe";
import { getRuntimeEnv } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { updateStripeFields, getByStripeCustomerId } from "@/lib/db/repos/workspaces";
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
 * Plan derivation from Stripe price ID
 * -------------------------------------------------------------------------- */

async function planFromPriceId(priceId: string): Promise<PlanId> {
  const env = await getRuntimeEnv();
  if (
    priceId === env.STRIPE_PRICE_ID_FREELANCER_MONTHLY ||
    priceId === env.STRIPE_PRICE_ID_FREELANCER_ANNUAL
  ) {
    return "freelancer";
  }
  if (
    priceId === env.STRIPE_PRICE_ID_TEAMS_MONTHLY ||
    priceId === env.STRIPE_PRICE_ID_TEAMS_ANNUAL
  ) {
    return "teams";
  }
  // Unknown price — default to freelancer as a safe fallback
  console.warn(`[billing/webhook] Unknown priceId "${priceId}" — defaulting to freelancer`);
  return "freelancer";
}

/* --------------------------------------------------------------------------
 * Stripe event types (minimal shapes we need)
 * -------------------------------------------------------------------------- */

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

/* --------------------------------------------------------------------------
 * Handler
 * -------------------------------------------------------------------------- */

export async function POST(request: NextRequest): Promise<NextResponse> {
  const env = await getRuntimeEnv();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  // Read the raw body — MUST NOT be parsed before signature check
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  // Verify signature
  if (webhookSecret) {
    const valid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!valid) {
      console.warn("[billing/webhook] Invalid Stripe signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[billing/webhook] STRIPE_WEBHOOK_SECRET not set in production");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  } else {
    console.warn("[billing/webhook] Skipping signature check — STRIPE_WEBHOOK_SECRET not set in dev");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Idempotency check
  if (hasProcessed(event.id)) {
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }
  markProcessed(event.id);

  const db = await getDb();
  const obj = event.data.object;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const customerId = obj.customer as string | null;
        const subscriptionId = obj.subscription as string | null;
        const workspaceId = (obj.metadata as Record<string, string> | null)?.workspace_id;

        if (!workspaceId) {
          console.warn("[billing/webhook] checkout.session.completed missing workspace_id metadata");
          break;
        }

        if (customerId && subscriptionId) {
          // Determine plan from line items if available; otherwise we wait for
          // customer.subscription.updated which carries full price detail
          await updateStripeFields(db, workspaceId, {
            customerId,
            subscriptionId,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const customerId = obj.customer as string;
        const status = obj.status as string;
        const items = obj.items as { data: Array<{ price: { id: string } }> } | null;
        const trialEnd = obj.trial_end as number | null;

        const workspace = await getByStripeCustomerId(db, customerId);
        if (!workspace) {
          console.warn(`[billing/webhook] No workspace for customer ${customerId}`);
          break;
        }

        const priceId = items?.data?.[0]?.price?.id;
        const plan = priceId ? await planFromPriceId(priceId) : undefined;

        const trialEndsAt = trialEnd
          ? new Date(trialEnd * 1000).toISOString()
          : null;

        // On cancellation/lapse, downgrade to free; otherwise apply the plan
        const resolvedPlan: PlanId =
          status === "canceled" || status === "unpaid" || status === "past_due"
            ? "free"
            : (plan ?? workspace.plan as PlanId);

        await updateStripeFields(db, workspace.id, {
          plan: resolvedPlan,
          subscriptionId: obj.id as string,
          trialEndsAt,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const customerId = obj.customer as string;

        const workspace = await getByStripeCustomerId(db, customerId);
        if (!workspace) {
          console.warn(`[billing/webhook] No workspace for customer ${customerId}`);
          break;
        }

        await updateStripeFields(db, workspace.id, {
          plan: "free",
          subscriptionId: undefined, // clear subscription reference
          trialEndsAt: null,
        });
        break;
      }

      case "invoice.payment_failed": {
        const customerId = obj.customer as string;

        const workspace = await getByStripeCustomerId(db, customerId);
        if (!workspace) {
          console.warn(`[billing/webhook] No workspace for customer ${customerId}`);
          break;
        }

        // Set billing state flag — UI reads this to show a red payment-failed banner
        // Note: app_settings uses workspace.id as ownerId
        await setSetting(db, workspace.id, "billing_state/v1", {
          paymentFailed: true,
          failedAt: new Date().toISOString(),
          invoiceId: obj.id,
        });
        break;
      }

      case "invoice.paid": {
        const customerId = obj.customer as string;

        const workspace = await getByStripeCustomerId(db, customerId);
        if (!workspace) {
          console.warn(`[billing/webhook] No workspace for customer ${customerId}`);
          break;
        }

        // Clear any payment-failed state
        await setSetting(db, workspace.id, "billing_state/v1", {
          paymentFailed: false,
          clearedAt: new Date().toISOString(),
        });
        break;
      }

      default:
        // Other events are intentionally ignored
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] Error handling ${event.type}:`, err);
    // Return 200 to prevent Stripe from retrying — log and investigate
    return NextResponse.json({ received: true, error: (err as Error).message });
  }

  return NextResponse.json({ received: true });
}
