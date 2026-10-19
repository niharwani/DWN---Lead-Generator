/**
 * Drizzle schema for Cloudflare D1 (SQLite).
 *
 * Mirrors the conceptual relationships in spec §12 with these SQLite-specific
 * adaptations (vs. the Postgres-style spec):
 *   - UUIDs are TEXT, populated at insert time with crypto.randomUUID().
 *   - Timestamps are TEXT ISO-8601 strings in UTC (consistent with Phase 1 fixtures).
 *   - JSON columns are TEXT storing JSON.stringify output. Read/write through
 *     the small helpers in `./json.ts`.
 *   - Booleans are INTEGER with 0/1 values (SQLite has no native bool).
 *   - Enum-like columns are TEXT; CHECK constraints live in the migration SQL,
 *     not Drizzle, since drizzle-orm/sqlite-core doesn't expose them yet.
 *
 * Row-level security: Cloudflare D1 / SQLite has NO RLS. Every repository
 * query filters by owner_id server-side. See `src/lib/db/repos/*.ts`. UI
 * gating is never the authorization mechanism (spec §16, §21 acceptance #14).
 */

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* --------------------------------------------------------------------------
 * profiles — one row per authenticated owner
 * -------------------------------------------------------------------------- */
export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    emailIdx: uniqueIndex("profiles_email_idx").on(t.email),
  })
);

/* --------------------------------------------------------------------------
 * campaigns
 * -------------------------------------------------------------------------- */
export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["draft", "active", "paused", "completed"],
    })
      .notNull()
      .default("draft"),
    niche: text("niche").notNull(),
    geography: text("geography", { mode: "json" }).$type<{
      city?: string;
      region?: string;
      country?: string;
    }>(),
    idealCustomerDescription: text("ideal_customer_description").notNull().default(""),
    offer: text("offer").notNull().default(""),
    valueProposition: text("value_proposition").notNull().default(""),
    caseStudyUrl: text("case_study_url"),
    minimumScore: integer("minimum_score").notNull().default(60),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    ownerIdx: index("campaigns_owner_idx").on(t.ownerId),
    statusIdx: index("campaigns_status_idx").on(t.ownerId, t.status),
  })
);

/* --------------------------------------------------------------------------
 * leads
 * -------------------------------------------------------------------------- */
