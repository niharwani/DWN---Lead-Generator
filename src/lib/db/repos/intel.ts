/**
 * Web Intelligence repository — owner-scoped operations against
 * crawl_jobs, crawl_pages, and extracted_people.
 *
 * Every function takes (db, ownerId, ...) and filters at the SQL layer.
 * extracted_people joins through leads for owner enforcement so a leaked
 * leadId cannot read a person belonging to another owner.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  crawlJobs,
  crawlPages,
  extractedPeople,
  leads,
  type CrawlJob,
  type CrawlPage,
  type ExtractedPerson,
  type NewCrawlJob,
  type NewCrawlPage,
  type NewExtractedPerson,
} from "../schema";
import { normalizeName } from "../normalize";

/* ------------------------------------------------------------------
 * crawl_jobs
 * ------------------------------------------------------------------ */

export async function createCrawlJob(
  db: Db,
  ownerId: string,
  input: Omit<NewCrawlJob, "id" | "ownerId"> & { id?: string }
): Promise<CrawlJob> {
  const id = input.id ?? crypto.randomUUID();
  await db.insert(crawlJobs).values({ ...input, id, ownerId });
  const [row] = await db
    .select()
    .from(crawlJobs)
    .where(and(eq(crawlJobs.ownerId, ownerId), eq(crawlJobs.id, id)))
    .limit(1);
  if (!row) throw new Error("Failed to read back created crawl job");
  return row;
}

export type CrawlJobPatch = Partial<{
  status: CrawlJob["status"];
  pagesFetched: number;
  pagesFailed: number;
  peopleFound: number;
  findingsCount: number;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string;
  leadId: string | null;
}>;

export async function updateCrawlJob(
  db: Db,
  ownerId: string,
  id: string,
  patch: CrawlJobPatch
): Promise<CrawlJob | undefined> {
  const update: Partial<NewCrawlJob> = {};
  if (patch.status != null) update.status = patch.status;
  if (patch.pagesFetched != null) update.pagesFetched = patch.pagesFetched;
  if (patch.pagesFailed != null) update.pagesFailed = patch.pagesFailed;
  if (patch.peopleFound != null) update.peopleFound = patch.peopleFound;
  if (patch.findingsCount != null) update.findingsCount = patch.findingsCount;
  if (patch.errorSummary !== undefined)
    update.errorSummary = patch.errorSummary ?? null;
  if (patch.startedAt != null) update.startedAt = patch.startedAt;
  if (patch.completedAt != null) update.completedAt = patch.completedAt;
  if (patch.leadId !== undefined) update.leadId = patch.leadId;

  await db
    .update(crawlJobs)
    .set(update)
    .where(and(eq(crawlJobs.ownerId, ownerId), eq(crawlJobs.id, id)));

  const [row] = await db
    .select()
    .from(crawlJobs)
    .where(and(eq(crawlJobs.ownerId, ownerId), eq(crawlJobs.id, id)))
    .limit(1);
  return row;
}

export async function listCrawlJobs(
  db: Db,
  ownerId: string,
  limit = 50
): Promise<CrawlJob[]> {
  const rows = await db
    .select()
    .from(crawlJobs)
    .where(eq(crawlJobs.ownerId, ownerId))
    .orderBy(desc(crawlJobs.createdAt))
    .limit(limit);
  return rows;
}

export async function getCrawlJob(
  db: Db,
  ownerId: string,
  id: string
): Promise<CrawlJob | undefined> {
  const [row] = await db
    .select()
    .from(crawlJobs)
    .where(and(eq(crawlJobs.ownerId, ownerId), eq(crawlJobs.id, id)))
    .limit(1);
  return row;
}

export async function cancelCrawlJob(
  db: Db,
  ownerId: string,
  id: string
): Promise<void> {
  await db
    .update(crawlJobs)
    .set({
      status: "cancelled",
      completedAt: new Date().toISOString(),
    })
    .where(and(eq(crawlJobs.ownerId, ownerId), eq(crawlJobs.id, id)));
}

/* ------------------------------------------------------------------
 * crawl_pages
 * ------------------------------------------------------------------ */

