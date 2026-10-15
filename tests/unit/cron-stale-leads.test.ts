import { describe, expect, it } from "vitest";
import { buildDigestHtml, findStaleLeads } from "@/lib/cron/stale-leads";
import type { Db } from "@/lib/db/client";
import { leads, outreachDrafts, tasks } from "@/lib/db/schema";
import type {
  Lead as LeadRow,
  OutreachDraft as DraftRow,
  Task as TaskRow,
} from "@/lib/db/schema";

/**
 * Mocks drizzle's chainable builder with a per-table FIFO queue of results so
 * each `.select().from(X)...` call pops the next pre-wired dataset for that
 * table. The real SQL predicates aren't exercised — we're asserting the
 * categorization layer, not the DB.
 */

type Queues = {
  tasks: TaskRow[][];
  leads: LeadRow[][];
  drafts: DraftRow[][];
};

function makeChain<T>(rows: T[]): Promise<T[]> & {
  where: (...a: unknown[]) => Promise<T[]> & {
    limit: (n: number) => Promise<T[]>;
    orderBy: (...a: unknown[]) => Promise<T[]> & {
      limit: (n: number) => Promise<T[]>;
    };
  };
} {
  const atWhere = () => {
    const p = Promise.resolve(rows);
    return Object.assign(p, {
      limit: (n: number) => Promise.resolve(rows.slice(0, n)),
      orderBy: () => {
        const q = Promise.resolve(rows);
        return Object.assign(q, {
          limit: (n: number) => Promise.resolve(rows.slice(0, n)),
        });
      },
    });
  };
  const top = Object.assign(Promise.resolve(rows), { where: atWhere });
  return top as unknown as ReturnType<typeof makeChain<T>>;
}

function makeDb(queues: Queues): Db {
  const api = {
    select: () => ({
      from: (table: unknown) => {
        if (table === tasks) {
          const next = queues.tasks.shift() ?? [];
          return makeChain(next);
        }
        if (table === leads) {
          const next = queues.leads.shift() ?? [];
          return makeChain(next);
        }
        if (table === outreachDrafts) {
          const next = queues.drafts.shift() ?? [];
          return makeChain(next);
        }
        return makeChain([]);
      },
    }),
  };
  return api as unknown as Db;
}

const OWNER = "owner_a";
const NOW = "2026-10-16T12:00:00.000Z";
const DAYS = (n: number) =>
  new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();

function leadRow(overrides: Partial<LeadRow>): LeadRow {
  return {
    id: "lead_x",
    ownerId: OWNER,
    businessName: "Acme",
    normalizedName: "acme",
    category: "",
    niche: "D2C",
    websiteUrl: "https://acme.test",
    normalizedDomain: "acme.test",
    publicEmail: null,
    publicPhone: null,
    address: null,
    city: "Mumbai",
    region: null,
    country: "India",
    sourceName: "manual",
    sourceUrl: null,
    sourceExternalId: null,
    sourceLastCheckedAt: null,
    websiteCondition: "weak",
    fitScore: null,
    evidenceConfidence: "insufficient",
    scoreBand: null,
    scoreBreakdown: null,
    scoreVersion: null,
    scoredAt: null,
    pipelineStage: "contacted",
    estimatedDealValue: null,
    currency: "INR",
    lossReason: null,
    lastContactedAt: DAYS(10),
    nextActionAt: null,
    tags: [],
    doNotContact: false,
    doNotContactReason: null,
    doNotContactAt: null,
    lastAuditedAt: null,
    previousWebsiteCondition: null,
    createdAt: DAYS(20),
    updatedAt: DAYS(10),
    archivedAt: null,
    ...overrides,
  };
}

function taskRow(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: "task_x",
    ownerId: OWNER,
    leadId: null,
    campaignId: null,
    title: "Follow up",
    taskType: "other",
    priority: "normal",
    status: "open",
    dueAt: DAYS(2),
    notes: null,
    completedAt: null,
    createdAt: DAYS(5),
    updatedAt: DAYS(5),
    ...overrides,
  };
}

describe("findStaleLeads", () => {
  it("surfaces overdue tasks when no leads qualify as stuck or dormant", async () => {
    // Query order: tasks[0]=overdue list, leads[0]=stuck candidates [],
    // leads[1]=dormant candidates [].
    const db = makeDb({
      tasks: [[taskRow({ id: "t_overdue", dueAt: DAYS(3) })]],
      leads: [[], []],
      drafts: [],
    });
    const result = await findStaleLeads(db, OWNER, NOW);
    expect(result.overdueTasks).toHaveLength(1);
    expect(result.overdueTasks[0]!.id).toBe("t_overdue");
    expect(result.stuckLeads).toHaveLength(0);
    expect(result.dormantQualified).toHaveLength(0);
  });

  it("flags a contacted lead cold for 10d with no follow-up as stuck", async () => {
    const stuck = leadRow({
      id: "lead_stuck",
      businessName: "Stuck Co",
      pipelineStage: "contacted",
      lastContactedAt: DAYS(10),
    });
    // tasks[0]=overdue [], leads[0]=stuck candidates [stuck], leads[1]=dormant [].
    // Per-stuck sub-queries: tasks[1]=recent follow-up [], drafts[0]=latest draft [].
    const db = makeDb({
      tasks: [[], []],
      leads: [[stuck], []],
      drafts: [[]],
    });
    const result = await findStaleLeads(db, OWNER, NOW);
    expect(result.stuckLeads).toHaveLength(1);
    expect(result.stuckLeads[0]!.lead.id).toBe("lead_stuck");
    expect(result.stuckLeads[0]!.daysSinceContact).toBeGreaterThanOrEqual(9);
    expect(result.stuckLeads[0]!.lastDraft).toBeUndefined();
  });

  it("skips a stuck lead that already has a recent follow-up task", async () => {
    const stuck = leadRow({ id: "lead_has_followup", pipelineStage: "contacted" });
    const existingFollowUp = taskRow({
      id: "t_follow",
      leadId: "lead_has_followup",
      taskType: "follow_up",
      createdAt: DAYS(1),
    });
    const db = makeDb({
      tasks: [[], [existingFollowUp]],
      leads: [[stuck], []],
      drafts: [],
    });
    const result = await findStaleLeads(db, OWNER, NOW);
    expect(result.stuckLeads).toHaveLength(0);
  });

  it("flags a qualified lead with no draft as dormant", async () => {
    const dormant = leadRow({
      id: "lead_dormant",
      businessName: "Dormant Co",
      pipelineStage: "qualified",
      lastContactedAt: null,
      createdAt: DAYS(7),
    });
    // tasks[0]=overdue [], leads[0]=stuck [], leads[1]=dormant [dormant],
    // drafts[0]=existing drafts for dormant [].
    const db = makeDb({
      tasks: [[]],
      leads: [[], [dormant]],
      drafts: [[]],
    });
    const result = await findStaleLeads(db, OWNER, NOW);
    expect(result.dormantQualified).toHaveLength(1);
    expect(result.dormantQualified[0]!.lead.id).toBe("lead_dormant");
    expect(
      result.dormantQualified[0]!.daysSinceQualified
    ).toBeGreaterThanOrEqual(6);
  });

  it("buildDigestHtml renders a heading per bucket with counts", () => {
    const html = buildDigestHtml({
      overdueTasks: [],
      stuckLeads: [],
      dormantQualified: [],
    });
    expect(html).toContain("Overdue tasks (0)");
    expect(html).toContain("Stuck leads (0)");
    expect(html).toContain("Dormant qualified leads (0)");
  });
});
