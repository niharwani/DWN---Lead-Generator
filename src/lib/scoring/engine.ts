/**
 * Deterministic lead-scoring engine (spec §10).
 *
 * The engine is a pure function: given a lead, its latest audit, optional
 * campaign, service offerings, and weight config, it returns a
 * `ScoreBreakdown` with per-factor contributions and evidence. The engine
 * takes no `Date.now()` — the caller passes `nowIso` so re-running the same
 * inputs always returns an identical result (spec §10 idempotency rule).
 *
 * The engine is also workload-free: no DB access, no network, no file I/O.
 * The repository layer loads inputs and persists the breakdown; this file
 * only computes.
 */

import { clampScore, scoreBandFor, type EvidenceConfidence } from "@/lib/db/normalize";
import type {
  AuditFinding,
  Campaign,
  Lead,
  OpportunityBrief,
  ScoreBreakdown,
  ScoreFactor,
  ServiceOffering,
  WebsiteAudit,
} from "@/lib/demo/types";

export const SCORE_VERSION = "scoring/v0.2";

/* -----------------------------------------------------------------
 * Factor catalogue + default weights
 * -----------------------------------------------------------------
 * Points are the spec §10 starting weights; the user can override every one
 * from Settings (phase 5 adds the UI). `enabled: false` zeroes out a factor
 * without losing its definition.
 */

export type ScoreFactorCode =
  | "no_website"
  | "inaccessible"
  | "outdated"
  | "missing_viewport"
  | "missing_contact_path"
  | "missing_https"
  | "heavy_page"
  | "niche_match"
  | "service_fit"
  | "useful_contact_path"
  | "low_evidence_penalty"
  | "strong_site_penalty";

export type FactorWeight = {
  points: number;
  enabled: boolean;
};

export type WeightMap = Record<ScoreFactorCode, FactorWeight>;

/**
 * Default weights. The spec table (§10) is the ground truth; a few extras
 * fall out of the audit engine we built in Phase 4 (missing viewport, no
 * HTTPS, heavy page).
 */
export const DEFAULT_WEIGHTS: WeightMap = {
  no_website: { points: 20, enabled: true },
  inaccessible: { points: 15, enabled: true },
  outdated: { points: 15, enabled: true },
  missing_viewport: { points: 5, enabled: true },
  missing_contact_path: { points: 10, enabled: true },
  missing_https: { points: 10, enabled: true },
  heavy_page: { points: 5, enabled: true },
  niche_match: { points: 10, enabled: true },
  service_fit: { points: 15, enabled: true },
  useful_contact_path: { points: 5, enabled: true },
  low_evidence_penalty: { points: -15, enabled: true },
  strong_site_penalty: { points: -10, enabled: true },
};

export const FACTOR_LABELS: Record<ScoreFactorCode, string> = {
  no_website: "No website found",
  inaccessible: "Website repeatedly inaccessible",
  outdated: "Website visibly outdated or thin",
  missing_viewport: "Missing viewport metadata",
  missing_contact_path: "Missing contact / enquiry path",
  missing_https: "Site served over HTTP, not HTTPS",
  heavy_page: "Homepage is unusually heavy",
  niche_match: "Target niche match",
  service_fit: "Strong fit with a service offering",
  useful_contact_path: "Useful public contact path",
  low_evidence_penalty: "Low evidence confidence penalty",
  strong_site_penalty: "Already has a strong site (nothing to improve)",
};

/* -----------------------------------------------------------------
 * Engine inputs + output
 * ----------------------------------------------------------------- */

export type ScoreInputs = {
  lead: Lead;
  audit?: WebsiteAudit;
  campaign?: Campaign;
  services?: ServiceOffering[];
  weights?: WeightMap;
  /**
   * Stable `computedAt` timestamp. Omitting it uses the audit's `startedAt`
   * when present, or an empty string otherwise. Callers that need
   * production wall-clock behaviour should pass `new Date().toISOString()`.
   */
  nowIso?: string;
  /**
   * Optional pre-evaluated custom factor entries to append to the breakdown
   * before clamping. Produced by `evaluateCustomFactors()` in custom-factors.ts.
   * When omitted, the score is identical to the pre-Phase-C result.
   */
  customFactors?: ScoreFactor[];
};

