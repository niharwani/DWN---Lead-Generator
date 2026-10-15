import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { createCampaign, listCampaigns } from "@/lib/db/repos";
import {
  jsonCreated,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../_lib/response";
import { campaignStatusSchema, nicheSchema } from "../_lib/schemas";

export const GET = withErrorHandling(async () => {
  const owner = await requireOwner();
  const db = await getDb();
  const items = await listCampaigns(db, owner.id);
  return jsonOk({ items });
});

const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  status: campaignStatusSchema.optional(),
  niche: nicheSchema,
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

export const POST = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  const db = await getDb();
  const parsed = await parseJson(req, createCampaignSchema);
  if (parsed instanceof Response) return parsed;
  const created = await createCampaign(db, owner.id, parsed);
  return jsonCreated(created);
});
