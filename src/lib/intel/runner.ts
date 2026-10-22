/**
 * Web Intelligence runner — the single orchestration point between the pure
 * crawler and the DB.
 *
 * Flow (per crawl_job row):
 *   1. Resolve / match / create the owning lead by canonical domain.
 *      - Dedup rule mirrors the existing discovery runner: canonical domain
 *        is the strongest match.
 *   2. Run `crawlSite()` — pure, uses `auditFetch` under the hood.
 *   3. Per crawled page: persist a crawl_pages row.
 *   4. Merge extracted CompanyIntel into the lead:
 *      - Only fill blanks on the lead. Never overwrite publicEmail / publicPhone
 *        / businessName / address when the lead already has a value, so
 *        user-verified data stays authoritative.
 *   5. Write a website_audit row aggregating page-level findings so the
 *      existing Lead Detail / Overview surfaces see them.
 *   6. Upsert extracted_people rows.
 *   7. Write a lead_sources row anchoring the crawl to its evidence trail.
 *   8. Write an activity entry so the timeline reflects the crawl.
 *   9. Update the crawl_jobs row with final counters.
 *
 * Owner-scoped: every DB call takes ownerId; the repository functions filter
 * server-side.
 */

import type { Db } from "@/lib/db/client";
import {
  cancelCrawlJob,
  createActivity,
  createAudit,
  createBrief,
  createCrawlPage,
  createLead,
  findLeadByDomain,
  getCrawlJob,
  getLatestBrief,
  getLead,
  listServiceOfferings,
  updateCrawlJob,
  updateLead,
  upsertPerson,
} from "@/lib/db/repos";
import { leadSources } from "@/lib/db/schema";
import { normalizeDomain, normalizeUrl } from "@/lib/db/normalize";
import { AUDIT_VERSION, deriveWebsiteCondition } from "@/lib/audit/engine";
import { getRuntimeEnv } from "@/lib/env";
import { crawlSite, type CrawlOptions } from "./crawler";
import { enrichWithLlm } from "./llm-extract";
import { dedupeFindings } from "./findings";
import { synthesizeOutreachHooks } from "./synthesize";
import type { CrawlJobInput, CrawlOutcome } from "./types";

/** Minimum interval (ms) between AI-synthesized briefs for the same lead. */
const BRIEF_SYNTHESIS_DEDUPE_MS = 24 * 60 * 60 * 1000;

export type IntelRunOptions = {
  jobId: string;
  ownerId: string;
  input: CrawlJobInput;
  crawlOptions?: Partial<CrawlOptions>;
};

export type IntelRunResult = {
  jobId: string;
  leadId: string;
  pagesFetched: number;
  pagesFailed: number;
  peopleFound: number;
  findingsCount: number;
  intel: CrawlOutcome["intel"];
};

const SOURCE_NAME = "web_intel";

