import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  archiveLead,
  createLead,
  findLeadByDomain,
  findLeadByNameAndCity,
  listLeads,
  type LeadFilter,
  type LeadSortKey,
} from "@/lib/db/repos";
import { normalizeDomain, normalizeName } from "@/lib/db/normalize";
import { requireOwner } from "@/lib/auth/session";
import {
  jsonCreated,
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../_lib/response";
import {
  businessNameSchema,
  citySchema,
  emailSchema,
  nicheSchema,
  phoneSchema,
  pipelineStageSchema,
  websiteConditionSchema,
  websiteUrlSchema,
} from "../_lib/schemas";

/**
 * GET /api/leads — list leads for the authenticated owner.
 * Supports URL params: q, niche, city, stage, condition, source, minScore,
 * maxScore, sort.
 */
export const GET = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  const db = await getDb();

  const url = new URL(req.url);
  const p = url.searchParams;
  const sort = (p.get("sort") as LeadSortKey) || "score";
  const filter: LeadFilter = {
    q: p.get("q") ?? undefined,
    niche: p.get("niche") ?? undefined,
    city: p.get("city") ?? undefined,
    stage:
      (p.get("stage") as LeadFilter["stage"]) ?? undefined,
    condition:
      (p.get("condition") as LeadFilter["condition"]) ?? undefined,
    source: p.get("source") ?? undefined,
    minScore: p.get("minScore") ? Number(p.get("minScore")) : undefined,
    maxScore: p.get("maxScore") ? Number(p.get("maxScore")) : undefined,
  };

  const items = await listLeads(db, owner.id, filter, sort);
  return jsonOk({ items });
});

const createLeadSchema = z.object({
  businessName: businessNameSchema,
  niche: nicheSchema,
  city: citySchema,
  category: z.string().trim().max(120).optional().default(""),
  websiteUrl: websiteUrlSchema,
  publicEmail: emailSchema,
  publicPhone: phoneSchema,
  address: z.string().trim().max(400).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(80).optional().default("India"),
  sourceName: z.string().trim().min(1).max(60).default("manual"),
  sourceUrl: z.string().trim().url().max(2000).optional().nullable(),
  websiteCondition: websiteConditionSchema.optional(),
  pipelineStage: pipelineStageSchema.optional(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

/**
 * POST /api/leads — create a new lead with dedup.
 * - If a lead with the same canonicalized domain exists for this owner, 409.
 * - If a lead with the same normalized name + city exists, 409.
 */
export const POST = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  const db = await getDb();

  const parsed = await parseJson(req, createLeadSchema);
  if (parsed instanceof Response) return parsed;

  // Dedup checks — spec §8 (deduplication) + §13 (idempotency where practical).
  const normalizedDomain = normalizeDomain(parsed.websiteUrl ?? undefined);
  if (normalizedDomain) {
    const existing = await findLeadByDomain(db, owner.id, normalizedDomain);
    if (existing) {
      return jsonError(409, {
        code: "duplicate_lead",
        message: "A lead with this website already exists.",
        details: { conflictLeadId: existing.id, matchedOn: "normalized_domain" },
      });
    }
  }
  const normalizedNameValue = normalizeName(parsed.businessName);
  const existingByName = await findLeadByNameAndCity(
    db,
    owner.id,
    normalizedNameValue,
    parsed.city
  );
  if (existingByName) {
    return jsonError(409, {
      code: "duplicate_lead",
      message: "A lead with the same name already exists in this city.",
      details: {
        conflictLeadId: existingByName.id,
        matchedOn: "normalized_name_city",
      },
    });
  }

  const created = await createLead(db, owner.id, {
    businessName: parsed.businessName,
    category: parsed.category,
    niche: parsed.niche,
    websiteUrl: parsed.websiteUrl ?? undefined,
    publicEmail: parsed.publicEmail ?? undefined,
    publicPhone: parsed.publicPhone ?? undefined,
    address: parsed.address ?? undefined,
    city: parsed.city,
    region: parsed.region ?? undefined,
    country: parsed.country ?? "India",
    sourceName: parsed.sourceName ?? "manual",
    sourceUrl: parsed.sourceUrl ?? undefined,
    websiteCondition: parsed.websiteCondition,
    pipelineStage: parsed.pipelineStage,
    tags: parsed.tags,
  });

  return jsonCreated(created);
});

// Explicit unused marker to keep lint quiet when callers don't need `archiveLead`
void archiveLead;
