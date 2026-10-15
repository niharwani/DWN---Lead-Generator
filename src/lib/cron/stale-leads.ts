/**
 * Daily stale-lead digest.
 *
 * Finds overdue tasks, leads that have gone cold after an initial touch, and
 * qualified leads that never had a draft generated. The result shape is
 * designed to be rendered as an HTML digest (see `buildDigestHtml`) and also
 * logged as an activity so Nihar sees it in his timeline even if the email
 * step isn't wired yet.
 */

import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { leads, outreachDrafts, tasks } from "@/lib/db/schema";
import { rowToDraft, rowToLead, rowToTask } from "@/lib/db/adapt";
import type { Lead, OutreachDraft, Task } from "@/lib/demo/types";

const STUCK_STAGES: Lead["pipelineStage"][] = ["contacted", "replied"];
const OPEN_TASK_STATUSES: Task["status"][] = ["open", "in_progress"];

export type StaleLeadsResult = {
  overdueTasks: Task[];
  stuckLeads: Array<{
    lead: Lead;
    daysSinceContact: number;
    lastDraft?: OutreachDraft;
  }>;
  dormantQualified: Array<{ lead: Lead; daysSinceQualified: number }>;
};

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
}

function iso(nowIso: string, daysAgo: number): string {
  return new Date(Date.parse(nowIso) - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Find all three categories of stale work for the given owner. All queries
 * are owner-scoped — nothing in this function can observe cross-owner data.
 */
export async function findStaleLeads(
  db: Db,
  ownerId: string,
  nowIso: string
): Promise<StaleLeadsResult> {
  const sevenDaysAgo = iso(nowIso, 7);
  const threeDaysAgo = iso(nowIso, 3);

  const overdueTaskRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ownerId),
        inArray(tasks.status, OPEN_TASK_STATUSES),
        sql`${tasks.dueAt} is not null`,
        lt(tasks.dueAt, nowIso)
      )
    );
  const overdueTasks = overdueTaskRows.map(rowToTask);

  const stuckCandidateRows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        eq(leads.doNotContact, false),
        inArray(leads.pipelineStage, STUCK_STAGES),
        sql`${leads.lastContactedAt} is not null`,
        lt(leads.lastContactedAt, sevenDaysAgo)
      )
    );

  const stuckLeads: StaleLeadsResult["stuckLeads"] = [];
  for (const row of stuckCandidateRows) {
    const lead = rowToLead(row);
    const recentFollowUp = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.ownerId, ownerId),
          eq(tasks.leadId, lead.id),
          inArray(tasks.taskType, ["follow_up", "prepare_proposal"]),
          sql`${tasks.createdAt} >= ${sevenDaysAgo}`
        )
      )
      .limit(1);
    if (recentFollowUp.length > 0) continue;

    const [latestDraft] = await db
      .select()
      .from(outreachDrafts)
      .where(
        and(eq(outreachDrafts.ownerId, ownerId), eq(outreachDrafts.leadId, lead.id))
      )
      .orderBy(sql`${outreachDrafts.updatedAt} desc`)
      .limit(1);

    stuckLeads.push({
      lead,
      daysSinceContact: lead.lastContactedAt
        ? daysBetween(lead.lastContactedAt, nowIso)
        : 0,
      lastDraft: latestDraft ? rowToDraft(latestDraft) : undefined,
    });
  }

  const dormantCandidateRows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        eq(leads.doNotContact, false),
        eq(leads.pipelineStage, "qualified"),
        or(isNull(leads.createdAt), lt(leads.createdAt, threeDaysAgo))!
      )
    );

  const dormantQualified: StaleLeadsResult["dormantQualified"] = [];
  for (const row of dormantCandidateRows) {
    const lead = rowToLead(row);
    const [anyDraft] = await db
      .select({ id: outreachDrafts.id })
      .from(outreachDrafts)
      .where(
        and(eq(outreachDrafts.ownerId, ownerId), eq(outreachDrafts.leadId, lead.id))
      )
      .limit(1);
    if (anyDraft) continue;
    dormantQualified.push({
      lead,
      daysSinceQualified: daysBetween(lead.createdAt, nowIso),
    });
  }

  return { overdueTasks, stuckLeads, dormantQualified };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a plain, inline-CSS-free HTML body for the digest. Kept small so it
 * fits inside a Gmail-send step later without needing a templating pass.
 */
export function buildDigestHtml(result: StaleLeadsResult): string {
  const parts: string[] = [];
  parts.push("<h1>DWN Lead Engine — Daily Digest</h1>");

  parts.push(`<h2>Overdue tasks (${result.overdueTasks.length})</h2>`);
  if (result.overdueTasks.length === 0) {
    parts.push("<p>None.</p>");
  } else {
    parts.push("<ul>");
    for (const t of result.overdueTasks) {
      parts.push(
        `<li>${escapeHtml(t.title)} — due ${escapeHtml(t.dueAt ?? "")} (${escapeHtml(t.priority)})</li>`
      );
    }
    parts.push("</ul>");
  }

  parts.push(`<h2>Stuck leads (${result.stuckLeads.length})</h2>`);
  if (result.stuckLeads.length === 0) {
    parts.push("<p>None.</p>");
  } else {
    parts.push("<ul>");
    for (const entry of result.stuckLeads) {
      const draftNote = entry.lastDraft
        ? ` · last draft: ${escapeHtml(entry.lastDraft.status)}`
        : " · no draft";
      parts.push(
        `<li>${escapeHtml(entry.lead.businessName)} — ${entry.daysSinceContact}d since contact${draftNote}</li>`
      );
    }
    parts.push("</ul>");
  }

  parts.push(`<h2>Dormant qualified leads (${result.dormantQualified.length})</h2>`);
  if (result.dormantQualified.length === 0) {
    parts.push("<p>None.</p>");
  } else {
    parts.push("<ul>");
    for (const entry of result.dormantQualified) {
      parts.push(
        `<li>${escapeHtml(entry.lead.businessName)} — qualified ${entry.daysSinceQualified}d ago, no draft yet</li>`
      );
    }
    parts.push("</ul>");
  }

  return parts.join("\n");
}
