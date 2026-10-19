/**
 * Cal.com integration helpers.
 *
 * Stores the workspace's Cal.com scheduling link in app_settings under
 * the key `calendar/v1`. No OAuth is needed — Cal.com public booking links
 * are shareable URLs that don't require an API token.
 *
 * Deferred: direct Google Calendar OAuth to create events post-meeting.
 * That requires GCal OAuth scopes beyond Mail, so it is a separate Phase G+
 * deliverable documented in the final report.
 */

import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/repos/settings";

export const CALENDAR_SETTINGS_KEY = "calendar/v1";

export type CalendarConfig = {
  calcomUrl: string;
  defaultDuration: number; // minutes
};

const calendarConfigSchema = z.object({
  calcomUrl: z
    .string()
    .trim()
    .url("Must be a valid URL (e.g. https://cal.com/yourname/30min)")
    .max(500),
  defaultDuration: z
    .number()
    .int()
    .min(5)
    .max(480)
    .default(30),
});

/**
 * Retrieve the calendar config for the given owner. Returns `undefined` when
 * not yet configured.
 */
export async function getCalendarConfig(
  db: Db,
  ownerId: string
): Promise<CalendarConfig | undefined> {
  const raw = await getSetting<Partial<CalendarConfig>>(
    db,
    ownerId,
    CALENDAR_SETTINGS_KEY
  );
  if (!raw) return undefined;
  const parsed = calendarConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Persist a new calendar config. Validates the URL before saving.
 */
export async function setCalendarConfig(
  db: Db,
  ownerId: string,
  config: Omit<CalendarConfig, "defaultDuration"> & { defaultDuration?: number }
): Promise<CalendarConfig> {
  const parsed = calendarConfigSchema.safeParse({
    calcomUrl: config.calcomUrl,
    defaultDuration: config.defaultDuration ?? 30,
  });
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid calendar config"
    );
  }
  await setSetting(db, ownerId, CALENDAR_SETTINGS_KEY, parsed.data);
  return parsed.data;
}

/**
 * Build a snippet that can be inserted into a draft body.
 * Includes a brief call-to-action sentence and the booking URL.
 */
export function buildBookingLinkSnippet(config: CalendarConfig): string {
  return (
    `\n\nI'd love to set up a quick ${config.defaultDuration}-minute call to discuss this further. ` +
    `You can pick a time that works for you here:\n${config.calcomUrl}\n`
  );
}
