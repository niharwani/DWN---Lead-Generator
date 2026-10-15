/**
 * Monthly re-audit sweep.
 *
 * Picks a batch of previously-audited leads whose last audit is stale and
 * re-runs the website audit so Nihar sees regressions (sites getting worse)
 * and improvements (sites fixed since first contact). Owner-scoped, rate
 * limited to one request per second to avoid hammering target sites.
 */

import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { rowToLead } from "@/lib/db/adapt";
import { runAudit } from "@/lib/audit/engine";
import { createActivity, createAudit, updateLead } from "@/lib/db/repos";
import type { RuntimeEnv } from "@/lib/env";
import type { Lead, WebsiteCondition } from "@/lib/demo/types";

const CONDITION_RANK: Record<WebsiteCondition, number> = {
  strong: 6,
  acceptable: 5,
  outdated: 4,
  weak: 3,
  inaccessible: 2,
  no_website: 1,
  unknown: 0,
};

/**
 * Order websiteCondition values from worst (0) to best (6). `unknown` is
 * treated as the lowest so a transition into or out of unknown never counts
 * as a regression (it's an evidence problem, not a quality problem).
 */
export function compareWebsiteConditions(
  before: WebsiteCondition,
  after: WebsiteCondition
): "regression" | "improvement" | "same" {
  if (before === after) return "same";
  if (before === "unknown" || after === "unknown") return "same";
  const b = CONDITION_RANK[before];
  const a = CONDITION_RANK[after];
  if (a < b) return "regression";
  if (a > b) return "improvement";
  return "same";
}

export type ReauditSweepOptions = {
  limit?: number;
  staleAfterDays?: number;
};

export type ReauditSweepResult = {
  reaudited: number;
  regressions: Array<{
    leadId: string;
    businessName: string;
    before: WebsiteCondition;
    after: WebsiteCondition;
  }>;
  improvements: Array<{
    leadId: string;
    businessName: string;
    before: WebsiteCondition;
    after: WebsiteCondition;
  }>;
  errors: Array<{ leadId: string; reason: string }>;
};

const AUDITABLE_CONDITIONS: WebsiteCondition[] = ["weak", "outdated", "acceptable"];

/**
 * Run the monthly re-audit sweep for a single owner. Returns a summary that
 * the HTTP route serializes to JSON for whoever triggered the cron.
 */
export async function runReauditSweep(
  db: Db,
  ownerId: string,
  _env: RuntimeEnv,
  opts: ReauditSweepOptions = {}
): Promise<ReauditSweepResult> {
  const limit = opts.limit ?? 20;
  const staleAfterDays = opts.staleAfterDays ?? 30;
  const cutoffIso = new Date(
    Date.now() - staleAfterDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const candidates = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        eq(leads.doNotContact, false),
        inArray(leads.websiteCondition, AUDITABLE_CONDITIONS),
        sql`${leads.websiteUrl} is not null`,
        or(isNull(leads.lastAuditedAt), lt(leads.lastAuditedAt, cutoffIso))!
      )
    )
    .orderBy(asc(leads.lastAuditedAt))
    .limit(limit);

  const result: ReauditSweepResult = {
    reaudited: 0,
    regressions: [],
    improvements: [],
    errors: [],
  };

  for (let i = 0; i < candidates.length; i++) {
    const lead: Lead = rowToLead(candidates[i]!);
    if (!lead.websiteUrl) continue;

    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    const before = lead.websiteCondition;

    try {
      const { audit, derivedCondition } = await runAudit({
        leadId: lead.id,
        requestedUrl: lead.websiteUrl,
      });

      await createAudit(db, ownerId, audit);
      await updateLead(db, ownerId, lead.id, {
        websiteCondition: derivedCondition,
      });

      const now = new Date().toISOString();
      await db
        .update(leads)
        .set({
          lastAuditedAt: now,
          previousWebsiteCondition: before,
          updatedAt: now,
        })
        .where(and(eq(leads.ownerId, ownerId), eq(leads.id, lead.id)));

      const direction = compareWebsiteConditions(before, derivedCondition);
      result.reaudited += 1;

      if (direction === "regression") {
        result.regressions.push({
          leadId: lead.id,
          businessName: lead.businessName,
          before,
          after: derivedCondition,
        });
      } else if (direction === "improvement") {
        result.improvements.push({
          leadId: lead.id,
          businessName: lead.businessName,
          before,
          after: derivedCondition,
        });
      }

      await createActivity(db, ownerId, {
        leadId: lead.id,
        activityType: "audit_rerun",
        title: `Re-audit: ${lead.businessName}`,
        description: `Condition ${before} → ${derivedCondition} (${direction})`,
        metadata: {
          before,
          after: derivedCondition,
          direction,
          auditStatus: audit.status,
          findings: audit.findings.length,
        },
      });
    } catch (err) {
      result.errors.push({
        leadId: lead.id,
        reason: (err as Error).message,
      });
    }
  }

  return result;
}
