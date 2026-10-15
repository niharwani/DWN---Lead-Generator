/**
 * Discovery runner. Reads an adapter's candidates, dedups against existing
 * leads, persists survivors, and optionally runs the audit + score pipeline
 * for each. All D1 writes happen here — adapters stay pure.
 */

import type { Db } from "@/lib/db/client";
import {
  createActivity,
  createAudit,
  createLead,
  findLeadByDomain,
  findLeadByNameAndCity,
  getLatestAudit,
  getScoringWeights,
  listCampaigns,
  listServiceOfferings,
  updateDiscoveryJob,
  updateLead,
} from "@/lib/db/repos";
import { normalizeDomain, normalizeName } from "@/lib/db/normalize";
import { runAudit } from "@/lib/audit/engine";
import { scoreLead } from "@/lib/scoring/engine";
import type { Campaign } from "@/lib/demo/types";
import { getAdapter } from "./registry";
import type { DiscoveryInput, DiscoveryResult } from "./types";

export type RunDiscoveryOptions = {
  jobId: string;
  ownerId: string;
  sourceName: string;
  campaignId?: string;
  input: DiscoveryInput;
  runAuditOnEach: boolean;
  scoreAfter: boolean;
  env: Readonly<Record<string, string | undefined>>;
};

export async function runDiscovery(
  db: Db,
  opts: RunDiscoveryOptions
): Promise<DiscoveryResult> {
  const adapter = getAdapter(opts.sourceName);
  const startedAt = new Date().toISOString();
  await updateDiscoveryJob(db, opts.ownerId, opts.jobId, {
    status: "running",
    startedAt,
  });

  if (!adapter) {
    await updateDiscoveryJob(db, opts.ownerId, opts.jobId, {
      status: "failed",
      errorSummary: `Unknown source: ${opts.sourceName}`,
      completedAt: new Date().toISOString(),
    });
    return {
      jobId: opts.jobId,
      created: 0,
      dedupedDomain: 0,
      dedupedName: 0,
      errors: [{ reason: `Unknown source: ${opts.sourceName}` }],
      leadIds: [],
    };
  }

  let adapterNote: string | undefined;
  let candidates: Awaited<ReturnType<typeof adapter.run>>["candidates"] = [];
  try {
    const result = await adapter.run(opts.input, opts.env);
    candidates = result.candidates;
    adapterNote = result.note;
  } catch (err) {
    const reason = (err as Error).message;
    await updateDiscoveryJob(db, opts.ownerId, opts.jobId, {
      status: "failed",
      errorSummary: reason.slice(0, 400),
      completedAt: new Date().toISOString(),
    });
    return {
      jobId: opts.jobId,
      created: 0,
      dedupedDomain: 0,
      dedupedName: 0,
      errors: [{ reason }],
      leadIds: [],
    };
  }

  await updateDiscoveryJob(db, opts.ownerId, opts.jobId, {
    progressTotal: candidates.length,
  });

  const result: DiscoveryResult = {
    jobId: opts.jobId,
    created: 0,
    dedupedDomain: 0,
    dedupedName: 0,
    errors: [],
    leadIds: [],
    note: adapterNote,
  };

  const [services, campaigns, weights] = opts.scoreAfter
    ? await Promise.all([
        listServiceOfferings(db, opts.ownerId),
        listCampaigns(db, opts.ownerId),
        getScoringWeights(db, opts.ownerId),
      ])
    : [[], [] as Campaign[], undefined];

  let processed = 0;
  for (const c of candidates) {
    processed++;
    try {
      // Dedup by canonical domain first (strongest signal).
      const domain = normalizeDomain(c.websiteUrl);
      if (domain) {
        const dup = await findLeadByDomain(db, opts.ownerId, domain);
        if (dup) {
          result.dedupedDomain++;
          continue;
        }
      }
      const nameMatch = await findLeadByNameAndCity(
        db,
        opts.ownerId,
        normalizeName(c.businessName),
        c.city ?? opts.input.city ?? ""
      );
      if (nameMatch) {
        result.dedupedName++;
        continue;
      }

      const lead = await createLead(db, opts.ownerId, {
        businessName: c.businessName,
        category: c.category,
        niche: opts.input.niche,
        websiteUrl: c.websiteUrl,
        publicEmail: c.publicEmail,
        publicPhone: c.publicPhone,
        address: c.address,
        city: c.city ?? opts.input.city ?? "",
        region: c.region ?? opts.input.region,
        country: c.country ?? opts.input.country ?? "India",
        sourceName: opts.sourceName,
        sourceUrl: c.sourceUrl,
        sourceExternalId: c.externalId,
        sourceLastCheckedAt: new Date().toISOString(),
      });
      result.leadIds.push(lead.id);
      result.created++;

      await createActivity(db, opts.ownerId, {
        leadId: lead.id,
        campaignId: opts.campaignId,
        activityType: "lead_created",
        title: `Discovered via ${adapter.label}: ${lead.businessName}`,
        description: c.sourceUrl ?? undefined,
        metadata: { jobId: opts.jobId, externalId: c.externalId ?? null },
      });

      if (opts.runAuditOnEach && lead.websiteUrl) {
        try {
          const { audit, derivedCondition } = await runAudit({
            leadId: lead.id,
            requestedUrl: lead.websiteUrl,
          });
          await createAudit(db, opts.ownerId, audit);
          await updateLead(db, opts.ownerId, lead.id, {
            websiteCondition: derivedCondition,
          });
        } catch (err) {
          result.errors.push({
            businessName: lead.businessName,
            reason: `Audit failed: ${(err as Error).message}`,
          });
        }
      }

      if (opts.scoreAfter && weights) {
        const latest = await getLatestAudit(db, opts.ownerId, lead.id);
        const campaign =
          campaigns.find(
            (cmp) =>
              cmp.niche === lead.niche &&
              (cmp.status === "active" || cmp.status === "draft")
          ) ?? campaigns.find((cmp) => cmp.niche === lead.niche);
        const score = scoreLead({
          lead,
          audit: latest,
          campaign,
          services,
          weights,
          nowIso: new Date().toISOString(),
        });
        await updateLead(db, opts.ownerId, lead.id, { score });
      }
    } catch (err) {
      result.errors.push({
        businessName: c.businessName,
        reason: (err as Error).message,
      });
    }

    if (processed % 5 === 0 || processed === candidates.length) {
      await updateDiscoveryJob(db, opts.ownerId, opts.jobId, {
        progressCurrent: processed,
        resultCount: result.created,
      });
    }
  }

  const status =
    result.errors.length === 0
      ? "completed"
      : result.created > 0
        ? "partial"
        : "failed";

  await updateDiscoveryJob(db, opts.ownerId, opts.jobId, {
    status,
    progressCurrent: candidates.length,
    resultCount: result.created,
    errorSummary:
      result.errors.length > 0
        ? result.errors
            .slice(0, 3)
            .map((e) => (e.businessName ? `${e.businessName}: ${e.reason}` : e.reason))
            .join(" · ")
            .slice(0, 400)
        : null,
    completedAt: new Date().toISOString(),
  });

  await createActivity(db, opts.ownerId, {
    campaignId: opts.campaignId,
    activityType: "lead_updated",
    title: `Discovery completed: ${result.created} new via ${adapter.label}`,
    description: `${result.dedupedDomain + result.dedupedName} duplicates skipped · ${result.errors.length} errors`,
    metadata: { jobId: opts.jobId, source: opts.sourceName },
  });

  return result;
}
