import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  leads,
  outreachDrafts,
  tasks,
  type Lead as LeadRow,
} from "../schema";
import { rowToLead } from "../adapt";
import type { Lead, PipelineStage, ReplySentiment } from "@/lib/demo/types";

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

/* -------------------------------------------------------------------------
 * Response-time, variant comparison, regression — automation-wave metrics
 * ------------------------------------------------------------------------- */

const CONDITION_RANK: Record<NonNullable<LeadRow["websiteCondition"]>, number> = {
  strong: 5,
  acceptable: 4,
  outdated: 3,
  weak: 2,
  inaccessible: 1,
  no_website: 0,
  unknown: -1,
};

export type ResponseTimeStats = {
  totalReplies: number;
  avgDays: number | null;
  medianDays: number | null;
  byNiche: Array<{ niche: string; replies: number; avgDays: number }>;
  bySentiment: Array<{ sentiment: ReplySentiment; count: number }>;
};

export async function getResponseTimeStats(
  db: Db,
  ownerId: string
): Promise<ResponseTimeStats> {
  const rows = await db
    .select({
      niche: leads.niche,
      sentiment: outreachDrafts.replySentiment,
      contactedAt: outreachDrafts.contactedAt,
      repliedAt: outreachDrafts.repliedAt,
    })
    .from(outreachDrafts)
    .innerJoin(leads, eq(outreachDrafts.leadId, leads.id))
    .where(
      and(
        eq(outreachDrafts.ownerId, ownerId),
        isNotNull(outreachDrafts.contactedAt),
        isNotNull(outreachDrafts.repliedAt)
      )
    );

  const diffs: number[] = [];
  const perNiche = new Map<string, number[]>();
  const perSentiment = new Map<ReplySentiment, number>();
  for (const r of rows) {
    if (!r.contactedAt || !r.repliedAt) continue;
    const diff =
      (new Date(r.repliedAt).getTime() - new Date(r.contactedAt).getTime()) /
      86400_000;
    if (diff < 0) continue;
    diffs.push(diff);
    const list = perNiche.get(r.niche) ?? [];
    list.push(diff);
    perNiche.set(r.niche, list);
    if (r.sentiment) {
      perSentiment.set(
        r.sentiment,
        (perSentiment.get(r.sentiment) ?? 0) + 1
      );
    }
  }

  const avg: number | null =
    diffs.length > 0
      ? diffs.reduce((a, b) => a + b, 0) / diffs.length
      : null;
  const sorted = [...diffs].sort((a, b) => a - b);
  let median: number | null = null;
  if (sorted.length > 0) {
    const mid = Math.floor(sorted.length / 2);
    median =
      sorted.length % 2 === 1
        ? sorted[mid]!
        : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  const byNiche = Array.from(perNiche.entries())
    .map(([niche, list]) => ({
      niche,
      replies: list.length,
      avgDays: list.reduce((a, b) => a + b, 0) / list.length,
    }))
    .sort((a, b) => b.replies - a.replies);

  const bySentiment = Array.from(perSentiment.entries())
    .map(([sentiment, c]) => ({ sentiment, count: c }))
    .sort((a, b) => b.count - a.count);

  return {
    totalReplies: diffs.length,
    avgDays: avg,
    medianDays: median,
    byNiche,
    bySentiment,
  };
}

export type VariantComparison = {
  variantLabel: string;
  total: number;
  contacted: number;
  replied: number;
  replyRate: number;
};

export async function getVariantComparison(
  db: Db,
  ownerId: string
): Promise<VariantComparison[]> {
  const rows = await db
    .select({
      label: outreachDrafts.variantLabel,
      status: outreachDrafts.status,
      contactedAt: outreachDrafts.contactedAt,
      repliedAt: outreachDrafts.repliedAt,
    })
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.ownerId, ownerId),
        isNotNull(outreachDrafts.variantLabel)
      )
    );

  const buckets = new Map<
    string,
    { total: number; contacted: number; replied: number }
  >();
  for (const r of rows) {
    if (!r.label) continue;
    const b = buckets.get(r.label) ?? { total: 0, contacted: 0, replied: 0 };
    b.total++;
    if (r.contactedAt) b.contacted++;
    if (r.repliedAt) b.replied++;
    buckets.set(r.label, b);
  }

  return Array.from(buckets.entries())
    .map(([label, b]) => ({
      variantLabel: label,
      total: b.total,
      contacted: b.contacted,
      replied: b.replied,
      replyRate: b.contacted > 0 ? b.replied / b.contacted : 0,
    }))
    .sort((a, b) => a.variantLabel.localeCompare(b.variantLabel));
}

export type RegressionEntry = {
  lead: Lead;
  before: NonNullable<LeadRow["websiteCondition"]>;
  after: NonNullable<LeadRow["websiteCondition"]>;
  direction: "regression" | "improvement";
};

export async function listRegressions(
  db: Db,
  ownerId: string,
  limit = 20
): Promise<RegressionEntry[]> {
  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        isNotNull(leads.previousWebsiteCondition),
        ne(leads.previousWebsiteCondition, leads.websiteCondition)
      )
    )
    .orderBy(desc(leads.lastAuditedAt))
    .limit(limit);

  return rows
    .map<RegressionEntry>((row) => {
      const before = (row.previousWebsiteCondition ??
        "unknown") as NonNullable<LeadRow["websiteCondition"]>;
      const after = row.websiteCondition;
      const direction: "regression" | "improvement" =
        CONDITION_RANK[after] < CONDITION_RANK[before]
          ? "regression"
          : "improvement";
      return { lead: rowToLead(row), before, after, direction };
    })
    .sort((a, b) => {
      if (a.direction === b.direction) return 0;
      return a.direction === "regression" ? -1 : 1;
    });
}

export type StuckLead = {
  lead: Lead;
  daysSinceContact: number;
  stage: PipelineStage;
};

export async function listStuckLeads(
  db: Db,
  ownerId: string,
  nowIso = new Date().toISOString(),
  staleDays = 7,
  limit = 20
): Promise<StuckLead[]> {
  const now = new Date(nowIso).getTime();
  const cutoff = new Date(now - staleDays * 86400_000).toISOString();

  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        inArray(leads.pipelineStage, ["contacted", "replied"]),
        isNotNull(leads.lastContactedAt),
        lt(leads.lastContactedAt, cutoff)
      )
    )
    .orderBy(leads.lastContactedAt)
    .limit(limit);

  return rows.map((row) => {
    const lead = rowToLead(row);
    const days = row.lastContactedAt
      ? (now - new Date(row.lastContactedAt).getTime()) / 86400_000
      : 0;
    return { lead, daysSinceContact: days, stage: lead.pipelineStage };
  });
}

