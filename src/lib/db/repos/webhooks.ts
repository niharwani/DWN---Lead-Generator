/**
 * Webhooks and delivery queue repository.
 *
 * Persists webhook configs and delivery records as JSON in app_settings.
 * Webhook list index: "webhooks/index/v1"
 * Each webhook: "webhook/<id>"
 * Delivery queue: "webhook_deliveries/v1" (array of WebhookDelivery)
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { appSettings } from "../schema";

export type WebhookConfig = {
  id: string;
  ownerId: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
};

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export type WebhookDelivery = {
  id: string;
  webhookId: string;
  ownerId: string;
  event: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextRetryAt?: string;
  deliveredAt?: string;
  lastError?: string;
  createdAt: string;
};

const WEBHOOK_INDEX_KEY = "webhooks/index/v1";
const DELIVERIES_KEY = "webhook_deliveries/v1";

function webhookKey(id: string) {
  return `webhook/${id}`;
}

async function upsertSetting(
  db: Db,
  ownerId: string,
  key: string,
  value: unknown
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, key)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, key)));
  } else {
    await db.insert(appSettings).values({
      id: crypto.randomUUID(),
      ownerId,
      key,
      value,
      updatedAt: now,
    });
  }
}

export async function listWebhooks(
  db: Db,
  ownerId: string
): Promise<WebhookConfig[]> {
  const [indexRow] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, WEBHOOK_INDEX_KEY)))
    .limit(1);

  const ids = Array.isArray(indexRow?.value) ? (indexRow.value as string[]) : [];
  const configs: WebhookConfig[] = [];

  for (const id of ids) {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, webhookKey(id))))
      .limit(1);
    if (row?.value) configs.push(row.value as WebhookConfig);
  }

  return configs;
}

export async function createWebhook(
  db: Db,
  ownerId: string,
  input: Omit<WebhookConfig, "id" | "ownerId" | "createdAt">
): Promise<WebhookConfig> {
  const id = crypto.randomUUID();
  const config: WebhookConfig = {
    id,
    ownerId,
    ...input,
    createdAt: new Date().toISOString(),
  };

  await upsertSetting(db, ownerId, webhookKey(id), config);

  const existing = await listWebhooks(db, ownerId);
  const ids = existing.map((w) => w.id);
  if (!ids.includes(id)) ids.push(id);
  await upsertSetting(db, ownerId, WEBHOOK_INDEX_KEY, ids);

  return config;
}

export async function deleteWebhook(
  db: Db,
  ownerId: string,
  id: string
): Promise<boolean> {
  const now = new Date().toISOString();
  await db
    .update(appSettings)
    .set({ value: null as unknown, updatedAt: now })
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, webhookKey(id))));

  const all = await listWebhooks(db, ownerId);
  const ids = all.map((w) => w.id).filter((wid) => wid !== id);
  await upsertSetting(db, ownerId, WEBHOOK_INDEX_KEY, ids);
  return true;
}

export async function listPendingDeliveries(
  db: Db,
  ownerId: string
): Promise<WebhookDelivery[]> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, DELIVERIES_KEY)))
    .limit(1);

  const all = Array.isArray(row?.value) ? (row.value as WebhookDelivery[]) : [];
  const now = new Date().toISOString();
  return all.filter(
    (d) =>
      d.status === "pending" && (d.nextRetryAt == null || d.nextRetryAt <= now)
  );
}

export async function enqueueDelivery(
  db: Db,
  ownerId: string,
  delivery: Omit<WebhookDelivery, "id" | "attempts" | "status" | "createdAt">
): Promise<WebhookDelivery> {
  const newDelivery: WebhookDelivery = {
    ...delivery,
    id: crypto.randomUUID(),
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, DELIVERIES_KEY)))
    .limit(1);

  const all = Array.isArray(row?.value) ? (row.value as WebhookDelivery[]) : [];
  all.push(newDelivery);

  await upsertSetting(db, ownerId, DELIVERIES_KEY, all);
  return newDelivery;
}

export async function markDelivered(
  db: Db,
  ownerId: string,
  deliveryId: string
): Promise<void> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, DELIVERIES_KEY)))
    .limit(1);

  const all = Array.isArray(row?.value) ? (row.value as WebhookDelivery[]) : [];
  const updated = all.map((d) =>
    d.id === deliveryId
      ? { ...d, status: "delivered" as const, deliveredAt: new Date().toISOString() }
      : d
  );
  await upsertSetting(db, ownerId, DELIVERIES_KEY, updated);
}

export async function markFailed(
  db: Db,
  ownerId: string,
  deliveryId: string,
  error: string
): Promise<void> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, DELIVERIES_KEY)))
    .limit(1);

  const all = Array.isArray(row?.value) ? (row.value as WebhookDelivery[]) : [];
  const updated = all.map((d) =>
    d.id === deliveryId
      ? { ...d, status: "failed" as const, lastError: error }
      : d
  );
  await upsertSetting(db, ownerId, DELIVERIES_KEY, updated);
}

export async function scheduleRetry(
  db: Db,
  ownerId: string,
  deliveryId: string,
  nextRetryAt: string,
  error: string
): Promise<void> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, DELIVERIES_KEY)))
    .limit(1);

  const all = Array.isArray(row?.value) ? (row.value as WebhookDelivery[]) : [];
  const updated = all.map((d) =>
    d.id === deliveryId
      ? {
          ...d,
          status: "pending" as const,
          attempts: d.attempts + 1,
          nextRetryAt,
          lastError: error,
        }
      : d
  );
  await upsertSetting(db, ownerId, DELIVERIES_KEY, updated);
}

/**
 * Generate an HMAC-SHA256 signature for a webhook payload.
 * Returns `sha256=<hex>` format (same as GitHub webhooks).
 */
export async function signPayload(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

/**
 * Verify an HMAC-SHA256 signature. Constant-time via subtle.verify.
 */
export async function verifySignature(
  secret: string,
  body: string,
  signature: string
): Promise<boolean> {
  const expected = await signPayload(secret, body);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(signature);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
