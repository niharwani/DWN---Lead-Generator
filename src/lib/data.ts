/**
 * Server-component data facade.
 *
 * Pages import from here instead of calling `requireOwner` + `getDb` +
 * `repos/*` directly. Every function enforces owner auth and returns the
 * same view-model types that Phase 1 pages were already using, so page code
 * only needs an import swap and an `await`.
 *
 * In Phase 1 we had `src/lib/demo` as the data source. The function names
 * here are intentionally similar so grep-and-replace is straightforward.
 */

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getOwner, type Owner } from "@/lib/auth/session";
import * as repos from "@/lib/db/repos";
import type {
  CampaignStatus,
  Lead,
  OutreachStatus,
  PipelineStage,
  WebsiteCondition,
} from "@/lib/demo/types";
import type { LeadFilter, LeadSortKey } from "@/lib/db/repos";
import type { CampaignMetrics } from "@/lib/db/repos";

/**
 * Server-component auth gate. Returns the owner or redirects to /login.
 * Previously used notFound() because Cloudflare Access gated at the edge;
 * Access was removed on 2026-10-20, so the app now handles the redirect.
 */
export async function requirePageOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  return owner;
}

export type { LeadFilter, LeadSortKey } from "@/lib/db/repos";
export type { CampaignStatus, OutreachStatus, PipelineStage, WebsiteCondition };

/* -----------------------------------------------------------------
 * Leads
 * ----------------------------------------------------------------- */

export async function pageListLeads(
  filter: LeadFilter = {},
  sort: LeadSortKey = "score"
): Promise<Lead[]> {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listLeads(db, owner.id, filter, sort);
}

export async function pageGetLead(id: string): Promise<Lead | undefined> {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getLead(db, owner.id, id);
}

export async function pageDistinctNiches(): Promise<string[]> {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listDistinctNiches(db, owner.id);
}

export async function pageDistinctCities(): Promise<string[]> {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listDistinctCities(db, owner.id);
}

/* -----------------------------------------------------------------
 * Campaigns
 * ----------------------------------------------------------------- */

export async function pageListCampaigns() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listCampaigns(db, owner.id);
}

export async function pageGetCampaign(id: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getCampaign(db, owner.id, id);
}

export async function pageListLeadsByCampaign(campaignId: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listLeadsByCampaign(db, owner.id, campaignId);
}

export async function pageCampaignMetrics(
  campaignId: string
): Promise<CampaignMetrics> {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getCampaignMetrics(db, owner.id, campaignId);
}

export async function pageBestCampaigns() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listBestCampaigns(db, owner.id);
}

/* -----------------------------------------------------------------
 * Tasks
 * ----------------------------------------------------------------- */

export async function pageListTasks() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listTasks(db, owner.id);
}

/** Group tasks by overdue/today/this-week/upcoming/completed (page-side). */
export async function pageGroupedTasks(nowIso = new Date().toISOString()) {
  const tasks = await pageListTasks();
  const now = new Date(nowIso).getTime();
  const dayEnd = now + 24 * 60 * 60 * 1000;
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;

  const groups = {
    overdue: [] as typeof tasks,
    today: [] as typeof tasks,
    thisWeek: [] as typeof tasks,
    upcoming: [] as typeof tasks,
    completed: [] as typeof tasks,
  };
  for (const t of tasks) {
    if (t.status === "done" || t.status === "cancelled") {
      groups.completed.push(t);
      continue;
    }
    if (!t.dueAt) {
      groups.upcoming.push(t);
      continue;
    }
    const due = new Date(t.dueAt).getTime();
    if (due < now) groups.overdue.push(t);
    else if (due < dayEnd) groups.today.push(t);
    else if (due < weekEnd) groups.thisWeek.push(t);
    else groups.upcoming.push(t);
  }
  const byDue = (
    a: (typeof tasks)[number],
    b: (typeof tasks)[number]
  ) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9");
  groups.overdue.sort(byDue);
  groups.today.sort(byDue);
  groups.thisWeek.sort(byDue);
  groups.upcoming.sort(byDue);
  groups.completed.sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
  );
  return groups;
}