export async function createCrawlPage(
  db: Db,
  ownerId: string,
  jobId: string,
  input: Omit<NewCrawlPage, "id" | "jobId">
): Promise<CrawlPage> {
  // owner enforcement — the job must belong to the caller.
  const job = await getCrawlJob(db, ownerId, jobId);
  if (!job) throw new Error("crawl job not found for owner");
  const id = crypto.randomUUID();
  const row: NewCrawlPage = {
    ...input,
    id,
    jobId,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
  };
  // crawl_pages has a unique index on (job_id, url) — swallow duplicate inserts.
  try {
    await db.insert(crawlPages).values(row);
  } catch {
    // unique conflict means we already recorded this URL in this job
  }
  const [stored] = await db
    .select()
    .from(crawlPages)
    .where(and(eq(crawlPages.jobId, jobId), eq(crawlPages.url, input.url)))
    .limit(1);
  if (!stored) throw new Error("Failed to read back created crawl page");
  return stored;
}

export async function listCrawlPages(
  db: Db,
  ownerId: string,
  jobId: string
): Promise<CrawlPage[]> {
  const job = await getCrawlJob(db, ownerId, jobId);
  if (!job) return [];
  const rows = await db
    .select()
    .from(crawlPages)
    .where(eq(crawlPages.jobId, jobId))
    .orderBy(crawlPages.depth, crawlPages.createdAt);
  return rows;
}

/* ------------------------------------------------------------------
 * extracted_people
 * ------------------------------------------------------------------ */

export async function upsertPerson(
  db: Db,
  ownerId: string,
  input: Omit<NewExtractedPerson, "id" | "normalizedName" | "ownerId"> & {
    id?: string;
  }
): Promise<ExtractedPerson> {
  // owner enforcement via join on leads
  const [owned] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), eq(leads.id, input.leadId)))
    .limit(1);
  if (!owned) throw new Error("lead not found for owner");

  const normalized = normalizeName(input.fullName);

  // Look up existing — unique index is (leadId, normalizedName)
  const [existing] = await db
    .select()
    .from(extractedPeople)
    .where(
      and(
        eq(extractedPeople.leadId, input.leadId),
        eq(extractedPeople.normalizedName, normalized)
      )
    )
    .limit(1);

  if (existing) {
    // Only overwrite blanks with newer observations; preserve higher-confidence values.
    const confidenceRank: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const nextConf = confidenceRank[input.confidence ?? "medium"] ?? 2;
    const prevConf = confidenceRank[existing.confidence] ?? 2;
    const update: Partial<NewExtractedPerson> = {
      jobTitle: existing.jobTitle ?? input.jobTitle,
      profileUrl: existing.profileUrl ?? input.profileUrl,
      sourceUrl: nextConf >= prevConf ? input.sourceUrl : existing.sourceUrl,
      evidence: existing.evidence ?? input.evidence,
      confidence: nextConf > prevConf ? (input.confidence ?? existing.confidence) : existing.confidence,
      observedAt: new Date().toISOString(),
    };
    await db.update(extractedPeople).set(update).where(eq(extractedPeople.id, existing.id));
    const [refreshed] = await db
      .select()
      .from(extractedPeople)
      .where(eq(extractedPeople.id, existing.id))
      .limit(1);
    return refreshed ?? existing;
  }

  const id = input.id ?? crypto.randomUUID();
  await db.insert(extractedPeople).values({
    ...input,
    id,
    ownerId,
    normalizedName: normalized,
  });
  const [row] = await db
    .select()
    .from(extractedPeople)
    .where(eq(extractedPeople.id, id))
    .limit(1);
  if (!row) throw new Error("Failed to read back created person");
  return row;
}

export async function listPeopleForLead(
  db: Db,
  ownerId: string,
  leadId: string
): Promise<ExtractedPerson[]> {
  const rows = await db
    .select()
    .from(extractedPeople)
    .where(
      and(eq(extractedPeople.ownerId, ownerId), eq(extractedPeople.leadId, leadId))
    )
    .orderBy(desc(extractedPeople.observedAt));
  return rows;
}

export async function countPeopleForLead(
  db: Db,
  ownerId: string,
  leadId: string
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(extractedPeople)
    .where(
      and(eq(extractedPeople.ownerId, ownerId), eq(extractedPeople.leadId, leadId))
    );
  return row?.n ?? 0;
}
