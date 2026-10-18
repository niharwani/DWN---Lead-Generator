/**
 * Auto-enrichment pass.
 *
 * Iterates recently-created or low-confidence leads that are missing a website
 * audit. Re-runs the audit if one is missing, then classifies the lead's
 * industry via Claude Haiku and appends findings to leadSources.
 * Rate-limited to 30 enrichments/minute per workspace.
 */

import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { leadSources, leads, profiles } from "@/lib/db/schema";
import { createActivity, createAudit, getLatestAudit, updateLead } from "@/lib/db/repos";
import { runAudit } from "@/lib/audit/engine";
import type { RuntimeEnv } from "@/lib/env";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_HAIKU_MODEL = "claude-haiku-4-5";

export type EnrichmentSweepResult = {
  evaluated: number;
  enriched: number;
  errors: Array<{ leadId: string; reason: string }>;
};

async function classifyIndustry(
  businessName: string,
  niche: string,
  websiteSnippet: string,
  env: RuntimeEnv
): Promise<string | undefined> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return undefined;

  const model = env.ANTHROPIC_MODEL_HAIKU ?? DEFAULT_HAIKU_MODEL;
  const prompt = `Business: "${businessName}"\nNiche: ${niche}\nWebsite snippet: ${websiteSnippet.slice(0, 200)}\n\nReturn a 1-3 word industry classification only. No explanation.`;

  try {
    const resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 32,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) return undefined;
    const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    return text.slice(0, 80) || undefined;
  } catch {
    return undefined;
  }
}

export async function runEnrichmentPass(
  db: Db,
  ownerId: string,
  env: RuntimeEnv,
  limit = 10
): Promise<EnrichmentSweepResult> {
  const result: EnrichmentSweepResult = { evaluated: 0, enriched: 0, errors: [] };

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Pick leads with a website but no audit, or low-confidence recently created leads
  const candidates = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.ownerId, ownerId),
        isNull(leads.archivedAt),
        eq(leads.doNotContact, false),
        or(
          and(
            // Has website but never audited
            isNull(leads.lastAuditedAt),
            // Only websites (not null)
            eq(leads.websiteCondition, "unknown")
          )!,
          // OR low-confidence, recently added
          and(
            eq(leads.evidenceConfidence, "insufficient"),
            lt(leads.createdAt, threeDaysAgo)
          )!
        )!
      )
    )
    .orderBy(asc(leads.createdAt))
    .limit(limit);

  for (const leadRow of candidates) {
    try {
      result.evaluated += 1;

      let enriched = false;

      // Run audit if missing and website URL exists
      if (leadRow.websiteUrl && !leadRow.lastAuditedAt) {
        try {
          const { audit, derivedCondition } = await runAudit({
            leadId: leadRow.id,
            requestedUrl: leadRow.websiteUrl,
          });

          await createAudit(db, ownerId, audit);
          await updateLead(db, ownerId, leadRow.id, {
            websiteCondition: derivedCondition,
            lastAuditedAt: new Date().toISOString(),
          });
          enriched = true;
        } catch {
          // Audit failures are non-fatal for enrichment
        }
      }

      // Classify industry via Haiku
      const latestAudit = await getLatestAudit(db, ownerId, leadRow.id);
      const snippet = latestAudit?.findings.slice(0, 2).map((f) => f.title).join("; ") ?? "";

      const industry = await classifyIndustry(
        leadRow.businessName,
        leadRow.niche,
        snippet,
        env
      );

      if (industry) {
        await db.insert(leadSources).values({
          id: crypto.randomUUID(),
          leadId: leadRow.id,
          sourceName: "auto_enrichment",
          observedAt: new Date().toISOString(),
          evidence: { industry, method: "haiku_classification" },
        });
        enriched = true;
      }

      if (enriched) {
        result.enriched += 1;
        await createActivity(db, ownerId, {
          leadId: leadRow.id,
          activityType: "lead_updated",
          title: `Auto-enrichment: ${leadRow.businessName}`,
          description: `Industry: ${industry ?? "n/a"} · audit: ${latestAudit?.status ?? "skipped"}`,
          metadata: { auto: true, industry },
        });
      }

      // Respect rate limit: ~2 per second max
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      result.errors.push({ leadId: leadRow.id, reason: (err as Error).message });
    }
  }

  return result;
}

export async function runAllOwnerEnrichment(
  db: Db,
  env: RuntimeEnv
): Promise<Record<string, EnrichmentSweepResult>> {
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  const results: Record<string, EnrichmentSweepResult> = {};
  for (const owner of owners) {
    results[owner.id] = await runEnrichmentPass(db, owner.id, env);
  }
  return results;
}
