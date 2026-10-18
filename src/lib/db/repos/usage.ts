/**
 * Repository for the workspace_usage table.
 *
 * Uses the REAL workspace_usage table (not app_settings). Monthly metering
 * for Phase E billing enforcement.
 *
 * Period format: "YYYYMM" in UTC (e.g. "202610" for October 2026).
 */

import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { workspaceUsage, type WorkspaceUsage } from "../schema";
import type { MeteredResource } from "@/lib/billing/plans";

/* --------------------------------------------------------------------------
 * Internal helpers
 * -------------------------------------------------------------------------- */

/** Get the current UTC period string, e.g. "202610". */
export function currentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

/** Map a MeteredResource to the corresponding column name in workspace_usage. */
function resourceToColumn(
  resource: MeteredResource
): "auditsUsed" | "aiDraftsUsed" | "replyTriagesUsed" | "enrichmentsUsed" | "discoveryRunsUsed" | "gmailSendsUsed" {
  const map: Record<MeteredResource, "auditsUsed" | "aiDraftsUsed" | "replyTriagesUsed" | "enrichmentsUsed" | "discoveryRunsUsed" | "gmailSendsUsed"> = {
    audits: "auditsUsed",
    ai_drafts: "aiDraftsUsed",
    reply_triages: "replyTriagesUsed",
    enrichments: "enrichmentsUsed",
    discovery_runs: "discoveryRunsUsed",
    gmail_sends: "gmailSendsUsed",
  };
  return map[resource];
}

/* --------------------------------------------------------------------------
 * Read helpers
 * -------------------------------------------------------------------------- */

/**
 * Get the usage row for the current UTC calendar month.
 * Returns null if no usage has been recorded yet this period.
 */
export async function getCurrentPeriodUsage(
  db: Db,
  workspaceId: string
): Promise<WorkspaceUsage | null> {
  return getPeriodUsage(db, workspaceId, currentPeriod());
}

/**
 * Get the usage row for a specific period.
 * Returns null if no usage row exists for that period.
 */
export async function getPeriodUsage(
  db: Db,
  workspaceId: string,
  periodYyyymm: string
): Promise<WorkspaceUsage | null> {
  const [row] = await db
    .select()
    .from(workspaceUsage)
    .where(
      and(
        eq(workspaceUsage.workspaceId, workspaceId),
        eq(workspaceUsage.periodYyyyMm, periodYyyymm)
      )
    )
    .limit(1);

  return row ?? null;
}

/* --------------------------------------------------------------------------
 * Write helpers
 * -------------------------------------------------------------------------- */

/**
 * Increment a usage counter by n for the current UTC period.
 * Upserts the row if it doesn't exist yet.
 * Thread-safe via SQLite's atomic upsert with column-level arithmetic.
 */
export async function incrementUsage(
  db: Db,
  workspaceId: string,
  resource: MeteredResource,
  n = 1
): Promise<void> {
  const period = currentPeriod();
  const col = resourceToColumn(resource);

  // Insert with n on the resource column; on conflict increment the existing value.
  await db
    .insert(workspaceUsage)
    .values({
      workspaceId,
      periodYyyyMm: period,
      auditsUsed: resource === "audits" ? n : 0,
      aiDraftsUsed: resource === "ai_drafts" ? n : 0,
      replyTriagesUsed: resource === "reply_triages" ? n : 0,
      enrichmentsUsed: resource === "enrichments" ? n : 0,
      discoveryRunsUsed: resource === "discovery_runs" ? n : 0,
      gmailSendsUsed: resource === "gmail_sends" ? n : 0,
    })
    .onConflictDoUpdate({
      target: [workspaceUsage.workspaceId, workspaceUsage.periodYyyyMm],
      set: {
        [col]: sql`${workspaceUsage[col]} + ${n}`,
      },
    });
}

/**
 * Zero out all counters for a workspace in a given period.
 * Admin tool — used for testing and manual corrections.
 */
export async function resetMonth(
  db: Db,
  workspaceId: string,
  periodYyyymm: string
): Promise<void> {
  await db
    .update(workspaceUsage)
    .set({
      auditsUsed: 0,
      aiDraftsUsed: 0,
      replyTriagesUsed: 0,
      enrichmentsUsed: 0,
      discoveryRunsUsed: 0,
      gmailSendsUsed: 0,
    })
    .where(
      and(
        eq(workspaceUsage.workspaceId, workspaceId),
        eq(workspaceUsage.periodYyyyMm, periodYyyymm)
      )
    );
}
