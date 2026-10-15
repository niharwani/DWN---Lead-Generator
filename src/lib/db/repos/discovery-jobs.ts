import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { rowToDiscoveryJob } from "../adapt";
import { discoveryJobs, type NewDiscoveryJob } from "../schema";
import type { DiscoveryJob, DiscoveryJobStatus } from "@/lib/demo/types";

export async function listDiscoveryJobs(
  db: Db,
  ownerId: string
): Promise<DiscoveryJob[]> {
  const rows = await db
    .select()
    .from(discoveryJobs)
    .where(eq(discoveryJobs.ownerId, ownerId))
    .orderBy(desc(discoveryJobs.createdAt));
  return rows.map(rowToDiscoveryJob);
}

export async function createDiscoveryJob(
  db: Db,
  ownerId: string,
  input: Omit<NewDiscoveryJob, "id" | "ownerId"> & { id?: string }
): Promise<DiscoveryJob> {
  const id = input.id ?? crypto.randomUUID();
  const row: NewDiscoveryJob = { ...input, id, ownerId };
  await db.insert(discoveryJobs).values(row);
  const [stored] = await db
    .select()
    .from(discoveryJobs)
    .where(and(eq(discoveryJobs.ownerId, ownerId), eq(discoveryJobs.id, id)))
    .limit(1);
  if (!stored) throw new Error("Failed to read back created discovery job");
  return rowToDiscoveryJob(stored);
}

export type UpdateDiscoveryJobPatch = Partial<{
  status: DiscoveryJobStatus;
  progressCurrent: number;
  progressTotal: number;
  resultCount: number;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string;
}>;

export async function updateDiscoveryJob(
  db: Db,
  ownerId: string,
  id: string,
  patch: UpdateDiscoveryJobPatch
): Promise<DiscoveryJob | undefined> {
  const update: Partial<NewDiscoveryJob> = {};
  if (patch.status != null) update.status = patch.status;
  if (patch.progressCurrent != null) update.progressCurrent = patch.progressCurrent;
  if (patch.progressTotal != null) update.progressTotal = patch.progressTotal;
  if (patch.resultCount != null) update.resultCount = patch.resultCount;
  if (patch.errorSummary !== undefined)
    update.errorSummary = patch.errorSummary ?? null;
  if (patch.startedAt != null) update.startedAt = patch.startedAt;
  if (patch.completedAt != null) update.completedAt = patch.completedAt;

  await db
    .update(discoveryJobs)
    .set(update)
    .where(and(eq(discoveryJobs.ownerId, ownerId), eq(discoveryJobs.id, id)));

  const [row] = await db
    .select()
    .from(discoveryJobs)
    .where(and(eq(discoveryJobs.ownerId, ownerId), eq(discoveryJobs.id, id)))
    .limit(1);
  return row ? rowToDiscoveryJob(row) : undefined;
}
