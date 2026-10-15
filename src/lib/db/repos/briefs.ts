import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { rowToBrief } from "../adapt";
import { leads, opportunityBriefs, type NewOpportunityBrief } from "../schema";
import type { OpportunityBrief } from "@/lib/demo/types";

export async function listBriefsForLead(
  db: Db,
  ownerId: string,
  leadId: string
): Promise<OpportunityBrief[]> {
  const rows = await db
    .select({
      id: opportunityBriefs.id,
      leadId: opportunityBriefs.leadId,
      campaignId: opportunityBriefs.campaignId,
      summary: opportunityBriefs.summary,
      observations: opportunityBriefs.observations,
      possibleOpportunity: opportunityBriefs.possibleOpportunity,
      recommendedService: opportunityBriefs.recommendedService,
      suggestedDeliverable: opportunityBriefs.suggestedDeliverable,
      confidence: opportunityBriefs.confidence,
      unknowns: opportunityBriefs.unknowns,
      source: opportunityBriefs.source,
      modelMetadata: opportunityBriefs.modelMetadata,
      createdAt: opportunityBriefs.createdAt,
    })
    .from(opportunityBriefs)
    .innerJoin(leads, eq(leads.id, opportunityBriefs.leadId))
    .where(
      and(eq(leads.ownerId, ownerId), eq(opportunityBriefs.leadId, leadId))
    )
    .orderBy(desc(opportunityBriefs.createdAt));
  return rows.map(rowToBrief);
}

export async function getLatestBrief(
  db: Db,
  ownerId: string,
  leadId: string
): Promise<OpportunityBrief | undefined> {
  const [row] = await listBriefsForLead(db, ownerId, leadId);
  return row;
}

export type CreateBriefInput = Omit<NewOpportunityBrief, "id"> & { id?: string };

export async function createBrief(
  db: Db,
  ownerId: string,
  input: CreateBriefInput
): Promise<OpportunityBrief> {
  const [leadRow] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), eq(leads.id, input.leadId)))
    .limit(1);
  if (!leadRow) throw new Error("lead not found for owner");

  const id = input.id ?? crypto.randomUUID();
  const row: NewOpportunityBrief = { ...input, id };
  await db.insert(opportunityBriefs).values(row);
  const [stored] = await db
    .select()
    .from(opportunityBriefs)
    .where(eq(opportunityBriefs.id, id))
    .limit(1);
  if (!stored) throw new Error("Failed to read back created brief");
  return rowToBrief(stored);
}