export type ScoreResult = ScoreBreakdown & {
  /**
   * Which `ScoreFactorCode`s actually fired. Useful for the brief generator
   * and for test assertions. Empty when the result is `insufficient_evidence`.
   */
  firedCodes: ScoreFactorCode[];
};

/* -----------------------------------------------------------------
 * Public entry point
 * ----------------------------------------------------------------- */

export function scoreLead(inputs: ScoreInputs): ScoreResult {
  const weights = inputs.weights ?? DEFAULT_WEIGHTS;
  const now =
    inputs.nowIso ?? inputs.audit?.startedAt ?? inputs.lead.updatedAt ?? "";
  const confidence = deriveConfidence(inputs);

  // Insufficient-evidence short-circuit: don't fabricate a numeric score when
  // we literally have nothing to score on. Spec §10 rule.
  if (confidence === "insufficient") {
    const factors: ScoreFactor[] = [
      {
        code: "insufficient_evidence",
        label: "Insufficient evidence to score",
        points: 0,
        evidence:
          "No website, no verified contact path, and no public source URL to anchor the audit.",
      },
    ];
    return {
      total: 0,
      version: SCORE_VERSION,
      computedAt: now,
      confidence: "insufficient",
      band: "insufficient_evidence",
      factors,
      firedCodes: [],
    };
  }

  const fired: ScoreFactor[] = [];
  const firedCodes: ScoreFactorCode[] = [];

  const add = (code: ScoreFactorCode, evidence: string, evidenceUrl?: string) => {
    const w = weights[code];
    if (!w || !w.enabled) return;
    fired.push({
      code,
      label: FACTOR_LABELS[code],
      points: w.points,
      evidence,
      ...(evidenceUrl ? { evidenceUrl } : {}),
    });
    firedCodes.push(code);
  };

  evaluateWebsiteFactors(inputs, add);
  evaluateAuditFactors(inputs, add);
  evaluateCampaignFactors(inputs, add);
  evaluateContactFactors(inputs, add);
  evaluateConfidencePenalty(inputs, confidence, add);

  // Append custom factors provided by the caller (from evaluateCustomFactors).
  // These are pre-evaluated — we just push them into the fired array.
  if (inputs.customFactors && inputs.customFactors.length > 0) {
    for (const cf of inputs.customFactors) {
      fired.push(cf);
    }
  }

  // Order factors by magnitude descending so the UI puts the most impactful
  // bullet at the top. Stable ordering falls back to code name.
  fired.sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.code.localeCompare(b.code));

  const rawTotal = fired.reduce((sum, f) => sum + f.points, 0);
  const total = clampScore(rawTotal);
  const band = scoreBandFor(total, confidence);

  return {
    total,
    version: SCORE_VERSION,
    computedAt: now,
    confidence,
    band,
    factors: fired,
    firedCodes,
  };
}

/* -----------------------------------------------------------------
 * Confidence derivation
 * -----------------------------------------------------------------
 * `insufficient` fires when we have literally nothing to anchor the audit
 * against. Otherwise we tier: `high` (website + successful audit), `medium`
 * (one of the two), `low` (only sparse profile signals).
 */

export function deriveConfidence(inputs: ScoreInputs): EvidenceConfidence {
  const { lead, audit } = inputs;
  const hasWebsite = Boolean(lead.websiteUrl);
  const hasAudit = audit && audit.status === "success";
  const hasVerifiedContact = Boolean(lead.publicEmail || lead.publicPhone);
  const hasSourceUrl = Boolean(lead.sourceUrl);

  if (!hasWebsite && !hasVerifiedContact && !hasSourceUrl) return "insufficient";
  if (hasWebsite && hasAudit) return "high";
  if (hasWebsite || hasAudit || hasVerifiedContact) return "medium";
  return "low";
}

