/**
 * Waitlist repository.
 *
 * Handles soft-launch waitlist capture (pre-billing). All functions are
 * append-only — the waitlist is never updated, only read by admins.
 */

import { asc, count, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { waitlist, type NewWaitlistEntry, type WaitlistEntry } from "@/lib/db/schema";

export type AddToWaitlistInput = {
  email: string;
  phone?: string;
  requestedPlan?: string;
  note?: string;
  source?: string;
  workspaceId?: string;
  userAgent?: string;
};

export async function addToWaitlist(
  db: Db,
  input: AddToWaitlistInput
): Promise<WaitlistEntry> {
  const row: NewWaitlistEntry = {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    requestedPlan: input.requestedPlan?.trim() || null,
    note: input.note?.trim() || null,
    source: input.source?.trim() || null,
    workspaceId: input.workspaceId || null,
    userAgent: input.userAgent?.slice(0, 500) || null,
    createdAt: new Date().toISOString(),
  };

  await db.insert(waitlist).values(row);
  return row as WaitlistEntry;
}

export type ListWaitlistOptions = {
  limit?: number;
  cursor?: string; // ISO timestamp — return rows created after this
};

export async function listWaitlist(
  db: Db,
  { limit = 50, cursor }: ListWaitlistOptions = {}
): Promise<WaitlistEntry[]> {
  const q = db.select().from(waitlist);

  if (cursor) {
    return q
      .where(gt(waitlist.createdAt, cursor))
      .orderBy(asc(waitlist.createdAt))
      .limit(limit)
      .all();
  }

  return q.orderBy(asc(waitlist.createdAt)).limit(limit).all();
}

export async function countWaitlist(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(waitlist);
  return row?.n ?? 0;
}
