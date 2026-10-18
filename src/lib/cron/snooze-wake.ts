/**
 * Snooze/wake sweep.
 *
 * Leads and tasks can be snoozed until a future date. This cron un-flags any
 * that have expired. The snoozedUntil value is stored in appSettings under
 * "snooze/lead/<leadId>" and "snooze/task/<taskId>" since the schema doesn't
 * have a dedicated column (no migration in Phase D).
 */

import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { appSettings, leads, profiles, tasks } from "@/lib/db/schema";
import { createActivity } from "@/lib/db/repos";

export type SnoozeWakeResult = {
  leadsWoken: number;
  tasksWoken: number;
};

export function snoozeLeadKey(leadId: string) {
  return `snooze/lead/${leadId}`;
}

export function snoozeTaskKey(taskId: string) {
  return `snooze/task/${taskId}`;
}

export async function runSnoozeWakeSweep(
  db: Db,
  ownerId: string
): Promise<SnoozeWakeResult> {
  const result: SnoozeWakeResult = { leadsWoken: 0, tasksWoken: 0 };
  const nowIso = new Date().toISOString();

  // Find all snooze settings for this owner
  const snoozeRows = await db
    .select()
    .from(appSettings)
    .where(
      and(
        eq(appSettings.ownerId, ownerId),
        // Use SQL LIKE to match keys starting with "snooze/"
        // Drizzle doesn't have native LIKE helper for non-text columns without sql``
      )
    );

  for (const row of snoozeRows) {
    if (!row.key.startsWith("snooze/")) continue;

    const snoozedUntil = row.value as string | null;
    if (!snoozedUntil) continue;
    if (snoozedUntil > nowIso) continue; // Still snoozed

    // Clear the snooze
    await db
      .update(appSettings)
      .set({ value: null as unknown, updatedAt: nowIso })
      .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, row.key)));

    if (row.key.startsWith("snooze/lead/")) {
      const leadId = row.key.replace("snooze/lead/", "");
      await createActivity(db, ownerId, {
        leadId,
        activityType: "lead_updated",
        title: "Snooze expired",
        description: `Lead snooze expired — now active again.`,
        metadata: { auto: true },
      });
      result.leadsWoken += 1;
    } else if (row.key.startsWith("snooze/task/")) {
      result.tasksWoken += 1;
    }
  }

  return result;
}

export async function runAllOwnerSnoozeWake(
  db: Db
): Promise<Record<string, SnoozeWakeResult>> {
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  const results: Record<string, SnoozeWakeResult> = {};
  for (const owner of owners) {
    results[owner.id] = await runSnoozeWakeSweep(db, owner.id);
  }
  return results;
}