/* -----------------------------------------------------------------
 * Factor evaluators
 * ----------------------------------------------------------------- */

type AddFn = (
  code: ScoreFactorCode,
  evidence: string,
  evidenceUrl?: string
) => void;

function evaluateWebsiteFactors(inputs: ScoreInputs, add: AddFn): void {
  const { lead } = inputs;
  if (!lead.websiteUrl || lead.websiteCondition === "no_website") {
    add(
      "no_website",
      `No public website reachable at any variant of ${lead.businessName}.`,
      lead.sourceUrl
    );
  }
}

function evaluateAuditFactors(inputs: ScoreInputs, add: AddFn): void {
  const { lead, audit } = inputs;
  if (!audit) {
    // Still cover a lead whose condition says "inaccessible" / "outdated"
    // even though no audit row exists yet. Keeps the engine useful before
    // Phase 4 ran.
    if (lead.websiteCondition === "inaccessible") {
      add(
        "inaccessible",
        `Website condition manually set to "inaccessible".`,
        lead.websiteUrl ?? undefined
      );
    } else if (lead.websiteCondition === "outdated" || lead.websiteCondition === "weak") {
      add(
        "outdated",
        `Website condition manually set to "${lead.websiteCondition}".`,
        lead.websiteUrl ?? undefined
      );
    } else if (lead.websiteCondition === "strong") {
      add(
        "strong_site_penalty",
        `Website condition is "strong" — no obvious improvement to pitch.`,
        lead.websiteUrl ?? undefined
      );
    }
    return;
  }

  // Audit-based factors
  if (audit.status === "unavailable" || audit.status === "failed") {
    add(
      "inaccessible",
      `Audit returned ${audit.status}${audit.httpStatus ? ` (HTTP ${audit.httpStatus})` : ""}. ${audit.findings[0]?.description ?? ""}`.trim(),
      audit.requestedUrl
    );
    return;
  }

  const findingCodes = new Set(audit.findings.map((f) => f.code));
  const highs = audit.findings.filter((f) => f.severity === "high").length;
  const mediums = audit.findings.filter((f) => f.severity === "medium").length;

  // Outdated: either multiple medium findings or a non-high condition flag.
  if (highs >= 2 || mediums >= 3 || lead.websiteCondition === "outdated" || lead.websiteCondition === "weak") {
    const topEv = audit.findings.find((f) => f.severity === "high" || f.severity === "medium");
    add(
      "outdated",
      `Audit surfaced ${highs} high, ${mediums} medium findings. ${topEv ? `Top signal: ${topEv.title}.` : ""}`.trim(),
      audit.finalUrl ?? audit.requestedUrl
    );
  }

  if (findingCodes.has("missing_viewport")) {
    const f = audit.findings.find((x) => x.code === "missing_viewport");
    add("missing_viewport", f?.evidence ?? "Audit found no viewport metadata.", f?.evidenceUrl);
  }
  if (findingCodes.has("weak_contact_path")) {
    const f = audit.findings.find((x) => x.code === "weak_contact_path");
    add(
      "missing_contact_path",
      f?.evidence ?? "No mailto:, tel:, or /contact-style link found on the homepage.",
      f?.evidenceUrl
    );
  }
  if (findingCodes.has("no_https")) {
    const f = audit.findings.find((x) => x.code === "no_https");
    add("missing_https", f?.evidence ?? "Site served over HTTP, not HTTPS.", f?.evidenceUrl);
  }
  if (findingCodes.has("heavy_page")) {
    const f = audit.findings.find((x) => x.code === "heavy_page");
    add("heavy_page", f?.evidence ?? "Homepage HTML exceeds the typical weight threshold.", f?.evidenceUrl);
  }

  // Strong-site penalty: a clean successful audit with no high/medium findings.
  if (audit.status === "success" && highs === 0 && mediums === 0 && lead.websiteCondition !== "no_website") {
    add(
      "strong_site_penalty",
      "Audit found no high- or medium-severity issues. No obvious website improvement to pitch.",
      audit.finalUrl ?? audit.requestedUrl
    );
  }
}

