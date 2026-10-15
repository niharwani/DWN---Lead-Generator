import { and, asc, count, desc, eq, gte, isNull, like, lte, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { leads, type NewLead } from "../schema";
import { normalizeDomain, normalizeName, normalizeUrl } from "../normalize";
import { rowToLead, scoreBreakdownToColumns } from "../adapt";
import type { Lead, PipelineStage, ScoreBreakdown, WebsiteCondition } from "@/lib/demo/types";

/**
 * Lead repository. Every function takes `ownerId` as its second argument and
 * every query filters by `owner_id`. Nothing in this file is callable without
 * an authenticated owner.
 */

export type LeadFilter = {
  q?: string;
  niche?: string;
  city?: string;
  stage?: PipelineStage;
  condition?: WebsiteCondition;
  campaignId?: string;
  minScore?: number;
  maxScore?: number;
  source?: string;
};

export type LeadSortKey = "score" | "updated" | "created" | "name";

export async function listLeads(
  db: Db,
  ownerId: string,
  filter: LeadFilter = {},
  sortKey: LeadSortKey = "score"
): Promise<Lead[]> {
  const conditions = [eq(leads.ownerId, ownerId), isNull(leads.archivedAt)];

  if (filter.q) {
    const q = `%${filter.q.trim().toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${leads.businessName})`, q),
        like(sql`lower(${leads.city})`, q),
        like(sql`lower(coalesce(${leads.websiteUrl}, ''))`, q),
        like(sql`lower(coalesce(${leads.publicEmail}, ''))`, q),
        like(sql`lower(${leads.niche})`, q)
      )!
    );
  }
  if (filter.niche) conditions.push(eq(leads.niche, filter.niche));
  if (filter.city) conditions.push(eq(leads.city, filter.city));
  if (filter.stage) conditions.push(eq(leads.pipelineStage, filter.stage));
  if (filter.condition) conditions.push(eq(leads.websiteCondition, filter.condition));
  if (filter.source) conditions.push(eq(leads.sourceName, filter.source));
  if (filter.minScore != null) conditions.push(gte(leads.fitScore, filter.minScore));
  if (filter.maxScore != null) conditions.push(lte(leads.fitScore, filter.maxScore));

  const order = (() => {
    switch (sortKey) {
      case "score":
        return [desc(leads.fitScore), desc(leads.updatedAt)];
      case "name":
        return [asc(leads.businessName)];
      case "created":
        return [desc(leads.createdAt)];
      case "updated":
      default:
        return [desc(leads.updatedAt)];
    }
  })();

  const rows = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(...order);
  return rows.map(rowToLead);
}

export async function getLead(
  db: Db,
  ownerId: string,
  id: string
): Promise<Lead | undefined> {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), eq(leads.id, id)))
    .limit(1);
  return row ? rowToLead(row) : undefined;
}

/** Dedup lookup by canonical domain. Owner-scoped. */
export async function findLeadByDomain(
  db: Db,
  ownerId: string,
  domain: string
): Promise<Lead | undefined> {
  const [row] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        eq(leads.normalizedDomain, domain),
        isNull(leads.archivedAt)
      )
    )
    .limit(1);
  return row ? rowToLead(row) : undefined;
}

/** Dedup lookup by (normalized name, city). Owner-scoped. */
export async function findLeadByNameAndCity(
  db: Db,
  ownerId: string,
  normalizedNameValue: string,
  city: string
): Promise<Lead | undefined> {
  const [row] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        eq(leads.normalizedName, normalizedNameValue),
        eq(leads.city, city),
        isNull(leads.archivedAt)
      )
    )
    .limit(1);
  return row ? rowToLead(row) : undefined;
}

export type CreateLeadInput = {
  id?: string;
  businessName: string;
  category?: string;
  niche: string;
  websiteUrl?: string;
  publicEmail?: string;
  publicPhone?: string;
  address?: string;
  city: string;
  region?: string;
  country?: string;
  sourceName: string;
  sourceUrl?: string;
  sourceExternalId?: string;
  sourceLastCheckedAt?: string;
  websiteCondition?: WebsiteCondition;
  pipelineStage?: PipelineStage;
  score?: ScoreBreakdown;
  tags?: string[];
  notes?: string;
  currency?: string;
  nextActionAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function createLead(
  db: Db,
  ownerId: string,
  input: CreateLeadInput
): Promise<Lead> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const canonicalUrl = normalizeUrl(input.websiteUrl);
  const canonicalDomain = normalizeDomain(input.websiteUrl);
  const normalizedNameValue = normalizeName(input.businessName);

  const base: NewLead = {
    id,
    ownerId,
    businessName: input.businessName,
    normalizedName: normalizedNameValue,
    category: input.category ?? "",
    niche: input.niche,
    websiteUrl: canonicalUrl,
    normalizedDomain: canonicalDomain,
    publicEmail: input.publicEmail ?? null,
    publicPhone: input.publicPhone ?? null,
    address: input.address ?? null,
    city: input.city,
    region: input.region ?? null,
    country: input.country ?? "India",
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl ?? null,
    sourceExternalId: input.sourceExternalId ?? null,
    sourceLastCheckedAt: input.sourceLastCheckedAt ?? null,
    websiteCondition: input.websiteCondition ?? "unknown",
    pipelineStage: input.pipelineStage ?? "new",
    currency: input.currency ?? "INR",
    tags: input.tags ?? [],
    doNotContact: false,
    nextActionAt: input.nextActionAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };

  const scoreColumns = input.score
    ? scoreBreakdownToColumns(input.score)
    : {};

  await db.insert(leads).values({ ...base, ...scoreColumns });
  const created = await getLead(db, ownerId, id);
  if (!created) throw new Error("Failed to read back created lead");
  return created;
}