export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    category: text("category").notNull().default(""),
    niche: text("niche").notNull(),
    websiteUrl: text("website_url"),
    normalizedDomain: text("normalized_domain"),
    publicEmail: text("public_email"),
    publicPhone: text("public_phone"),
    address: text("address"),
    city: text("city").notNull().default(""),
    region: text("region"),
    country: text("country").notNull().default("India"),
    sourceName: text("source_name").notNull().default("manual"),
    sourceUrl: text("source_url"),
    sourceExternalId: text("source_external_id"),
    sourceLastCheckedAt: text("source_last_checked_at"),
    websiteCondition: text("website_condition", {
      enum: [
        "no_website",
        "inaccessible",
        "outdated",
        "weak",
        "acceptable",
        "strong",
        "unknown",
      ],
    })
      .notNull()
      .default("unknown"),
    fitScore: integer("fit_score"),
    evidenceConfidence: text("evidence_confidence", {
      enum: ["low", "medium", "high", "insufficient"],
    })
      .notNull()
      .default("insufficient"),
    scoreBand: text("score_band", {
      enum: [
        "priority_review",
        "strong_candidate",
        "needs_manual_review",
        "low_priority",
        "insufficient_evidence",
      ],
    }),
    scoreBreakdown: text("score_breakdown", { mode: "json" }).$type<
      Array<{
        code: string;
        label: string;
        points: number;
        evidence: string;
        evidenceUrl?: string;
      }>
    >(),
    scoreVersion: text("score_version"),
    scoredAt: text("scored_at"),
    pipelineStage: text("pipeline_stage", {
      enum: [
        "new",
        "reviewing",
        "qualified",
        "contacted",
        "replied",
        "meeting_booked",
        "proposal_sent",
        "won",
        "lost",
        "not_a_fit",
      ],
    })
      .notNull()
      .default("new"),
    estimatedDealValue: integer("estimated_deal_value"),
    currency: text("currency").notNull().default("INR"),
    lossReason: text("loss_reason"),
    lastContactedAt: text("last_contacted_at"),
    nextActionAt: text("next_action_at"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    doNotContact: integer("do_not_contact", { mode: "boolean" })
      .notNull()
      .default(false),
    doNotContactReason: text("do_not_contact_reason"),
    doNotContactAt: text("do_not_contact_at"),
    lastAuditedAt: text("last_audited_at"),
    previousWebsiteCondition: text("previous_website_condition", {
      enum: [
        "no_website",
        "inaccessible",
        "outdated",
        "weak",
        "acceptable",
        "strong",
        "unknown",
      ],
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    archivedAt: text("archived_at"),
  },
  (t) => ({
    ownerIdx: index("leads_owner_idx").on(t.ownerId),
    stageIdx: index("leads_owner_stage_idx").on(t.ownerId, t.pipelineStage),
    scoreIdx: index("leads_owner_score_idx").on(t.ownerId, t.fitScore),
    domainIdx: index("leads_owner_domain_idx").on(t.ownerId, t.normalizedDomain),
    normalizedNameIdx: index("leads_owner_name_idx").on(t.ownerId, t.normalizedName, t.city),
    sourceExternalIdx: uniqueIndex("leads_owner_source_external_idx").on(
      t.ownerId,
      t.sourceName,
      t.sourceExternalId
    ),
  })
);

/* --------------------------------------------------------------------------
 * campaign_leads — junction
 * -------------------------------------------------------------------------- */
export const campaignLeads = sqliteTable(
  "campaign_leads",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    addedAt: text("added_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.campaignId, t.leadId] }),
    leadIdx: index("campaign_leads_lead_idx").on(t.leadId),
  })
);

/* --------------------------------------------------------------------------
 * discovery_jobs
 * -------------------------------------------------------------------------- */
export const discoveryJobs = sqliteTable(
  "discovery_jobs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    sourceName: text("source_name").notNull(),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "partial", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
    resultCount: integer("result_count").notNull().default(0),
    errorSummary: text("error_summary"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    ownerIdx: index("discovery_jobs_owner_idx").on(t.ownerId),
    statusIdx: index("discovery_jobs_owner_status_idx").on(t.ownerId, t.status),
  })
);

/* --------------------------------------------------------------------------
 * lead_sources — per-lead source evidence trail (spec §12)
 * -------------------------------------------------------------------------- */
