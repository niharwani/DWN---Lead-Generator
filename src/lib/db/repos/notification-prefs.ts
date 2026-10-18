/**
 * Notification preferences repository.
 *
 * Persists preferences as a JSON blob in app_settings under key
 * "notification_prefs/v1". No schema migration needed.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { appSettings } from "../schema";

export type NotificationPrefs = {
  emailEnabled: boolean;
  emailAddress?: string;
  slackEnabled: boolean;
  slackWebhookUrl?: string;
  discordEnabled: boolean;
  discordWebhookUrl?: string;
  /** 'weekly' | 'never' */
  digestFrequency: "weekly" | "never";
  hotLeadAlerts: boolean;
  replyAlerts: boolean;
  bounceAlerts: boolean;
};

const SETTINGS_KEY = "notification_prefs/v1";

const DEFAULT_PREFS: NotificationPrefs = {
  emailEnabled: false,
  slackEnabled: false,
  discordEnabled: false,
  digestFrequency: "weekly",
  hotLeadAlerts: true,
  replyAlerts: true,
  bounceAlerts: true,
};

export async function getNotificationPrefs(
  db: Db,
  ownerId: string
): Promise<NotificationPrefs> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, SETTINGS_KEY)))
    .limit(1);
  if (!row) return DEFAULT_PREFS;
  const raw = row.value as Partial<NotificationPrefs>;
  return { ...DEFAULT_PREFS, ...raw };
}

export async function saveNotificationPrefs(
  db: Db,
  ownerId: string,
  prefs: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const current = await getNotificationPrefs(db, ownerId);
  const merged = { ...current, ...prefs };
  const now = new Date().toISOString();

  // Upsert via insert-or-replace pattern for SQLite
  const existing = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, SETTINGS_KEY)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value: merged as unknown, updatedAt: now })
      .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, SETTINGS_KEY)));
  } else {
    await db.insert(appSettings).values({
      id: crypto.randomUUID(),
      ownerId,
      key: SETTINGS_KEY,
      value: merged as unknown,
      updatedAt: now,
    });
  }

  return merged;
}
