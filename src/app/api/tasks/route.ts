import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { createTask, listTasks } from "@/lib/db/repos";
import {
  jsonCreated,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../_lib/response";
import {
  taskPrioritySchema,
  taskStatusSchema,
  taskTypeSchema,
} from "../_lib/schemas";

export const GET = withErrorHandling(async () => {
  const owner = await requireOwner();
  const db = await getDb();
  const items = await listTasks(db, owner.id);
  return jsonOk({ items });
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  taskType: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  leadId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const POST = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  const db = await getDb();
  const parsed = await parseJson(req, createTaskSchema);
  if (parsed instanceof Response) return parsed;
  const created = await createTask(db, owner.id, parsed);
  return jsonCreated(created);
});