export const leadSources = sqliteTable(
  "lead_sources",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    externalId: text("external_id"),
    observedAt: text("observed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    permittedStoragePolicy: text("permitted_storage_policy"),
    evidence: text("evidence", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => ({
    leadIdx: index("lead_sources_lead_idx").on(t.leadId),
    sourceExternalIdx: index("lead_sources_source_external_idx").on(
      t.sourceName,
      t.externalId
    ),
  })
);

/* --------------------------------------------------------------------------
 * website_audits
 * -------------------------------------------------------------------------- */
export const websiteAudits = sqliteTable(
  "website_audits",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    requestedUrl: text("requested_url").notNull(),
    finalUrl: text("final_url"),
    status: text("status", {
      enum: ["success", "partial", "blocked", "unavailable", "failed"],
    }).notNull(),
    httpStatus: integer("http_status"),
    auditVersion: text("audit_version").notNull(),
    findings: text("findings", { mode: "json" })
      .$type<
        Array<{
          code: string;
          title: string;
          severity: "info" | "low" | "medium" | "high";
          description: string;
          evidence?: string;
          evidenceUrl?: string;
          confidence: "low" | "medium" | "high";
          recommendation: string;
        }>
      >()
      .notNull()
      .default([]),
    metrics: text("metrics", { mode: "json" }).$type<{
      source: "server-fetch" | "pagespeed";
      pageWeightBytes?: number;
      loadMs?: number;
      note?: string;
    }>(),
    errorCategory: text("error_category"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => ({
    leadIdx: index("website_audits_lead_idx").on(t.leadId),
    startedIdx: index("website_audits_lead_started_idx").on(t.leadId, t.startedAt),
  })
);

/* --------------------------------------------------------------------------
 * opportunity_briefs
 * -------------------------------------------------------------------------- */
export const opportunityBriefs = sqliteTable(
  "opportunity_briefs",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    observations: text("observations", { mode: "json" })
      .$type<
        Array<{ observation: string; evidence: string; evidenceUrl?: string }>
      >()
      .notNull()
      .default([]),
    possibleOpportunity: text("possible_opportunity").notNull().default(""),
    recommendedService: text("recommended_service").notNull().default(""),
    suggestedDeliverable: text("suggested_deliverable").notNull().default(""),
    confidence: text("confidence", { enum: ["low", "medium", "high"] })
      .notNull()
      .default("medium"),
    unknowns: text("unknowns", { mode: "json" }).$type<string[]>().notNull().default([]),
    source: text("source", { enum: ["template", "ai"] })
      .notNull()
      .default("template"),
    modelMetadata: text("model_metadata", { mode: "json" }).$type<{
      provider: string;
      model: string;
    }>(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    leadIdx: index("opportunity_briefs_lead_idx").on(t.leadId),
  })
);

/* --------------------------------------------------------------------------
 * outreach_drafts
 * -------------------------------------------------------------------------- */
export const outreachDrafts = sqliteTable(
  "outreach_drafts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    channel: text("channel", {
      enum: [
        "email",
        "contact_form",
        "instagram_dm",
        "linkedin_manual",
        "other",
      ],
    }).notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    personalizationEvidence: text("personalization_evidence", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    status: text("status", {
      enum: [
        "draft",
        "needs_review",
        "approved",
        "contacted",
        "replied",
        "archived",
      ],
    })
      .notNull()
      .default("needs_review"),
    source: text("source", { enum: ["template", "ai"] })
      .notNull()
      .default("template"),
    needsHumanReview: integer("needs_human_review", { mode: "boolean" })
      .notNull()
      .default(true),
    variantGroup: text("variant_group"),
    variantLabel: text("variant_label"),
    replySentiment: text("reply_sentiment", {
      enum: ["interested", "needs_info", "not_a_fit", "unsubscribe", "unclear"],
    }),
    approvedAt: text("approved_at"),
    contactedAt: text("contacted_at"),
    repliedAt: text("replied_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    ownerIdx: index("outreach_drafts_owner_idx").on(t.ownerId),
    statusIdx: index("outreach_drafts_owner_status_idx").on(t.ownerId, t.status),
    leadIdx: index("outreach_drafts_lead_idx").on(t.leadId),
  })
);

/* --------------------------------------------------------------------------
 * activities
 * -------------------------------------------------------------------------- */
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    activityType: text("activity_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    ownerIdx: index("activities_owner_idx").on(t.ownerId),
    leadIdx: index("activities_lead_idx").on(t.leadId),
    createdIdx: index("activities_owner_created_idx").on(t.ownerId, t.createdAt),
  })
);

/* --------------------------------------------------------------------------
 * tasks
 * -------------------------------------------------------------------------- */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    taskType: text("task_type", {
      enum: [
        "review_lead",
        "verify_contact",
        "send_approved_message",
        "follow_up",
        "prepare_proposal",
        "book_meeting",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    priority: text("priority", { enum: ["low", "normal", "high"] })
      .notNull()
      .default("normal"),
    status: text("status", {
      enum: ["open", "in_progress", "done", "cancelled"],
    })
      .notNull()
      .default("open"),
    dueAt: text("due_at"),
    notes: text("notes"),
    completedAt: text("completed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    ownerIdx: index("tasks_owner_idx").on(t.ownerId),
    statusIdx: index("tasks_owner_status_idx").on(t.ownerId, t.status),
    dueIdx: index("tasks_owner_due_idx").on(t.ownerId, t.dueAt),
    leadIdx: index("tasks_lead_idx").on(t.leadId),
  })
);

/* --------------------------------------------------------------------------
 * service_offerings
 * -------------------------------------------------------------------------- */
export const serviceOfferings = sqliteTable(
  "service_offerings",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    idealCustomer: text("ideal_customer").notNull().default(""),
    valueProposition: text("value_proposition").notNull().default(""),
    caseStudyUrl: text("case_study_url"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    ownerIdx: index("service_offerings_owner_idx").on(t.ownerId),
  })
);