/* -----------------------------------------------------------------
 * Outreach drafts
 * ----------------------------------------------------------------- */

export async function pageListDrafts(filter?: {
  status?: OutreachStatus;
  leadId?: string;
}) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listDrafts(db, owner.id, filter);
}

export async function pageGroupDraftsByStatus() {
  const list = await pageListDrafts();
  const groups: Record<OutreachStatus, typeof list> = {
    draft: [],
    needs_review: [],
    approved: [],
    contacted: [],
    replied: [],
    archived: [],
  };
  for (const d of list) groups[d.status].push(d);
  return groups;
}

/* -----------------------------------------------------------------
 * Audits + briefs + activities
 * ----------------------------------------------------------------- */

export async function pageListAudits(leadId: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listAuditsForLead(db, owner.id, leadId);
}

export async function pageLatestAudit(leadId: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getLatestAudit(db, owner.id, leadId);
}

export async function pageListBriefs(leadId: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listBriefsForLead(db, owner.id, leadId);
}

export async function pageLatestBrief(leadId: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getLatestBrief(db, owner.id, leadId);
}

export async function pageListActivities(opts?: {
  leadId?: string;
  limit?: number;
}) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listActivities(db, owner.id, opts);
}

/* -----------------------------------------------------------------
 * Discovery + services
 * ----------------------------------------------------------------- */

export async function pageListDiscoveryJobs() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listDiscoveryJobs(db, owner.id);
}

export async function pageListServices() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listServiceOfferings(db, owner.id);
}

/* -----------------------------------------------------------------
 * Overview + reports metrics
 * ----------------------------------------------------------------- */

export async function pageOverviewMetrics(nowIso?: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getOverviewMetrics(db, owner.id, nowIso);
}

export async function pagePipelineFunnel() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getPipelineFunnel(db, owner.id);
}

export async function pageSourceBreakdown() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getSourceBreakdown(db, owner.id);
}

export async function pageNicheBreakdown() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getNicheBreakdown(db, owner.id);
}

export async function pageScoreBandBreakdown() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getScoreBandBreakdown(db, owner.id);
}

export async function pageCityBreakdown() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getCityBreakdown(db, owner.id);
}

export async function pageResponseTimeStats() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getResponseTimeStats(db, owner.id);
}

export async function pageVariantComparison() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getVariantComparison(db, owner.id);
}

export async function pageRegressions(limit = 20) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listRegressions(db, owner.id, limit);
}

export async function pageStuckLeads(limit = 20) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listStuckLeads(db, owner.id, undefined, undefined, limit);
}

/* -----------------------------------------------------------------
 * Scoring weights
 * ----------------------------------------------------------------- */

export async function pageScoringWeights() {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getScoringWeights(db, owner.id);
}

/* -----------------------------------------------------------------
 * Discovery adapter capabilities (Phase 6)
 * ----------------------------------------------------------------- */

export async function pageAdapterCapabilities() {
  await requirePageOwner();
  const { adapterCapabilities } = await import("@/lib/sources/registry");
  const { getRuntimeEnv } = await import("@/lib/env");
  const env = await getRuntimeEnv();
  return adapterCapabilities(env).map(({ adapter, status }) => ({
    name: adapter.name,
    label: adapter.label,
    status,
  }));
}

/* -----------------------------------------------------------------
 * Web Intelligence
 * ----------------------------------------------------------------- */

export async function pageListCrawlJobs(limit = 50) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listCrawlJobs(db, owner.id, limit);
}

export async function pageGetCrawlJob(id: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.getCrawlJob(db, owner.id, id);
}

export async function pageListCrawlPages(jobId: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listCrawlPages(db, owner.id, jobId);
}

export async function pageListPeopleForLead(leadId: string) {
  const owner = await requirePageOwner();
  const db = await getDb();
  return repos.listPeopleForLead(db, owner.id, leadId);
}

export async function pageWebSearchStatus() {
  await requirePageOwner();
  const { getRuntimeEnv } = await import("@/lib/env");
  const { webSearchProviderStatus } = await import("@/lib/intel/search");
  const env = await getRuntimeEnv();
  return webSearchProviderStatus(env);
}