function evaluateCampaignFactors(inputs: ScoreInputs, add: AddFn): void {
  const { lead, campaign, services } = inputs;

  if (campaign && campaign.niche && lead.niche === campaign.niche) {
    add("niche_match", `Lead niche "${lead.niche}" matches campaign "${campaign.name}".`);
  }

  if (services && services.length > 0) {
    const match = matchServiceOffering({
      lead,
      audit: inputs.audit,
      services,
    });
    if (match) {
      add(
        "service_fit",
        `Matched ${match.service.name} — ${match.reason}.`
      );
    }
  }
}

function evaluateContactFactors(inputs: ScoreInputs, add: AddFn): void {
  const { lead } = inputs;
  if (lead.publicEmail || lead.publicPhone) {
    const parts: string[] = [];
    if (lead.publicEmail) parts.push("public email");
    if (lead.publicPhone) parts.push("public phone");
    add(
      "useful_contact_path",
      `Verified ${parts.join(" + ")} on the public business profile.`,
      lead.sourceUrl ?? lead.websiteUrl ?? undefined
    );
  }
}

function evaluateConfidencePenalty(
  inputs: ScoreInputs,
  confidence: EvidenceConfidence,
  add: AddFn
): void {
  if (confidence === "low") {
    add(
      "low_evidence_penalty",
      "Fewer than two independent signals verified — reduce confidence until decision-maker is confirmed."
    );
  }
}

/* -----------------------------------------------------------------
 * Service-fit matcher
 * -----------------------------------------------------------------
 * Picks the single most defensible service offering based on observable
 * evidence. The ordering is deliberately conservative: audit-driven matches
 * first (highest confidence), then niche heuristics, then a fallback.
 */

export type ServiceMatch = {
  service: ServiceOffering;
  reason: string;
};

const NICHE_SERVICE_HINTS: Array<{ pattern: RegExp; serviceName: RegExp }> = [
  { pattern: /d2c|consumer brand|shopify|e[- ]?commerce/i, serviceName: /e-?commerce/i },
  { pattern: /smb operations|automation|logistics|operations/i, serviceName: /automation|internal tools|custom software/i },
  { pattern: /consultants|professional services|advisory/i, serviceName: /website|brand/i },
  { pattern: /restaurant|hospitality|café|cafe|hotel/i, serviceName: /website|landing/i },
  { pattern: /clinic|dental|dermatology|ayurveda|wellness/i, serviceName: /website|landing/i },
  { pattern: /interior|architect|design studio|jeweller|jewellery|luxury/i, serviceName: /website|brand/i },
];

