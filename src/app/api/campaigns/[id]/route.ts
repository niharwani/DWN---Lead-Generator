import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { getCampaign, updateCampaign } from "@/lib/db/repos";
import {
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../../_lib/response";
import { campaignStatusSchema, nicheSchema } from "../../_lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();
  const campaign = await getCampaign(db, owner.id, id);
  if (!campaign) {
    return jsonError(404, { code: "not_found", message: "Campaign not found." });
  }
  return jsonOk(campaign);
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: campaignStatusSchema.optional(),
  niche: nicheSchema.optional(),
  geography: z
    .object({
      city: z.string().trim().max(120).optional(),
      region: z.string().trim().max(120).optional(),
      country: z.string().trim().max(80).optional(),
    })
    .optional(),
  idealCustomerDescription: z.string().trim().max(2000).optional(),
  offer: z.string().trim().max(500).optional(),
  valueProposition: z.string().trim().max(2000).optional(),
  caseStudyUrl: z.string().trim().url().max(2000).optional(),
  minimumScore: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const PATCH = withErrorHandling(async (req, ctx) => {
  const { params } = ctx as RouteContext;
  const { id } = await params;
  const owner = await requireOwner();
  const db = await getDb();

  const parsed = await parseJson(req, patchSchema);
  if (parsed instanceof Response) return parsed;

  const updated = await updateCampaign(db, owner.id, id, parsed);
  if (!updated) {
    return jsonError(404, { code: "not_found", message: "Campaign not found." });
  }
  return jsonOk(updated);
});
