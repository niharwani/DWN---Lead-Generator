import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { deleteTask, getTask, updateTask } from "@/lib/db/repos";
import {
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../../_lib/response";
import {
  taskPrioritySchema,
  taskStatusSchema,
  taskTypeSchema,
} from "../../_lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();
  const task = await getTask(db, owner.id, id);
  if (!task) {
    return jsonError(404, { code: "not_found", message: "Task not found." });
  }
  return jsonOk(task);
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  taskType: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional(),
  leadId: z.string().uuid().optional().nullable(),
  campaignId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const PATCH = withErrorHandling(async (req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();
  const parsed = await parseJson(req, patchSchema);
  if (parsed instanceof Response) return parsed;
  const updated = await updateTask(db, owner.id, id, {
    ...parsed,
    leadId: parsed.leadId ?? undefined,
    campaignId: parsed.campaignId ?? undefined,
    dueAt: parsed.dueAt ?? undefined,
    notes: parsed.notes ?? undefined,
  });
  if (!updated) {
    return jsonError(404, { code: "not_found", message: "Task not found." });
  }
  return jsonOk(updated);
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();
  const existing = await getTask(db, owner.id, id);
  if (!existing) {
    return jsonError(404, { code: "not_found", message: "Task not found." });
  }
  await deleteTask(db, owner.id, id);
  return new Response(null, { status: 204 });
});