/* --------------------------------------------------------------------------
 * app_settings — per-owner key/value for scoring weights, flags, etc.
 * -------------------------------------------------------------------------- */
export const appSettings = sqliteTable(
  "app_settings",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).$type<unknown>().notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    ownerKeyIdx: uniqueIndex("app_settings_owner_key_idx").on(t.ownerId, t.key),
  })
);

/* --------------------------------------------------------------------------
 * Inferred row + insert types — pages/repositories import these
 * -------------------------------------------------------------------------- */
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type CampaignLead = typeof campaignLeads.$inferSelect;
export type DiscoveryJob = typeof discoveryJobs.$inferSelect;
export type NewDiscoveryJob = typeof discoveryJobs.$inferInsert;
export type LeadSource = typeof leadSources.$inferSelect;
export type WebsiteAudit = typeof websiteAudits.$inferSelect;
export type NewWebsiteAudit = typeof websiteAudits.$inferInsert;
export type OpportunityBrief = typeof opportunityBriefs.$inferSelect;
export type NewOpportunityBrief = typeof opportunityBriefs.$inferInsert;
export type OutreachDraft = typeof outreachDrafts.$inferSelect;
export type NewOutreachDraft = typeof outreachDrafts.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type ServiceOffering = typeof serviceOfferings.$inferSelect;
export type NewServiceOffering = typeof serviceOfferings.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;

/* --------------------------------------------------------------------------
 * workspaces — one row per tenant (Phase A)
 * -------------------------------------------------------------------------- */
export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    plan: text("plan", { enum: ["free", "freelancer", "teams", "studio"] })
      .notNull()
      .default("free"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // Phase E (Razorpay swap) — new provider columns
    razorpayCustomerId: text("razorpay_customer_id"),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    trialEndsAt: text("trial_ends_at"),
    onboardingState: text("onboarding_state", { mode: "json" }).$type<{
      step?: string;
      completed?: boolean;
      [key: string]: unknown;
    } | null>(),
    industryPreset: text("industry_preset"),
    logoUrl: text("logo_url"),
    accentColor: text("accent_color"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    slugIdx: uniqueIndex("workspaces_slug_idx").on(t.slug),
  })
);

/* --------------------------------------------------------------------------
 * workspace_members — membership + role
 * -------------------------------------------------------------------------- */
export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member", "viewer"] })
      .notNull()
      .default("member"),
    invitedBy: text("invited_by").references(() => profiles.id),
    invitedAt: text("invited_at"),
    acceptedAt: text("accepted_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.profileId] }),
    profileIdx: index("workspace_members_profile_idx").on(t.profileId),
  })
);

/* --------------------------------------------------------------------------
 * workspace_invites — pending invitations
 * -------------------------------------------------------------------------- */
export const workspaceInvites = sqliteTable("workspace_invites", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role", { enum: ["owner", "admin", "member", "viewer"] })
    .notNull()
    .default("member"),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => profiles.id),
  token: text("token").notNull(),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/* --------------------------------------------------------------------------
 * sessions — session-cookie auth (Phase A)
 * -------------------------------------------------------------------------- */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activeWorkspaceId: text("active_workspace_id").references(
      () => workspaces.id,
      { onDelete: "set null" }
    ),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: text("last_used_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => ({
    profileIdx: index("sessions_profile_idx").on(t.profileId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  })
);

/* --------------------------------------------------------------------------
 * magic_link_tokens — short-lived, single-use login tokens (Phase A)
 * -------------------------------------------------------------------------- */
export const magicLinkTokens = sqliteTable(
  "magic_link_tokens",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("magic_link_tokens_hash_idx").on(t.tokenHash),
    emailIdx: index("magic_link_tokens_email_idx").on(t.email),
  })
);