export function matchServiceOffering(input: {
  lead: Lead;
  audit?: WebsiteAudit;
  services: ServiceOffering[];
}): ServiceMatch | null {
  const [first, ...rest] = input.services.filter((s) => s.isActive);
  if (!first) return null;
  const active: [ServiceOffering, ...ServiceOffering[]] = [first, ...rest];

  const findBy = (re: RegExp): ServiceOffering | undefined =>
    active.find((s) => re.test(s.name) || re.test(s.description) || re.test(s.idealCustomer));

  // 1. No-website → website build.
  if (!input.lead.websiteUrl || input.lead.websiteCondition === "no_website") {
    const svc = findBy(/website/i) ?? active[0];
    return { service: svc, reason: "no public website today — a brand site is the first pitch" };
  }

  // 2. Audit says inaccessible → website rebuild.
  if (input.audit && (input.audit.status === "unavailable" || input.audit.status === "failed")) {
    const svc = findBy(/website/i) ?? active[0];
    return { service: svc, reason: "existing site unreachable — rebuild is a credible first conversation" };
  }

  // 3. Audit surfaced conversion / CTA problems → landing page.
  const auditCodes = new Set(input.audit?.findings.map((f) => f.code) ?? []);
  if (auditCodes.has("cta_hierarchy") || auditCodes.has("weak_landing")) {
    const svc = findBy(/landing/i) ?? findBy(/website/i) ?? active[0];
    return { service: svc, reason: "audit found conflicting / weak CTAs — a landing-page rebuild is the sharper offer" };
  }

  // 4. E-commerce / theme-age signals → e-commerce.
  if (auditCodes.has("old_theme")) {
    const svc = findBy(/e-?commerce/i) ?? findBy(/website/i) ?? active[0];
    return { service: svc, reason: "audit flagged an outdated storefront theme" };
  }

  // 5. Niche hints.
  for (const hint of NICHE_SERVICE_HINTS) {
    if (hint.pattern.test(input.lead.niche) || hint.pattern.test(input.lead.category)) {
      const svc = findBy(hint.serviceName);
      if (svc) return { service: svc, reason: `niche "${input.lead.niche}" aligns with this service` };
    }
  }

  // 6. Default: whichever service the owner has at the top of the active list.
  return { service: active[0], reason: "best-available fit — swap in Settings if a different service is a stronger pitch" };
}

/* -----------------------------------------------------------------
 * Template-based opportunity brief (spec §11, template fallback)
 * -----------------------------------------------------------------
 * Pure function so tests can assert exact strings. The server action
 * persists the result via `createBrief`.
 */

export type BriefInputs = {
  lead: Lead;
  score?: ScoreBreakdown;
  audit?: WebsiteAudit;
  campaign?: Campaign;
  services: ServiceOffering[];
  nowIso?: string;
};

export type BriefResult = Omit<OpportunityBrief, "id" | "createdAt"> & {
  createdAt: string;
};

export function buildTemplateBrief(inputs: BriefInputs): BriefResult {
  const { lead, score, audit, campaign, services } = inputs;
  const now = inputs.nowIso ?? "";
  const match = matchServiceOffering({ lead, audit, services });
  const service = match?.service;

  // Confidence: downgrade from score.confidence when it's "insufficient",
  // since brief outputs are confidence-rated low/medium/high only.
  const confidence: OpportunityBrief["confidence"] =
    score?.confidence === "high"
      ? "high"
      : score?.confidence === "low" || score?.confidence === "insufficient"
        ? "low"
        : "medium";

  const observations: OpportunityBrief["observations"] = [];
  if (audit) {
    for (const f of audit.findings.slice(0, 4)) {
      if (f.severity === "info") continue;
      observations.push({
        observation: f.title,
        evidence: f.evidence ?? f.description,
        ...(f.evidenceUrl ? { evidenceUrl: f.evidenceUrl } : {}),
      });
    }
  }
  if (!lead.websiteUrl) {
    observations.push({
      observation: `${lead.businessName} has no reachable public website today.`,
      evidence: lead.sourceUrl
        ? `Verified via ${lead.sourceUrl}`
        : "Verified by domain lookup and manual search.",
      ...(lead.sourceUrl ? { evidenceUrl: lead.sourceUrl } : {}),
    });
  }
  if (lead.publicEmail || lead.publicPhone) {
    const parts: string[] = [];
    if (lead.publicEmail) parts.push("email");
    if (lead.publicPhone) parts.push("phone");
    observations.push({
      observation: `Public ${parts.join(" + ")} available for outreach.`,
      evidence: `From ${lead.sourceName} profile.`,
    });
  }

  const summary = buildSummary({ lead, audit, service, campaign });
  const possibleOpportunity = buildOpportunity({ lead, service, audit });
  const suggestedDeliverable = service
    ? buildDeliverable({ service, lead })
    : "To be scoped once the opportunity is confirmed.";

  const unknowns = buildUnknowns({ lead, audit });

  return {
    leadId: lead.id,
    campaignId: campaign?.id,
    summary,
    observations,
    possibleOpportunity,
    recommendedService: service?.name ?? "Service to be chosen once scope is confirmed",
    suggestedDeliverable,
    confidence,
    unknowns,
    source: "template",
    createdAt: now,
  };
}

