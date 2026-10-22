/**
 * Crawl-snapshots repository (Stream F — Web Intelligence change detection).
 *
 * Every row records one HTML snapshot captured by the intel crawler. Snapshots
 * are owner-scoped. When a lead_id is supplied, inserts also verify the lead
 * belongs to the owner (defense-in-depth against stale IDs leaking across
 * tenants).
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  crawlSnapshots,
  leads,
  type CrawlSnapshot,
  type NewCrawlSnapshot,
} from "@/lib/db/schema";

export type CreateSnapshotInput = {
  leadId?: string | null;
  jobId?: string | null;
  url: string;
  contentHash: string;
  title?: string | null;
  r2Key?: string | null;
  bytes?: number | null;
  observedAt?: string;
};

export async function createSnapshot(
  db: Db,
  ownerId: string,
  input: CreateSnapshotInput
): Promise<CrawlSnapshot> {
  // Owner-check via join on leads when leadId is present. If the lead doesn't
  // belong to this owner, refuse — never silently write to the wrong tenant.
  if (input.leadId) {
    const [row] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.ownerId, ownerId), eq(leads.id, input.leadId)))
      .limit(1);
    if (!row) throw new Error("lead not found for owner");
  }

  const id = crypto.randomUUID();
  const observedAt = input.observedAt ?? new Date().toISOString();
  const row: NewCrawlSnapshot = {
    id,
    ownerId,
    leadId: input.leadId ?? null,
    jobId: input.jobId ?? null,
    url: input.url,
    contentHash: input.contentHash,
    title: input.title ?? null,
    r2Key: input.r2Key ?? null,
    bytes: input.bytes ?? null,
    observedAt,
  };

  await db.insert(crawlSnapshots).values(row);
  return row as CrawlSnapshot;
}

/**
 * Fetches the most recent prior snapshot for a given (owner, lead?, url).
 * `leadId` may be null — some crawls aren't lead-scoped (e.g., prospecting).
 * When `leadId` is null the lookup narrows by owner + url only; passing a null
 * leadId does NOT match rows that happen to have null lead_id (we treat null
 * as "I don't care which lead" rather than "match null specifically").
 */
export async function latestSnapshotForUrl(
  db: Db,
  ownerId: string,
  leadId: string | null,
  url: string
): Promise<CrawlSnapshot | undefined> {
  const whereClause = leadId
    ? and(
        eq(crawlSnapshots.ownerId, ownerId),
        eq(crawlSnapshots.leadId, leadId),
        eq(crawlSnapshots.url, url)
      )
    : and(eq(crawlSnapshots.ownerId, ownerId), eq(crawlSnapshots.url, url));

  const [row] = await db
    .select()
    .from(crawlSnapshots)
    .where(whereClause)
    .orderBy(desc(crawlSnapshots.observedAt))
    .limit(1);
  return row;
}

/**
 * Lists snapshots for a lead, newest first. Caller supplies the owner so a
 * leaked lead_id can't be dereferenced from another tenant.
 */
export async function listSnapshotsForLead(
  db: Db,
  ownerId: string,
  leadId: string,
  limit = 50
): Promise<CrawlSnapshot[]> {
  return db
    .select()
    .from(crawlSnapshots)
    .where(
      and(
        eq(crawlSnapshots.ownerId, ownerId),
        eq(crawlSnapshots.leadId, leadId)
      )
    )
    .orderBy(desc(crawlSnapshots.observedAt))
    .limit(limit);
}

// Re-export for callers that destructure from this module directly.
export type { CrawlSnapshot, NewCrawlSnapshot };
