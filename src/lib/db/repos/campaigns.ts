import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { rowToCampaign, rowToLead } from "../adapt";
import {
  campaignLeads,
  campaigns,
  leads,
  outreachDrafts,
  type NewCampaign,
} from "../schema";
import type { Campaign, CampaignStatus, Lead } from "@/lib/demo/types";

export async function listCampaigns(db: Db, ownerId: string): Promise<Campaign[]> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.ownerId, ownerId))
    .orderBy(desc(campaigns.updatedAt));
  return rows.map(rowToCampaign);
}

export async function getCampaign(
  db: Db,
  ownerId: string,
  id: string
): Promise<Campaign | undefined> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.ownerId, ownerId), eq(campaigns.id, id)))
    .limit(1);
  return row ? rowToCampaign(row) : undefined;
}

/** Expand campaign → leads using explicit junction rows + niche-fallback. */
export async function listLeadsByCampaign(
  db: Db,
  ownerId: string,
  campaignId: string
): Promise<Lead[]> {
  const campaign = await getCampaign(db, ownerId, campaignId);
  if (!campaign) return [];

  const junction = await db
    .select({ leadId: campaignLeads.leadId })
    .from(campaignLeads)
    .where(eq(campaignLeads.campaignId, campaignId));
  const junctionIds = junction.map((j) => j.leadId);

  const explicit = junctionIds.length
    ? await db
        .select()
        .from(leads)
        .where(and(eq(leads.ownerId, ownerId), inArray(leads.id, junctionIds)))
    : [];

  // Union with niche-matched leads so Phase 1 associations still render while
  // Phase 3 fills in the explicit junction.
  const nicheMatches = await db
    .select()
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), eq(leads.niche, campaign.niche)));

  const map = new Map<string, (typeof explicit)[number]>();
  for (const row of [...explicit, ...nicheMatches]) map.set(row.id, row);
  return [...map.values()]
    .filter((row) => !row.archivedAt)
    .map(rowToLead);
}

export type CampaignMetrics = {
  discovered: number;
  qualified: number;
  draftsPrepared: number;
  contacted: number;
  replies: number;
  meetings: number;
  wins: number;
};

export async function getCampaignMetrics(
  db: Db,
  ownerId: string,
  campaignId: string
): Promise<CampaignMetrics> {
  const campaignLeadRows = await listLeadsByCampaign(db, ownerId, campaignId);
  const draftRows = await db
    .select({
      status: outreachDrafts.status,
    })
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.ownerId, ownerId),
        eq(outreachDrafts.campaignId, campaignId)
      )
    );

  const draftsPrepared = draftRows.length;
  const contacted = draftRows.filter((d) =>
    ["contacted", "replied", "approved"].includes(d.status)
  ).length;
  const replies = draftRows.filter((d) => d.status === "replied").length;

  return {
    discovered: campaignLeadRows.length,
    qualified: campaignLeadRows.filter((l) =>
      [
        "qualified",
        "contacted",
        "replied",
        "meeting_booked",
        "proposal_sent",
        "won",
      ].includes(l.pipelineStage)
    ).length,
    draftsPrepared,
    contacted,
    replies,
    meetings: campaignLeadRows.filter((l) =>
      ["meeting_booked", "proposal_sent", "won"].includes(l.pipelineStage)
    ).length,
    wins: campaignLeadRows.filter((l) => l.pipelineStage === "won").length,
  };
}

