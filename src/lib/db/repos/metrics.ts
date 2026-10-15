import { and, count, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  leads,
  outreachDrafts,
  tasks,
  type Lead as LeadRow,
} from "../schema";
import type { PipelineStage } from "@/lib/demo/types";

/**
 * Dashboard + reports aggregations. All owner-scoped at the SQL level so the
 * numbers can never leak across tenants even if a caller forgets to filter.
 */

export type OverviewMetrics = {
  totalLeads: number;
  newThisWeek: number;
  needingReview: number;
  qualified: number;
  draftsAwaitingApproval: number;
  repliesReceived: number;
  meetingsBooked: number;
  proposalsSent: number;
  dealsWon: number;
  followUpsDueToday: number;
  recordedRevenue: number;
};

export async function getOverviewMetrics(
  db: Db,
  ownerId: string,
  nowIso = new Date().toISOString()
): Promise<OverviewMetrics> {
  const now = new Date(nowIso);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const [row] = await db
    .select({
      totalLeads: sql<number>`COUNT(*)`.as("total"),
      newThisWeek: sql<number>`SUM(CASE WHEN ${leads.createdAt} >= ${sevenDaysAgo} THEN 1 ELSE 0 END)`.as(
        "new_week"
      ),
      needingReview: sql<number>`SUM(CASE WHEN ${leads.pipelineStage} IN ('new','reviewing') THEN 1 ELSE 0 END)`.as(
        "needing_review"
      ),
      qualified: sql<number>`SUM(CASE WHEN ${leads.pipelineStage} IN ('qualified','contacted','replied','meeting_booked','proposal_sent') THEN 1 ELSE 0 END)`.as(
        "qualified"
      ),
      meetingsBooked: sql<number>`SUM(CASE WHEN ${leads.pipelineStage} IN ('meeting_booked','proposal_sent','won') THEN 1 ELSE 0 END)`.as(
        "meetings"
      ),
      proposalsSent: sql<number>`SUM(CASE WHEN ${leads.pipelineStage} IN ('proposal_sent','won') THEN 1 ELSE 0 END)`.as(
        "proposals"
      ),
      dealsWon: sql<number>`SUM(CASE WHEN ${leads.pipelineStage} = 'won' THEN 1 ELSE 0 END)`.as(
        "wins"
      ),
      recordedRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${leads.pipelineStage} = 'won' THEN ${leads.estimatedDealValue} ELSE 0 END), 0)`.as(
        "revenue"
      ),
    })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)));

  const [draftsAwaitingApproval, repliesReceived] = await Promise.all([
    db
      .select({ c: count() })
      .from(outreachDrafts)
      .where(
        and(
          eq(outreachDrafts.ownerId, ownerId),
          inArray(outreachDrafts.status, ["draft", "needs_review"])
        )
      )
      .then((r) => r[0]?.c ?? 0),
    db
      .select({ c: count() })
      .from(outreachDrafts)
      .where(
        and(
          eq(outreachDrafts.ownerId, ownerId),
          eq(outreachDrafts.status, "replied")
        )
      )
      .then((r) => r[0]?.c ?? 0),
  ]);

  const followUpsDueToday = await db
    .select({ c: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, ownerId),
        inArray(tasks.status, ["open", "in_progress"]),
        gte(tasks.dueAt, sevenDaysAgo),
        lt(tasks.dueAt, dayEnd)
      )
    )
    .then((r) => r[0]?.c ?? 0);

  return {
    totalLeads: row?.totalLeads ?? 0,
    newThisWeek: row?.newThisWeek ?? 0,
    needingReview: row?.needingReview ?? 0,
    qualified: row?.qualified ?? 0,
    draftsAwaitingApproval,
    repliesReceived,
    meetingsBooked: row?.meetingsBooked ?? 0,
    proposalsSent: row?.proposalsSent ?? 0,
    dealsWon: row?.dealsWon ?? 0,
    followUpsDueToday,
    recordedRevenue: row?.recordedRevenue ?? 0,
  };
}

const FUNNEL_ORDER: PipelineStage[] = [
  "new",
  "reviewing",
  "qualified",
  "contacted",
  "replied",
  "meeting_booked",
  "proposal_sent",
  "won",
];

export async function getPipelineFunnel(
  db: Db,
  ownerId: string
): Promise<Array<{ stage: PipelineStage; count: number }>> {
  const rows = await db
    .select({
      stage: leads.pipelineStage,
      c: count(),
    })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)))
    .groupBy(leads.pipelineStage);

  const map = new Map<PipelineStage, number>();
  for (const r of rows) map.set(r.stage, r.c);
  return FUNNEL_ORDER.map((stage) => ({
    stage,
    count: map.get(stage) ?? 0,
  }));
}

export async function getSourceBreakdown(
  db: Db,
  ownerId: string
): Promise<Array<{ source: string; count: number }>> {
  const rows = await db
    .select({ source: leads.sourceName, c: count() })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)))
    .groupBy(leads.sourceName);
  return rows
    .map((r) => ({ source: r.source, count: r.c }))
    .sort((a, b) => b.count - a.count);
}

export async function getCityBreakdown(
  db: Db,
  ownerId: string
): Promise<Array<{ city: string; count: number }>> {
  const rows = await db
    .select({ city: leads.city, c: count() })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)))
    .groupBy(leads.city);
  return rows
    .filter((r) => r.city)
    .map((r) => ({ city: r.city, count: r.c }))
    .sort((a, b) => b.count - a.count);
}

export async function getNicheBreakdown(
  db: Db,
  ownerId: string
): Promise<Array<{ niche: string; count: number }>> {
  const rows = await db
    .select({ niche: leads.niche, c: count() })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)))
    .groupBy(leads.niche);
  return rows
    .map((r) => ({ niche: r.niche, count: r.c }))
    .sort((a, b) => b.count - a.count);
}

export async function getScoreBandBreakdown(
  db: Db,
  ownerId: string
): Promise<
  Array<{ band: NonNullable<LeadRow["scoreBand"]>; count: number }>
> {
  const rows = await db
    .select({ band: leads.scoreBand, c: count() })
    .from(leads)
    .where(and(eq(leads.ownerId, ownerId), isNull(leads.archivedAt)))
    .groupBy(leads.scoreBand);

  const order: Array<NonNullable<LeadRow["scoreBand"]>> = [
    "priority_review",
    "strong_candidate",
    "needs_manual_review",
    "low_priority",
    "insufficient_evidence",
  ];
  const map = new Map<NonNullable<LeadRow["scoreBand"]>, number>();
  for (const r of rows) if (r.band) map.set(r.band, r.c);
  return order.map((band) => ({ band, count: map.get(band) ?? 0 }));
}
