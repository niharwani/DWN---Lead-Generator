/**
 * Webhook delivery queue drain.
 *
 * Scans pending and retry-due webhook deliveries, POSTs payloads with HMAC
 * signatures, and applies exponential backoff up to 5 attempts.
 */

import { asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import {
  listPendingDeliveries,
  listWebhooks,
  markDelivered,
  markFailed,
  scheduleRetry,
  signPayload,
} from "@/lib/db/repos/webhooks";

export type WebhookDispatchResult = {
  dispatched: number;
  delivered: number;
  retrying: number;
  failed: number;
};

const MAX_ATTEMPTS = 5;

/** Exponential backoff in seconds: 30s, 2m, 8m, 30m, 2h */
function backoffSeconds(attempt: number): number {
  const base = [30, 120, 480, 1800, 7200];
  return base[Math.min(attempt, base.length - 1)] ?? 7200;
}

export async function runWebhookDispatch(
  db: Db,
  ownerId: string
): Promise<WebhookDispatchResult> {
  const result: WebhookDispatchResult = {
    dispatched: 0,
    delivered: 0,
    retrying: 0,
    failed: 0,
  };

  const pending = await listPendingDeliveries(db, ownerId);
  const webhooks = await listWebhooks(db, ownerId);
  const webhookMap = new Map(webhooks.map((w) => [w.id, w]));

  for (const delivery of pending) {
    result.dispatched += 1;

    const webhook = webhookMap.get(delivery.webhookId);
    if (!webhook || !webhook.enabled) {
      await markFailed(db, ownerId, delivery.id, "Webhook not found or disabled");
      result.failed += 1;
      continue;
    }

    if (delivery.attempts >= MAX_ATTEMPTS) {
      await markFailed(db, ownerId, delivery.id, `Max attempts (${MAX_ATTEMPTS}) reached`);
      result.failed += 1;
      continue;
    }

    const bodyStr = JSON.stringify(delivery.payload);
    const signature = await signPayload(webhook.secret, bodyStr);

    try {
      const resp = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dwn-signature": signature,
          "x-dwn-event": delivery.event,
          "x-dwn-delivery": delivery.id,
        },
        body: bodyStr,
        // 10-second timeout via AbortController
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        await markDelivered(db, ownerId, delivery.id);
        result.delivered += 1;
      } else {
        const errorText = await resp.text().catch(() => "");
        if (delivery.attempts + 1 >= MAX_ATTEMPTS) {
          await markFailed(db, ownerId, delivery.id, `HTTP ${resp.status}: ${errorText.slice(0, 100)}`);
          result.failed += 1;
        } else {
          const nextRetryAt = new Date(
            Date.now() + backoffSeconds(delivery.attempts + 1) * 1000
          ).toISOString();
          await scheduleRetry(db, ownerId, delivery.id, nextRetryAt, `HTTP ${resp.status}`);
          result.retrying += 1;
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      if (delivery.attempts + 1 >= MAX_ATTEMPTS) {
        await markFailed(db, ownerId, delivery.id, errMsg);
        result.failed += 1;
      } else {
        const nextRetryAt = new Date(
          Date.now() + backoffSeconds(delivery.attempts + 1) * 1000
        ).toISOString();
        await scheduleRetry(db, ownerId, delivery.id, nextRetryAt, errMsg);
        result.retrying += 1;
      }
    }
  }

  return result;
}

export async function runAllOwnerWebhookDispatch(
  db: Db
): Promise<Record<string, WebhookDispatchResult>> {
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  const results: Record<string, WebhookDispatchResult> = {};
  for (const owner of owners) {
    results[owner.id] = await runWebhookDispatch(db, owner.id);
  }
  return results;
}
