/**
 * Phase 1 domain types for the in-memory demo mode.
 *
 * These shadow the Cloudflare D1 schema that lands in Phase 2 (spec §12) but
 * omit database-only fields (owner_id, timestamps that aren't user-facing).
 * When D1 is wired in Phase 2, these types will be replaced by Drizzle-inferred
 * types from `src/lib/db/schema.ts`.
 */

export type PipelineStage =
  | "new"
  | "reviewing"
  | "qualified"
  | "contacted"
  | "replied"
  | "meeting_booked"
  | "proposal_sent"
  | "won"
  | "lost"
  | "not_a_fit";

export type WebsiteCondition =
  | "no_website"
  | "inaccessible"
  | "outdated"
  | "weak"
  | "acceptable"
  | "strong"
  | "unknown";

export type EvidenceConfidence = "low" | "medium" | "high" | "insufficient";

export type DoNotContact = {
  flagged: boolean;
  reason?: string;
  flaggedAt?: string;
};

export type ScoreFactor = {
  code: string;
  label: string;
  points: number;
  evidence: string;
  evidenceUrl?: string;
};

export type ScoreBreakdown = {
  total: number;
  version: string;
  computedAt: string;
  confidence: EvidenceConfidence;
  factors: ScoreFactor[];
  band:
    | "priority_review"
    | "strong_candidate"
    | "needs_manual_review"
    | "low_priority"
    | "insufficient_evidence";
};

export type AuditFindingSeverity = "info" | "low" | "medium" | "high";
export type AuditFindingConfidence = "low" | "medium" | "high";

export type AuditFinding = {
  code: string;
  title: string;
  severity: AuditFindingSeverity;
  description: string;
  evidence?: string;
  evidenceUrl?: string;
  confidence: AuditFindingConfidence;
  recommendation: string;
};

export type WebsiteAudit = {
  id: string;
  leadId: string;
  requestedUrl: string;
  finalUrl?: string;
  status: "success" | "partial" | "blocked" | "unavailable" | "failed";
  httpStatus?: number;
  auditVersion: string;
  startedAt: string;
  completedAt?: string;
  findings: AuditFinding[];
  metrics?: {
    source: "server-fetch" | "pagespeed";
    pageWeightBytes?: number;
    loadMs?: number;
    note?: string;
  };
  errorCategory?: string;
};

export type OpportunityBrief = {
  id: string;
  leadId: string;
  campaignId?: string;
  summary: string;
  observations: Array<{
    observation: string;
    evidence: string;
    evidenceUrl?: string;
  }>;
  possibleOpportunity: string;
  recommendedService: string;
  suggestedDeliverable: string;
  confidence: AuditFindingConfidence;
  unknowns: string[];
  createdAt: string;
  source: "template" | "ai";
  modelMetadata?: { provider: string; model: string };
};

export type OutreachChannel =
  | "email"
  | "contact_form"
  | "instagram_dm"
  | "linkedin_manual"
  | "other";

export type OutreachStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "contacted"
  | "replied"
  | "archived";

export type OutreachDraft = {
  id: string;
  leadId: string;
  campaignId?: string;
  channel: OutreachChannel;
  subject?: string;
  body: string;
  personalizationEvidence: string[];
  status: OutreachStatus;
  approvedAt?: string;
  contactedAt?: string;
  repliedAt?: string;
  needsHumanReview: true;
  createdAt: string;
  updatedAt: string;
  source: "template" | "ai";
};

export type Lead = {
  id: string;
  businessName: string;
  normalizedName: string;
  category: string;
  niche: string;
  websiteUrl?: string;
  normalizedDomain?: string;
  publicEmail?: string;
  publicPhone?: string;
  address?: string;
  city: string;
  region?: string;
  country: string;
  sourceName: string;
  sourceUrl?: string;
  sourceExternalId?: string;
  sourceLastCheckedAt?: string;
  websiteCondition: WebsiteCondition;
  pipelineStage: PipelineStage;
  score?: ScoreBreakdown;
  estimatedDealValue?: number;
  currency: string;
  lossReason?: string;
  lastContactedAt?: string;
  nextActionAt?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  doNotContact: DoNotContact;
  tags: string[];
};

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  niche: string;
  geography: { city?: string; region?: string; country?: string };
  idealCustomerDescription: string;
  offer: string;
  valueProposition: string;
  caseStudyUrl?: string;
  minimumScore: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskType =
  | "review_lead"
  | "verify_contact"
  | "send_approved_message"
  | "follow_up"
  | "prepare_proposal"
  | "book_meeting"
  | "other";

export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

export type Task = {
  id: string;
  title: string;
  taskType: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  leadId?: string;
  campaignId?: string;
  dueAt?: string;
  notes?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityType =
  | "lead_created"
  | "lead_updated"
  | "stage_changed"
  | "note_added"
  | "audit_run"
  | "score_computed"
  | "draft_created"
  | "draft_approved"
  | "contact_logged"
  | "reply_logged"
  | "meeting_booked"
  | "proposal_sent"
  | "outcome_recorded";

export type Activity = {
  id: string;
  leadId?: string;
  campaignId?: string;
  activityType: ActivityType;
  title: string;
  description?: string;
  createdAt: string;
};

export type ServiceOffering = {
  id: string;
  name: string;
  description: string;
  idealCustomer: string;
  valueProposition: string;
  caseStudyUrl?: string;
  isActive: boolean;
};

export type DiscoveryJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type DiscoveryJob = {
  id: string;
  sourceName: string;
  campaignId?: string;
  input: {
    niche: string;
    city?: string;
    keywords?: string;
    resultLimit: number;
  };
  status: DiscoveryJobStatus;
  progressCurrent: number;
  progressTotal: number;
  resultCount: number;
  errorSummary?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
};
