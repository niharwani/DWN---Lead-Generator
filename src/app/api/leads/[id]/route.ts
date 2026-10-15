import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import {
  archiveLead,
  getLead,
  updateLead,
} from "@/lib/db/repos";
import {
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../../_lib/response";
import {
  businessNameSchema,
  citySchema,
  emailSchema,
  nicheSchema,
  phoneSchema,
  pipelineStageSchema,
  websiteConditionSchema,
  websiteUrlSchema,
} from "../../_lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();

  const lead = await getLead(db, owner.id, id);
  if (!lead) {
    return jsonError(404, { code: "not_found", message: "Lead not found." });
  }
  return jsonOk(lead);
});

const patchSchema = z.object({
  businessName: businessNameSchema.optional(),
  category: z.string().trim().max(120).optional(),
  niche: nicheSchema.optional(),
  websiteUrl: websiteUrlSchema,
  publicEmail: emailSchema,
  publicPhone: phoneSchema,
  address: z.string().trim().max(400).optional().nullable(),
  city: citySchema.optional(),
  region: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(80).optional(),
  websiteCondition: websiteConditionSchema.optional(),
  pipelineStage: pipelineStageSchema.optional(),
  estimatedDealValue: z.number().int().min(0).optional(),
  lossReason: z.string().trim().max(1000).optional().nullable(),
  nextActionAt: z.string().datetime().optional().nullable(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
  flagDoNotContact: z.boolean().optional(),
  doNotContactReason: z.string().trim().max(400).optional(),
});

export const PATCH = withErrorHandling(async (req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();

  const parsed = await parseJson(req, patchSchema);
  if (parsed instanceof Response) return parsed;

  // Coerce `null` to `undefined` so clearing a column shows up as "no change"
  // on the repo side (the repo distinguishes undefined=skip vs null=clear via
  // `!== undefined` checks). Null-clearing lands in a dedicated endpoint if we
  // need it later.
  const updated = await updateLead(db, owner.id, id, {
    ...parsed,
    websiteUrl: parsed.websiteUrl ?? undefined,
    publicEmail: parsed.publicEmail ?? undefined,
    publicPhone: parsed.publicPhone ?? undefined,
    address: parsed.address ?? undefined,
    region: parsed.region ?? undefined,
    lossReason: parsed.lossReason ?? undefined,
    nextActionAt: parsed.nextActionAt ?? undefined,
  });
  if (!updated) {
    return jsonError(404, { code: "not_found", message: "Lead not found." });
  }
  return jsonOk(updated);
});

/**
 * DELETE /api/leads/:id — archive (soft delete). Spec §13 says archive OR
 * delete per product rules; we archive so pipeline history stays intact.
 */
export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();

  const existing = await getLead(db, owner.id, id);
  if (!existing) {
    return jsonError(404, { code: "not_found", message: "Lead not found." });
  }
  await archiveLead(db, owner.id, id);
  return new Response(null, { status: 204 });
});
