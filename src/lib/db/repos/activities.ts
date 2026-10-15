import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { rowToActivity } from "../adapt";
import { activities, type NewActivity } from "../schema";
import type { Activity, ActivityType } from "@/lib/demo/types";

export async function listActivities(
  db: Db,
  ownerId: string,
  opts?: { leadId?: string; limit?: number }
): Promise<Activity[]> {
  const conditions = [eq(activities.ownerId, ownerId)];
  if (opts?.leadId) conditions.push(eq(activities.leadId, opts.leadId));
  const query = db
    .select()
    .from(activities)
    .where(and(...conditions))
    .orderBy(desc(activities.createdAt));
  const rows = opts?.limit ? await query.limit(opts.limit) : await query;
  return rows.map(rowToActivity);
}

export type CreateActivityInput = {
  id?: string;
  leadId?: string;
  campaignId?: string;
  activityType: ActivityType;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export async function createActivity(
  db: Db,
  ownerId: string,
  input: CreateActivityInput
): Promise<Activity> {
  const id = input.id ?? crypto.randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const row: NewActivity = {
    id,
    ownerId,
    leadId: input.leadId ?? null,
    campaignId: input.campaignId ?? null,
    activityType: input.activityType,
    title: input.title,
    description: input.description ?? null,
    metadata: input.metadata ?? null,
    createdAt,
  };
  await db.insert(activities).values(row);
  return rowToActivity({
    id,
    ownerId,
    leadId: row.leadId ?? null,
    campaignId: row.campaignId ?? null,
    activityType: input.activityType,
    title: input.title,
    description: row.description ?? null,
    metadata: row.metadata ?? null,
    createdAt,
  });
}
