import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { rowToTask } from "../adapt";
import { tasks, type NewTask } from "../schema";
import type { Task, TaskPriority, TaskStatus, TaskType } from "@/lib/demo/types";

export async function listTasks(db: Db, ownerId: string): Promise<Task[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.ownerId, ownerId))
    .orderBy(asc(tasks.dueAt), desc(tasks.createdAt));
  return rows.map(rowToTask);
}

export async function getTask(
  db: Db,
  ownerId: string,
  id: string
): Promise<Task | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
    .limit(1);
  return row ? rowToTask(row) : undefined;
}

export type CreateTaskInput = {
  id?: string;
  title: string;
  taskType?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  leadId?: string;
  campaignId?: string;
  dueAt?: string;
  notes?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function createTask(
  db: Db,
  ownerId: string,
  input: CreateTaskInput
): Promise<Task> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const row: NewTask = {
    id,
    ownerId,
    leadId: input.leadId ?? null,
    campaignId: input.campaignId ?? null,
    title: input.title,
    taskType: input.taskType ?? "other",
    priority: input.priority ?? "normal",
    status: input.status ?? "open",
    dueAt: input.dueAt ?? null,
    notes: input.notes ?? null,
    completedAt: input.completedAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  await db.insert(tasks).values(row);
  const created = await getTask(db, ownerId, id);
  if (!created) throw new Error("Failed to read back created task");
  return created;
}

export async function updateTask(
  db: Db,
  ownerId: string,
  id: string,
  patch: Partial<CreateTaskInput>
): Promise<Task | undefined> {
  const update: Partial<NewTask> = { updatedAt: new Date().toISOString() };
  if (patch.title != null) update.title = patch.title;
  if (patch.taskType != null) update.taskType = patch.taskType;
  if (patch.priority != null) update.priority = patch.priority;
  if (patch.status != null) {
    update.status = patch.status;
    if (patch.status === "done" && !patch.completedAt) {
      update.completedAt = new Date().toISOString();
    }
  }
  if (patch.leadId !== undefined) update.leadId = patch.leadId ?? null;
  if (patch.campaignId !== undefined) update.campaignId = patch.campaignId ?? null;
  if (patch.dueAt !== undefined) update.dueAt = patch.dueAt ?? null;
  if (patch.notes !== undefined) update.notes = patch.notes ?? null;
  if (patch.completedAt !== undefined) update.completedAt = patch.completedAt ?? null;

  await db.update(tasks).set(update).where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)));
  return await getTask(db, ownerId, id);
}

export async function deleteTask(
  db: Db,
  ownerId: string,
  id: string
): Promise<void> {
  await db.delete(tasks).where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)));
}
