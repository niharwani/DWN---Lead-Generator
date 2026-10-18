/**
 * Weekly digest email sender.
 *
 * Composes and sends a weekly digest for each workspace member who has
 * digestFrequency = 'weekly' in their notification preferences.
 * Uses Resend for delivery. Gracefully skips if RESEND_API_KEY is absent.
 */

import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { leads, outreachDrafts, profiles, tasks } from "@/lib/db/schema";
import { getNotificationPrefs } from "@/lib/db/repos/notification-prefs";
import {
  buildWeeklyDigestHtml,
  buildWeeklyDigestText,
  type DigestData,
} from "@/lib/notifications/digest-template";
import type { RuntimeEnv } from "@/lib/env";

export type DigestSweepResult = {
  sent: number;
  skipped: number;
  errors: Array<{ ownerId: string; reason: string }>;
};

export async function runWeeklyDigests(
  db: Db,
  ownerId: string,
  env: RuntimeEnv
): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
  const prefs = await getNotificationPrefs(db, ownerId);

  if (prefs.digestFrequency !== "weekly") {
    return { sent: false, skipped: true, reason: "digest disabled" };
  }
  if (!prefs.emailEnabled || !prefs.emailAddress) {
    return { sent: false, skipped: true, reason: "email not configured" };
  }

  const resendKey = env.RESEND_API_KEY;
  if (!resendKey) {
    return { sent: false, skipped: true, reason: "RESEND_API_KEY not set" };
  }

  const nowIso = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = weekAgo;

  // Fetch data for digest
  const [ownerRow] = await db
    .select({ fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.id, ownerId))
    .limit(1);

  const ownerName = ownerRow?.fullName ?? "there";

  // Hot leads: meeting_booked or high score replied
  const hotLeadRows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        sql`${leads.pipelineStage} IN ('meeting_booked','proposal_sent','replied')`
      )
    )
    .limit(10)
    .catch(() =>
      db
        .select()
        .from(leads)
        .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)))
        .limit(0)
    );

  // Stuck contacts: contacted more than 7 days ago with no reply
  const stuckRows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        eq(leads.doNotContact, false),
        eq(leads.pipelineStage, "contacted"),
        sql`${leads.lastContactedAt} is not null`,
        lt(leads.lastContactedAt, sevenDaysAgo)
      )
    )
    .limit(10);

  // Follow-ups due in next 7 days
  const followUpRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ownerId),
        eq(tasks.status, "open"),
        eq(tasks.taskType, "follow_up"),
        sql`${tasks.dueAt} is not null`,
        sql`${tasks.dueAt} <= ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()}`
      )
    )
    .limit(10);

  // Recent replies this week
  const replyRows = await db
    .select()
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.ownerId, ownerId),
        eq(outreachDrafts.status, "replied"),
        sql`${outreachDrafts.repliedAt} >= ${weekAgo}`
      )
    )
    .limit(10);

  const totalLeadsRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)));

  const totalLeads = totalLeadsRow[0]?.count ?? 0;

  const data: DigestData = {
    weekOf: new Date(weekAgo).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    ownerName: String(ownerName),
    hotLeads: hotLeadRows.map((l) => ({
      id: l.id,
      businessName: l.businessName,
      stage: l.pipelineStage,
      score: l.fitScore ?? undefined,
    })),
    stuckContacts: stuckRows.map((l) => ({
      id: l.id,
      businessName: l.businessName,
      daysSinceContact: l.lastContactedAt
        ? Math.floor((Date.now() - Date.parse(l.lastContactedAt)) / (24 * 60 * 60 * 1000))
        : 0,
    })),
    followUpsDue: followUpRows.map((t) => ({
      id: t.id,
      businessName: t.title.replace(/^Follow up with /, ""),
      dueAt: t.dueAt ?? nowIso,
    })),
    recentReplies: replyRows.map((d) => ({
      id: d.id,
      businessName: d.leadId,
      sentiment: d.replySentiment ?? undefined,
    })),
    totalLeads,
  };

  const html = buildWeeklyDigestHtml(data);
  const text = buildWeeklyDigestText(data);

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "DWN Lead Engine <noreply@dwn.studio>",
        to: [prefs.emailAddress],
        subject: `Weekly digest — week of ${data.weekOf}`,
        html,
        text,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      return { sent: false, skipped: false, reason: `Resend error ${resp.status}: ${err.slice(0, 100)}` };
    }

    return { sent: true, skipped: false };
  } catch (err) {
    return { sent: false, skipped: false, reason: (err as Error).message };
  }
}

export async function runAllOwnerDigests(
  db: Db,
  env: RuntimeEnv
): Promise<DigestSweepResult> {
  const result: DigestSweepResult = { sent: 0, skipped: 0, errors: [] };

  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  for (const owner of owners) {
    try {
      const r = await runWeeklyDigests(db, owner.id, env);
      if (r.sent) result.sent += 1;
      else if (r.skipped) result.skipped += 1;
      else result.errors.push({ ownerId: owner.id, reason: r.reason ?? "unknown" });
    } catch (err) {
      result.errors.push({ ownerId: owner.id, reason: (err as Error).message });
    }
  }

  return result;
}