export type UpdateLeadInput = Partial<
  Omit<CreateLeadInput, "sourceName" | "sourceExternalId">
> & {
  pipelineStage?: PipelineStage;
  estimatedDealValue?: number;
  lossReason?: string;
  lastContactedAt?: string;
  lastAuditedAt?: string;
  previousWebsiteCondition?: WebsiteCondition;
  doNotContactReason?: string;
  flagDoNotContact?: boolean;
};

export async function updateLead(
  db: Db,
  ownerId: string,
  id: string,
  patch: UpdateLeadInput
): Promise<Lead | undefined> {
  const existing = await getLead(db, ownerId, id);
  if (!existing) return undefined;

  const update: Partial<NewLead> = {
    updatedAt: new Date().toISOString(),
  };

  if (patch.businessName != null) {
    update.businessName = patch.businessName;
    update.normalizedName = normalizeName(patch.businessName);
  }
  if (patch.category != null) update.category = patch.category;
  if (patch.niche != null) update.niche = patch.niche;
  if (patch.websiteUrl !== undefined) {
    update.websiteUrl = normalizeUrl(patch.websiteUrl);
    update.normalizedDomain = normalizeDomain(patch.websiteUrl);
  }
  if (patch.publicEmail !== undefined) update.publicEmail = patch.publicEmail ?? null;
  if (patch.publicPhone !== undefined) update.publicPhone = patch.publicPhone ?? null;
  if (patch.address !== undefined) update.address = patch.address ?? null;
  if (patch.city != null) update.city = patch.city;
  if (patch.region !== undefined) update.region = patch.region ?? null;
  if (patch.country != null) update.country = patch.country;
  if (patch.websiteCondition != null) update.websiteCondition = patch.websiteCondition;
  if (patch.pipelineStage != null) update.pipelineStage = patch.pipelineStage;
  if (patch.estimatedDealValue !== undefined) update.estimatedDealValue = patch.estimatedDealValue;
  if (patch.lossReason !== undefined) update.lossReason = patch.lossReason ?? null;
  if (patch.lastContactedAt !== undefined) update.lastContactedAt = patch.lastContactedAt;
  if (patch.lastAuditedAt !== undefined) update.lastAuditedAt = patch.lastAuditedAt;
  if (patch.previousWebsiteCondition !== undefined) {
    update.previousWebsiteCondition = patch.previousWebsiteCondition;
  }
  if (patch.nextActionAt !== undefined) update.nextActionAt = patch.nextActionAt ?? null;
  if (patch.tags != null) update.tags = patch.tags;
  if (patch.score) Object.assign(update, scoreBreakdownToColumns(patch.score));
  if (patch.flagDoNotContact !== undefined) {
    update.doNotContact = patch.flagDoNotContact;
    update.doNotContactReason = patch.flagDoNotContact ? patch.doNotContactReason ?? null : null;
    update.doNotContactAt = patch.flagDoNotContact ? new Date().toISOString() : null;
  }

  await db
    .update(leads)
    .set(update)
    .where(and(eq(leads.ownerId, ownerId), eq(leads.id, id)));
  return await getLead(db, ownerId, id);
}

export async function archiveLead(
  db: Db,
  ownerId: string,
  id: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(leads)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(leads.ownerId, ownerId), eq(leads.id, id)));
  return (result as unknown as { meta?: { changes?: number } }).meta?.changes != null
    ? (result as unknown as { meta: { changes: number } }).meta.changes > 0
    : true;
}

export async function listDistinctNiches(
  db: Db,
  ownerId: string
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ niche: leads.niche })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)));
  return rows.map((r) => r.niche).sort();
}

export async function listDistinctCities(
  db: Db,
  ownerId: string
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: leads.city })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)));
  return rows.map((r) => r.city).filter(Boolean).sort();
}

export async function countOwnerLeads(
  db: Db,
  ownerId: string
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)));
  return row?.c ?? 0;
}
