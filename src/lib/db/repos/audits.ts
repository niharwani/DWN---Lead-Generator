import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { rowToAudit } from "../adapt";
import { leads, websiteAudits, type NewWebsiteAudit } from "../schema";
import type { WebsiteAudit } from "@/lib/demo/types";

/**
 * Audits are owned transitively through their lead. The queries join through
 * `leads` to filter by `owner_id` so an audit can never be read by the wrong
 * owner even if a lead ID leaks.
 */

export async function listAuditsForLead(
  db: Db,
  ownerId: string,
  leadId: string
): Promise<WebsiteAudit[]> {
  const rows = await db
    .select({
      id: websiteAudits.id,
      leadId: websiteAudits.leadId,
      requestedUrl: websiteAudits.requestedUrl,
      finalUrl: websiteAudits.finalUrl,
      status: websiteAudits.status,
      httpStatus: websiteAudits.httpStatus,
      auditVersion: websiteAudits.auditVersion,
      findings: websiteAudits.findings,
      metrics: websiteAudits.metrics,
      errorCategory: websiteAudits.errorCategory,
      startedAt: websiteAudits.startedAt,
      completedAt: websiteAudits.completedAt,
    })
    .from(websiteAudits)
    .innerJoin(leads, eq(leads.id, websiteAudits.leadId))
    .where(
      and(eq(leads.ownerId, ownerId), eq(websiteAudits.leadId, leadId))
    )
    .orderBy(desc(websiteAudits.startedAt));
  return rows.map(rowToAudit);
}

export async function getLatestAudit(
  db: Db,
  ownerId: string,
  leadId: string
): Promise<WebsiteAudit | undefined> {
  const [row] = await listAuditsForLead(db, ownerId, leadId);
  return row;
}

export type CreateAuditInput = Omit<NewWebsiteAudit, "id"> & { id?: string };

export async function createAudit(
  db: Db,
  ownerId: string,
  input: CreateAuditInput
): Promise<WebsiteAudit> {
  // Owner check — refuse to attach an audit to a lead the caller doesn't own.
  const [leadRow] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), eq(leads.id, input.leadId)))
    .limit(1);
  if (!leadRow) throw new Error("lead not found for owner");

  const id = input.id ?? crypto.randomUUID();
  const row: NewWebsiteAudit = { ...input, id };
  await db.insert(websiteAudits).values(row);
  const [stored] = await db
    .select()
    .from(websiteAudits)
    .where(eq(websiteAudits.id, id))
    .limit(1);
  if (!stored) throw new Error("Failed to read back created audit");
  return rowToAudit(stored);
}