function buildSummary(input: {
  lead: Lead;
  audit?: WebsiteAudit;
  service?: ServiceOffering;
  campaign?: Campaign;
}): string {
  const { lead, audit, campaign } = input;
  const nicheClause = lead.niche ? ` ${lead.niche.toLowerCase()}` : "";
  const cityClause = lead.city ? ` in ${lead.city}` : "";
  const siteClause = (() => {
    if (!lead.websiteUrl) return "They have no reachable public website today.";
    if (audit?.status === "unavailable" || audit?.status === "failed") {
      return "Their website has been intermittently unreachable in audits.";
    }
    if (lead.websiteCondition === "outdated") return "Their current site is visibly out of date.";
    if (lead.websiteCondition === "weak") return "Their current site has clear conversion gaps.";
    if (lead.websiteCondition === "strong") return "Their current site is already in strong shape.";
    return "A standard audit of their current site surfaced the signals below.";
  })();
  const campaignClause = campaign ? ` Flagged under the ${campaign.name} campaign.` : "";
  return `${lead.businessName} is a${nicheClause} business${cityClause}. ${siteClause}${campaignClause}`.trim();
}

function buildOpportunity(input: {
  lead: Lead;
  service?: ServiceOffering;
  audit?: WebsiteAudit;
}): string {
  const { lead, service, audit } = input;
  if (!service) {
    return "No service offering matches the current evidence. Review the lead manually before pitching.";
  }
  if (!lead.websiteUrl) {
    return `A focused ${service.name.toLowerCase()} that gives ${lead.businessName} a credible public home. ${service.valueProposition}`;
  }
  if (audit?.status === "unavailable" || audit?.status === "failed") {
    return `A rebuild of ${lead.businessName}'s public site — their current one is effectively offline. ${service.valueProposition}`;
  }
  if (audit && audit.findings.some((f) => f.severity === "high")) {
    return `${service.name} focused on the high-severity findings surfaced in the audit. ${service.valueProposition}`;
  }
  return `${service.name} as the first conversation. ${service.valueProposition}`;
}

function buildDeliverable(input: { service: ServiceOffering; lead: Lead }): string {
  const name = input.service.name.toLowerCase();
  if (/website/.test(name)) {
    return `A 5–8 page brand site with a working enquiry path, built mobile-first.`;
  }
  if (/e-?commerce/.test(name)) {
    return `A storefront redesign focused on product storytelling and checkout performance.`;
  }
  if (/landing/.test(name)) {
    return `A single-focus landing page with one primary action, tuned for the current paid-traffic audience.`;
  }
  if (/automation|internal tools|software/.test(name)) {
    return `A 4-week scoped sprint — one workflow replaced end-to-end with proper tooling.`;
  }
  if (/brand/.test(name)) {
    return `A refreshed identity system (logo, type, color, usage guide) rolled out across the primary digital surfaces.`;
  }
  return `A scoped engagement delivering ${input.service.name.toLowerCase()} for ${input.lead.businessName}.`;
}

function buildUnknowns(input: { lead: Lead; audit?: WebsiteAudit }): string[] {
  const unknowns: string[] = [];
  unknowns.push("Who is the decision-maker for digital initiatives?");
  if (!input.lead.publicEmail && !input.lead.publicPhone) {
    unknowns.push("Is there a usable direct contact beyond the public source?");
  }
  if (input.audit?.status === "unavailable" || input.audit?.status === "failed") {
    unknowns.push("Is the current hosting a lapsed renewal or a deliberate pause?");
  }
  if (!input.audit && input.lead.websiteUrl) {
    unknowns.push("Audit not yet run — site condition is unverified.");
  }
  if (!input.lead.publicEmail && input.lead.publicPhone) {
    unknowns.push("Would email outreach be preferred over phone?");
  }
  return unknowns;
}