/* --------------------------------------------------------------------------
 * workspace_usage — monthly metering (Phase A schema, Phase E enforcement)
 * -------------------------------------------------------------------------- */
export const workspaceUsage = sqliteTable("workspace_usage", {
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  periodYyyyMm: text("period_yyyymm").notNull(),
  auditsUsed: integer("audits_used").notNull().default(0),
  aiDraftsUsed: integer("ai_drafts_used").notNull().default(0),
  replyTriagesUsed: integer("reply_triages_used").notNull().default(0),
  enrichmentsUsed: integer("enrichments_used").notNull().default(0),
  discoveryRunsUsed: integer("discovery_runs_used").notNull().default(0),
  gmailSendsUsed: integer("gmail_sends_used").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.workspaceId, t.periodYyyyMm] }),
}));

/* --------------------------------------------------------------------------
 * audit_log — immutable activity log (Teams tier, Phase F)
 * -------------------------------------------------------------------------- */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorProfileId: text("actor_profile_id").references(() => profiles.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    workspaceCreatedIdx: index("audit_log_workspace_created_idx").on(
      t.workspaceId,
      t.createdAt
    ),
  })
);

/* --------------------------------------------------------------------------
 * custom_score_factors — Teams-tier scoring extensions
 * -------------------------------------------------------------------------- */
export const customScoreFactors = sqliteTable("custom_score_factors", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  points: integer("points").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  detectionMethod: text("detection_method").notNull(),
  detectionConfig: text("detection_config", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/* --------------------------------------------------------------------------
 * custom_audit_signals — Teams-tier audit extensions
 * -------------------------------------------------------------------------- */
export const customAuditSignals = sqliteTable("custom_audit_signals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  severity: text("severity").notNull().default("info"),
  detectionMethod: text("detection_method").notNull(),
  detectionConfig: text("detection_config", { mode: "json" }).$type<Record<string, unknown>>(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/* --------------------------------------------------------------------------
 * follow_up_cadences — outreach sequence definitions
 * -------------------------------------------------------------------------- */
export const followUpCadences = sqliteTable("follow_up_cadences", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").references(() => campaigns.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  steps: text("steps", { mode: "json" })
    .$type<Array<{ offset_days: number; template: string; channel: string }>>()
    .notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/* --------------------------------------------------------------------------
 * webhooks — outbound webhook endpoints (Teams tier)
 * -------------------------------------------------------------------------- */
export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events", { mode: "json" }).$type<string[]>().notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/* --------------------------------------------------------------------------
 * webhook_deliveries — delivery attempt log
 * -------------------------------------------------------------------------- */
export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id")
    .notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull(),
  httpStatus: integer("http_status"),
  errorMessage: text("error_message"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextRetryAt: text("next_retry_at"),
  deliveredAt: text("delivered_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/* --------------------------------------------------------------------------
 * notification_preferences — per-member notification settings
 * -------------------------------------------------------------------------- */
export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    digestFrequency: text("digest_frequency", {
      enum: ["off", "daily", "weekly"],
    })
      .notNull()
      .default("weekly"),
    hotLeadAlerts: integer("hot_lead_alerts", { mode: "boolean" })
      .notNull()
      .default(true),
    replyAlerts: integer("reply_alerts", { mode: "boolean" })
      .notNull()
      .default(true),
    slackWebhookUrl: text("slack_webhook_url"),
    discordWebhookUrl: text("discord_webhook_url"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.profileId] }),
  })
);

/* --------------------------------------------------------------------------
 * New inferred types (Phase A)
 * -------------------------------------------------------------------------- */
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type NewWorkspaceInvite = typeof workspaceInvites.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type NewMagicLinkToken = typeof magicLinkTokens.$inferInsert;
export type WorkspaceUsage = typeof workspaceUsage.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type CustomScoreFactor = typeof customScoreFactors.$inferSelect;
export type CustomAuditSignal = typeof customAuditSignals.$inferSelect;
export type FollowUpCadence = typeof followUpCadences.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
