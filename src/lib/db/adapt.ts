/**
 * Adapters between DB row shapes and the view-facing types defined in
 * `src/lib/demo/types.ts`.
 *
 * Phase 1 defined the view-model types first (around the UI needs); Phase 2
 * added D1 schema with a slightly flatter column layout. These adapters bridge
 * the two so Phase 1 page components keep working against repository output.
 * In Phase 5+ we may collapse the view-model into Drizzle-inferred types once
 * every page has stabilized.
 */

import { scoreBandFor, type EvidenceConfidence, type ScoreBand } from "./normalize";
import type {
  Activity as ActivityRow,
  Campaign as CampaignRow,
  DiscoveryJob as DiscoveryJobRow,
  Lead as LeadRow,
  OpportunityBrief as BriefRow,
  OutreachDraft as DraftRow,
  Task as TaskRow,
  WebsiteAudit as AuditRow,
  ServiceOffering as ServiceRow,
} from "./schema";
import type {
  Activity as ActivityView,
  Campaign as CampaignView,
  DiscoveryJob as DiscoveryJobView,
  Lead as LeadView,
  OpportunityBrief as BriefView,
  OutreachDraft as DraftView,
  ScoreBreakdown,
  Task as TaskView,
  WebsiteAudit as AuditView,
  ServiceOffering as ServiceView,
} from "@/lib/demo/types";

/* -----------------------------------------------------------------
 * Lead
 * ----------------------------------------------------------------- */

export function rowToLead(row: LeadRow): LeadView {
  let score: ScoreBreakdown | undefined;
  if (row.fitScore != null && row.scoreVersion && row.scoredAt && row.scoreBand) {
    score = {
      total: row.fitScore,
      version: row.scoreVersion,
      computedAt: row.scoredAt,
      confidence: row.evidenceConfidence as EvidenceConfidence,
      factors: row.scoreBreakdown ?? [],
      band: row.scoreBand as ScoreBand,
    };
  }
  return {
    id: row.id,
    businessName: row.businessName,
    normalizedName: row.normalizedName,
    category: row.category,
    niche: row.niche,
    websiteUrl: row.websiteUrl ?? undefined,
    normalizedDomain: row.normalizedDomain ?? undefined,
    publicEmail: row.publicEmail ?? undefined,
    publicPhone: row.publicPhone ?? undefined,
    address: row.address ?? undefined,
    city: row.city,
    region: row.region ?? undefined,
    country: row.country,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl ?? undefined,
    sourceExternalId: row.sourceExternalId ?? undefined,
    sourceLastCheckedAt: row.sourceLastCheckedAt ?? undefined,
    websiteCondition: row.websiteCondition,
    pipelineStage: row.pipelineStage,
    score,
    estimatedDealValue: row.estimatedDealValue ?? undefined,
    currency: row.currency,
    lossReason: row.lossReason ?? undefined,
    lastContactedAt: row.lastContactedAt ?? undefined,
    nextActionAt: row.nextActionAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? undefined,
    doNotContact: {
      flagged: row.doNotContact,
      reason: row.doNotContactReason ?? undefined,
      flaggedAt: row.doNotContactAt ?? undefined,
    },
    tags: row.tags ?? [],
  };
}

/** Compute DB columns from a score breakdown. Keeps band derivation here. */
export function scoreBreakdownToColumns(score: ScoreBreakdown) {
  return {
    fitScore: score.total,
    evidenceConfidence: score.confidence,
    scoreBand:
      score.band ?? scoreBandFor(score.total, score.confidence),
    scoreBreakdown: score.factors,
    scoreVersion: score.version,
    scoredAt: score.computedAt,
  };
}

/* -----------------------------------------------------------------
 * Campaign
 * ----------------------------------------------------------------- */