export async function runIntelJob(
  db: Db,
  opts: IntelRunOptions
): Promise<IntelRunResult> {
  const job = await getCrawlJob(db, opts.ownerId, opts.jobId);
  if (!job) throw new Error("crawl job not found for owner");
  const startedAt = new Date().toISOString();
  await updateCrawlJob(db, opts.ownerId, opts.jobId, {
    status: "running",
    startedAt,
  });

  const seedDomain = normalizeDomain(opts.input.seedUrl);
  if (!seedDomain) {
    await updateCrawlJob(db, opts.ownerId, opts.jobId, {
      status: "failed",
      errorSummary: "Invalid seed URL — could not be normalized to a domain.",
      completedAt: new Date().toISOString(),
    });
    throw new Error("Invalid seed URL");
  }

  // Step 1: resolve the owning lead.
  const lead = await resolveOrCreateLead(db, opts, seedDomain);
  await updateCrawlJob(db, opts.ownerId, opts.jobId, { leadId: lead.id });

  // Step 2–3: crawl, streaming each page into the DB.
  let outcome: CrawlOutcome;
  try {
    outcome = await crawlSite(opts.input, {
      ...opts.crawlOptions,
      onPage: async (p) => {
        try {
          await createCrawlPage(db, opts.ownerId, opts.jobId, {
            leadId: lead.id,
            url: p.url,
            finalUrl: p.finalUrl ?? null,
            discoveredVia: p.discoveredVia,
            depth: p.depth,
            status: p.status,
            httpStatus: p.httpStatus ?? null,
            contentType: p.contentType ?? null,
            bytes: p.bytes ?? null,
            elapsedMs: p.elapsedMs ?? null,
            title: p.title ?? null,
            errorStage: p.errorStage ?? null,
            errorReason: p.errorReason ?? null,
          });
        } catch {
          // Progress persistence is best-effort — never fail the crawl on a page-record write.
        }
      },
    });
  } catch (err) {
    const reason = (err as Error).message;
    await updateCrawlJob(db, opts.ownerId, opts.jobId, {
      status: "failed",
      errorSummary: reason.slice(0, 400),
      completedAt: new Date().toISOString(),
    });
    throw err;
  }

  // Stream B: Gemini-backed LLM extraction fallback. Catches people / company
  // facts that the deterministic heuristics missed on team / about / leadership
  // pages. No-op when GEMINI_API_KEY isn't set. Cap: 3 LLM calls per crawl.
  try {
    const env = await getRuntimeEnv();
    const enriched = await enrichWithLlm(
      {
        intel: outcome.intel,
        people: outcome.people,
        pages: outcome.pages
          .filter((p) => p.status === "fetched")
          .map((p) => ({
            url: p.finalUrl ?? p.url,
            title: p.title,
          })),
      },
      env
    );
    outcome.intel = enriched.intel;
    outcome.people = enriched.people;
  } catch {
    // LLM enrichment is a soft augment — it must never fail the crawl.
  }

  // Step 4: merge into the lead — fill blanks only, preserve user-verified fields.
  await mergeIntelIntoLead(db, opts.ownerId, lead.id, outcome);

  // Step 5: aggregate per-page findings into a website_audit row (if any pages succeeded).
  // Stream D: dedupe findings by code before persistence so "no canonical" doesn't
  // appear 5× in the UI. Severity bumps when ≥3 pages share the same issue.
  const dedupedFindings = dedupeFindings(outcome.findings);
  const successfulPages = outcome.pages.filter((p) => p.status === "fetched");
  const firstPage = successfulPages[0];
  if (firstPage) {
    const derivedCondition = deriveWebsiteCondition(dedupedFindings);
    try {
      await createAudit(db, opts.ownerId, {
        leadId: lead.id,
        requestedUrl: firstPage.url,
        finalUrl: firstPage.finalUrl,
        status: "success",
        httpStatus: firstPage.httpStatus,
        auditVersion: `${AUDIT_VERSION}+intel`,
        findings: dedupedFindings,
        metrics: {
          source: "server-fetch",
          pageWeightBytes: firstPage.bytes ?? undefined,
          loadMs: firstPage.elapsedMs ?? undefined,
          note: `Aggregated across ${successfulPages.length} crawled page(s).`,
        },
        startedAt,
        completedAt: new Date().toISOString(),
      });
      await updateLead(db, opts.ownerId, lead.id, {
        websiteCondition: derivedCondition,
        lastAuditedAt: new Date().toISOString(),
      });
    } catch {
      // Audit persistence is best-effort — the crawl itself is still valuable.
    }
  }

  // Stream E: synthesize outreach-ready brief via Gemini. Must never throw —
  // the deterministic `buildTemplateBrief` path is always available as a
  // fallback via the existing `generateBriefAction`. Dedupe: skip when a
  // prior brief for this lead is less than 24h old.
  try {
    const env = await getRuntimeEnv();
    const prior = await getLatestBrief(db, opts.ownerId, lead.id);
    const now = Date.now();
    const priorRecent =
      prior &&
      prior.createdAt &&
      now - new Date(prior.createdAt).getTime() < BRIEF_SYNTHESIS_DEDUPE_MS;

    if (!priorRecent) {
      const services = await listServiceOfferings(db, opts.ownerId);
      const synthesized = await synthesizeOutreachHooks(
        {
          intel: outcome.intel,
          people: outcome.people,
          findings: dedupedFindings,
          lead: {
            businessName: lead.businessName,
            niche: lead.niche,
            city: lead.city,
            country: lead.country,
          },
          services,
        },
        env
      );
      if (synthesized) {
        await createBrief(db, opts.ownerId, {
          leadId: lead.id,
          campaignId: null,
          ...synthesized,
        });
      } else {
        try {
          await createActivity(db, opts.ownerId, {
            leadId: lead.id,
            activityType: "lead_updated",
            title: "intel: skipped AI brief (no provider configured)",
            metadata: { jobId: opts.jobId },
          });
        } catch {
          /* non-fatal */
        }
      }
    }
  } catch {
    // Synthesis must NEVER fail the crawl.
  }

  // Step 6: upsert extracted people (preserve higher-confidence or user-verified data).
  let peopleFound = 0;
  for (const person of outcome.people) {
    try {
      await upsertPerson(db, opts.ownerId, {
        leadId: lead.id,
        jobId: opts.jobId,
        fullName: person.fullName,
        jobTitle: person.jobTitle,
        profileUrl: person.profileUrl,
        sourceUrl: person.sourceUrl,
        evidence: person.evidence ? { snippet: person.evidence } : undefined,
        confidence: person.confidence,
      });
      peopleFound++;
    } catch {
      // ignore duplicates / races
    }
  }

  // Step 7: lead_sources — anchor the crawl in the evidence trail.
  try {
    await db.insert(leadSources).values({
      id: crypto.randomUUID(),
      leadId: lead.id,
      sourceName: SOURCE_NAME,
      sourceUrl: opts.input.seedUrl,
      externalId: seedDomain,
      permittedStoragePolicy: "public-page-scrape-authorized",
      evidence: {
        jobId: opts.jobId,
        pagesFetched: successfulPages.length,
        intel: {
          emails: outcome.intel.emails.slice(0, 5),
          phones: outcome.intel.phones.slice(0, 5),
          socialUrls: outcome.intel.socialUrls.slice(0, 10),
          tech: outcome.intel.techIndicators,
        },
      },
    });
  } catch {
    // non-fatal
  }

  // Step 8: activity timeline entry
  try {
    await createActivity(db, opts.ownerId, {
      leadId: lead.id,
      activityType: "lead_updated",
      title: `Web Intelligence crawl: ${successfulPages.length} page(s)`,
      description: `${peopleFound} person(s) · ${outcome.findings.length} website finding(s)`,
      metadata: { jobId: opts.jobId, seedUrl: opts.input.seedUrl },
    });
  } catch {
    // non-fatal
  }

  // Step 9: close the job.
  const pagesFailed = outcome.pages.filter((p) => p.status === "failed" || p.status === "blocked").length;
  const status =
    successfulPages.length === 0
      ? "failed"
      : pagesFailed > 0
        ? "partial"
        : "completed";

  await updateCrawlJob(db, opts.ownerId, opts.jobId, {
    status,
    pagesFetched: successfulPages.length,
    pagesFailed,
    peopleFound,
    findingsCount: outcome.findings.length,
    errorSummary:
      status === "failed"
        ? "No crawled page succeeded — site may be unreachable or blocked by SSRF policy."
        : null,
    completedAt: new Date().toISOString(),
  });

  return {
    jobId: opts.jobId,
    leadId: lead.id,
    pagesFetched: successfulPages.length,
    pagesFailed,
    peopleFound,
    findingsCount: outcome.findings.length,
    intel: outcome.intel,
  };
}