export type CreateCampaignInput = {
  id?: string;
  name: string;
  status?: CampaignStatus;
  niche: string;
  geography?: { city?: string; region?: string; country?: string };
  idealCustomerDescription?: string;
  offer?: string;
  valueProposition?: string;
  caseStudyUrl?: string;
  minimumScore?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function createCampaign(
  db: Db,
  ownerId: string,
  input: CreateCampaignInput
): Promise<Campaign> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const row: NewCampaign = {
    id,
    ownerId,
    name: input.name,
    status: input.status ?? "draft",
    niche: input.niche,
    geography: input.geography ?? null,
    idealCustomerDescription: input.idealCustomerDescription ?? "",
    offer: input.offer ?? "",
    valueProposition: input.valueProposition ?? "",
    caseStudyUrl: input.caseStudyUrl ?? null,
    minimumScore: input.minimumScore ?? 60,
    notes: input.notes ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  await db.insert(campaigns).values(row);
  const created = await getCampaign(db, ownerId, id);
  if (!created) throw new Error("Failed to read back created campaign");
  return created;
}

export async function updateCampaign(
  db: Db,
  ownerId: string,
  id: string,
  patch: Partial<CreateCampaignInput>
): Promise<Campaign | undefined> {
  const update: Partial<NewCampaign> = { updatedAt: new Date().toISOString() };
  if (patch.name != null) update.name = patch.name;
  if (patch.status != null) update.status = patch.status;
  if (patch.niche != null) update.niche = patch.niche;
  if (patch.geography !== undefined) update.geography = patch.geography ?? null;
  if (patch.idealCustomerDescription != null)
    update.idealCustomerDescription = patch.idealCustomerDescription;
  if (patch.offer != null) update.offer = patch.offer;
  if (patch.valueProposition != null) update.valueProposition = patch.valueProposition;
  if (patch.caseStudyUrl !== undefined) update.caseStudyUrl = patch.caseStudyUrl ?? null;
  if (patch.minimumScore != null) update.minimumScore = patch.minimumScore;
  if (patch.notes !== undefined) update.notes = patch.notes ?? null;

  await db
    .update(campaigns)
    .set(update)
    .where(and(eq(campaigns.ownerId, ownerId), eq(campaigns.id, id)));
  return await getCampaign(db, ownerId, id);
}

/** Create or update a (campaign, lead) association. */
export async function assignLeadToCampaign(
  db: Db,
  ownerId: string,
  campaignId: string,
  leadId: string
): Promise<void> {
  // Verify both belong to this owner before linking (defense in depth).
  const [[c], [l]] = await Promise.all([
    db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.ownerId, ownerId), eq(campaigns.id, campaignId)))
      .limit(1),
    db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.ownerId, ownerId), eq(leads.id, leadId)))
      .limit(1),
  ]);
  if (!c || !l) {
    throw new Error("campaign or lead not found for owner");
  }
  await db
    .insert(campaignLeads)
    .values({ campaignId, leadId })
    .onConflictDoNothing();
}

/** Delete a campaign-lead junction. */
export async function unassignLeadFromCampaign(
  db: Db,
  ownerId: string,
  campaignId: string,
  leadId: string
): Promise<void> {
  // Verify ownership of the campaign (lead ownership follows naturally).
  const [[c]] = await Promise.all([
    db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.ownerId, ownerId), eq(campaigns.id, campaignId)))
      .limit(1),
  ]);
  if (!c) throw new Error("campaign not found for owner");
  await db
    .delete(campaignLeads)
    .where(
      and(
        eq(campaignLeads.campaignId, campaignId),
        eq(campaignLeads.leadId, leadId)
      )
    );
}

/** Overview helper: top campaigns ranked by qualified count. */
export async function listBestCampaigns(
  db: Db,
  ownerId: string
): Promise<
  Array<{ campaign: Campaign; metrics: CampaignMetrics }>
> {
  const list = await listCampaigns(db, ownerId);
  const active = list.filter(
    (c) => c.status === "active" || c.status === "completed"
  );
  const withMetrics = await Promise.all(
    active.map(async (campaign) => ({
      campaign,
      metrics: await getCampaignMetrics(db, ownerId, campaign.id),
    }))
  );
  withMetrics.sort((a, b) => b.metrics.qualified - a.metrics.qualified);
  return withMetrics;
}

// unused helper placeholder to avoid noise during Phase 2
void sql;