export function rowToCampaign(row: CampaignRow): CampaignView {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    niche: row.niche,
    geography: row.geography ?? {},
    idealCustomerDescription: row.idealCustomerDescription,
    offer: row.offer,
    valueProposition: row.valueProposition,
    caseStudyUrl: row.caseStudyUrl ?? undefined,
    minimumScore: row.minimumScore,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* -----------------------------------------------------------------
 * Task
 * ----------------------------------------------------------------- */

export function rowToTask(row: TaskRow): TaskView {
  return {
    id: row.id,
    title: row.title,
    taskType: row.taskType,
    priority: row.priority,
    status: row.status,
    leadId: row.leadId ?? undefined,
    campaignId: row.campaignId ?? undefined,
    dueAt: row.dueAt ?? undefined,
    notes: row.notes ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* -----------------------------------------------------------------
 * Draft
 * ----------------------------------------------------------------- */

export function rowToDraft(row: DraftRow): DraftView {
  return {
    id: row.id,
    leadId: row.leadId,
    campaignId: row.campaignId ?? undefined,
    channel: row.channel,
    subject: row.subject ?? undefined,
    body: row.body,
    personalizationEvidence: row.personalizationEvidence ?? [],
    status: row.status,
    approvedAt: row.approvedAt ?? undefined,
    contactedAt: row.contactedAt ?? undefined,
    repliedAt: row.repliedAt ?? undefined,
    needsHumanReview: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: row.source,
  };
}

/* -----------------------------------------------------------------
 * Activity
 * ----------------------------------------------------------------- */

export function rowToActivity(row: ActivityRow): ActivityView {
  return {
    id: row.id,
    leadId: row.leadId ?? undefined,
    campaignId: row.campaignId ?? undefined,
    activityType: row.activityType as ActivityView["activityType"],
    title: row.title,
    description: row.description ?? undefined,
    createdAt: row.createdAt,
  };
}

/* -----------------------------------------------------------------
 * Audit
 * ----------------------------------------------------------------- */

export function rowToAudit(row: AuditRow): AuditView {
  return {
    id: row.id,
    leadId: row.leadId,
    requestedUrl: row.requestedUrl,
    finalUrl: row.finalUrl ?? undefined,
    status: row.status,
    httpStatus: row.httpStatus ?? undefined,
    auditVersion: row.auditVersion,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    findings: row.findings ?? [],
    metrics: row.metrics ?? undefined,
    errorCategory: row.errorCategory ?? undefined,
  };
}

/* -----------------------------------------------------------------
 * Brief
 * ----------------------------------------------------------------- */

export function rowToBrief(row: BriefRow): BriefView {
  return {
    id: row.id,
    leadId: row.leadId,
    campaignId: row.campaignId ?? undefined,
    summary: row.summary,
    observations: row.observations ?? [],
    possibleOpportunity: row.possibleOpportunity,
    recommendedService: row.recommendedService,
    suggestedDeliverable: row.suggestedDeliverable,
    confidence: row.confidence,
    unknowns: row.unknowns ?? [],
    createdAt: row.createdAt,
    source: row.source,
    modelMetadata: row.modelMetadata ?? undefined,
  };
}

/* -----------------------------------------------------------------
 * Discovery job
 * ----------------------------------------------------------------- */

export function rowToDiscoveryJob(row: DiscoveryJobRow): DiscoveryJobView {
  const input = row.input ?? {};
  return {
    id: row.id,
    sourceName: row.sourceName,
    campaignId: row.campaignId ?? undefined,
    input: {
      niche: typeof input.niche === "string" ? input.niche : "",
      city: typeof input.city === "string" ? input.city : undefined,
      keywords: typeof input.keywords === "string" ? input.keywords : undefined,
      resultLimit:
        typeof input.resultLimit === "number" ? input.resultLimit : 0,
    },
    status: row.status,
    progressCurrent: row.progressCurrent,
    progressTotal: row.progressTotal,
    resultCount: row.resultCount,
    errorSummary: row.errorSummary ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

/* -----------------------------------------------------------------
 * Service offering
 * ----------------------------------------------------------------- */

export function rowToServiceOffering(row: ServiceRow): ServiceView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    idealCustomer: row.idealCustomer,
    valueProposition: row.valueProposition,
    caseStudyUrl: row.caseStudyUrl ?? undefined,
    isActive: row.isActive,
  };
}