async function resolveOrCreateLead(
  db: Db,
  opts: IntelRunOptions,
  domain: string
) {
  // If the caller already attached a leadId to the job (manual re-crawl), use it.
  const job = await getCrawlJob(db, opts.ownerId, opts.jobId);
  if (job?.leadId) {
    const existing = await getLead(db, opts.ownerId, job.leadId);
    if (existing) return existing;
  }

  const matched = await findLeadByDomain(db, opts.ownerId, domain);
  if (matched) return matched;

  const seedName = opts.input.seedLabel?.trim() || domain;
  return createLead(db, opts.ownerId, {
    businessName: seedName,
    niche: opts.input.niche ?? "",
    city: opts.input.city ?? "",
    region: opts.input.region,
    country: opts.input.country ?? "India",
    websiteUrl: opts.input.seedUrl,
    sourceName: SOURCE_NAME,
    sourceUrl: opts.input.seedUrl,
    sourceExternalId: domain,
    sourceLastCheckedAt: new Date().toISOString(),
  });
}

/**
 * Fill-only merge: never overwrites a lead field the user may already have
 * curated. Everything observed from the crawl is additive.
 */
async function mergeIntelIntoLead(
  db: Db,
  ownerId: string,
  leadId: string,
  outcome: CrawlOutcome
) {
  const lead = await getLead(db, ownerId, leadId);
  if (!lead) return;
  const patch: Record<string, unknown> = {};

  if (!lead.publicEmail && outcome.intel.emails.length > 0) {
    patch.publicEmail = outcome.intel.emails[0];
  }
  if (!lead.publicPhone && outcome.intel.phones.length > 0) {
    patch.publicPhone = outcome.intel.phones[0];
  }
  if (!lead.address && outcome.intel.address) {
    patch.address = outcome.intel.address;
  }
  if ((!lead.city || lead.city === "") && outcome.intel.city) {
    patch.city = outcome.intel.city;
  }
  if (!lead.region && outcome.intel.region) {
    patch.region = outcome.intel.region;
  }
  if (
    outcome.intel.name &&
    (lead.businessName === outcome.intel.domain ||
      lead.businessName.toLowerCase() === outcome.intel.domain)
  ) {
    patch.businessName = outcome.intel.name;
  }

  // Capture canonical URL + domain even if the lead was created without one.
  if (!lead.websiteUrl) {
    const canon = normalizeUrl(`https://${outcome.intel.domain}`);
    if (canon) patch.websiteUrl = canon;
  }

  if (Object.keys(patch).length > 0) {
    await updateLead(db, ownerId, leadId, patch);
  }
}

/** Public API for the cancel action. */
export async function cancelIntelJob(
  db: Db,
  ownerId: string,
  jobId: string
): Promise<void> {
  await cancelCrawlJob(db, ownerId, jobId);
}

