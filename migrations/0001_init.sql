-- =========================================================================
-- DWN Lead Engine — initial schema (Phase 2)
--
-- SQLite / Cloudflare D1 dialect. Mirrors `src/lib/db/schema.ts`. CHECK
-- constraints enforce enum values at the DB layer in addition to Drizzle's
-- type-level enum helpers.
--
-- D1 has no row-level security. Owner isolation is enforced by every
-- repository query. See `src/lib/db/repos/*.ts`.
-- =========================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------------------
-- profiles
-- -------------------------------------------------------------------------
CREATE TABLE profiles (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  full_name  TEXT,
  is_demo    INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX profiles_email_idx ON profiles (email);

-- -------------------------------------------------------------------------
-- campaigns
-- -------------------------------------------------------------------------
CREATE TABLE campaigns (
  id                           TEXT PRIMARY KEY,
  owner_id                     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                         TEXT NOT NULL,
  status                       TEXT NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','active','paused','completed')),
  niche                        TEXT NOT NULL,
  geography                    TEXT,
  ideal_customer_description   TEXT NOT NULL DEFAULT '',
  offer                        TEXT NOT NULL DEFAULT '',
  value_proposition            TEXT NOT NULL DEFAULT '',
  case_study_url               TEXT,
  minimum_score                INTEGER NOT NULL DEFAULT 60,
  notes                        TEXT,
  created_at                   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX campaigns_owner_idx ON campaigns (owner_id);
CREATE INDEX campaigns_status_idx ON campaigns (owner_id, status);

-- -------------------------------------------------------------------------
-- leads
-- -------------------------------------------------------------------------
CREATE TABLE leads (
  id                      TEXT PRIMARY KEY,
  owner_id                TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_name           TEXT NOT NULL,
  normalized_name         TEXT NOT NULL,
  category                TEXT NOT NULL DEFAULT '',
  niche                   TEXT NOT NULL,
  website_url             TEXT,
  normalized_domain       TEXT,
  public_email            TEXT,
  public_phone            TEXT,
  address                 TEXT,
  city                    TEXT NOT NULL DEFAULT '',
  region                  TEXT,
  country                 TEXT NOT NULL DEFAULT 'India',
  source_name             TEXT NOT NULL DEFAULT 'manual',
  source_url              TEXT,
  source_external_id      TEXT,
  source_last_checked_at  TEXT,
  website_condition       TEXT NOT NULL DEFAULT 'unknown'
                            CHECK (website_condition IN
                              ('no_website','inaccessible','outdated','weak','acceptable','strong','unknown')),
  fit_score               INTEGER,
  evidence_confidence     TEXT NOT NULL DEFAULT 'insufficient'
                            CHECK (evidence_confidence IN ('low','medium','high','insufficient')),
  score_band              TEXT
                            CHECK (score_band IS NULL OR score_band IN
                              ('priority_review','strong_candidate','needs_manual_review','low_priority','insufficient_evidence')),
  score_breakdown         TEXT,
  score_version           TEXT,
  scored_at               TEXT,
  pipeline_stage          TEXT NOT NULL DEFAULT 'new'
                            CHECK (pipeline_stage IN
                              ('new','reviewing','qualified','contacted','replied',
                               'meeting_booked','proposal_sent','won','lost','not_a_fit')),
  estimated_deal_value    INTEGER,
  currency                TEXT NOT NULL DEFAULT 'INR',
  loss_reason             TEXT,
  last_contacted_at       TEXT,
  next_action_at          TEXT,
  tags                    TEXT NOT NULL DEFAULT '[]',
  do_not_contact          INTEGER NOT NULL DEFAULT 0 CHECK (do_not_contact IN (0, 1)),
  do_not_contact_reason   TEXT,
  do_not_contact_at       TEXT,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at             TEXT,
  CHECK (fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100))
);
CREATE INDEX leads_owner_idx ON leads (owner_id);
CREATE INDEX leads_owner_stage_idx ON leads (owner_id, pipeline_stage);
CREATE INDEX leads_owner_score_idx ON leads (owner_id, fit_score);
CREATE INDEX leads_owner_domain_idx ON leads (owner_id, normalized_domain);
CREATE INDEX leads_owner_name_idx ON leads (owner_id, normalized_name, city);
-- Dedup guarantee for permitted-source external IDs. Nullable triplets won't
-- conflict because SQLite treats NULLs in unique indexes as distinct.
CREATE UNIQUE INDEX leads_owner_source_external_idx
  ON leads (owner_id, source_name, source_external_id);

-- -------------------------------------------------------------------------
-- campaign_leads — junction
-- -------------------------------------------------------------------------
CREATE TABLE campaign_leads (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id     TEXT NOT NULL REFERENCES leads(id)     ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'active',
  added_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, lead_id)
);
CREATE INDEX campaign_leads_lead_idx ON campaign_leads (lead_id);

-- -------------------------------------------------------------------------
-- discovery_jobs
-- -------------------------------------------------------------------------
CREATE TABLE discovery_jobs (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id       TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  source_name       TEXT NOT NULL,
  input             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','completed','partial','failed','cancelled')),
  progress_current  INTEGER NOT NULL DEFAULT 0,
  progress_total    INTEGER NOT NULL DEFAULT 0,
  result_count      INTEGER NOT NULL DEFAULT 0,
  error_summary     TEXT,
  started_at        TEXT,
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX discovery_jobs_owner_idx ON discovery_jobs (owner_id);
CREATE INDEX discovery_jobs_owner_status_idx ON discovery_jobs (owner_id, status);

-- -------------------------------------------------------------------------
-- lead_sources
-- -------------------------------------------------------------------------
CREATE TABLE lead_sources (
  id                         TEXT PRIMARY KEY,
  lead_id                    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  source_name                TEXT NOT NULL,
  source_url                 TEXT,
  external_id                TEXT,
  observed_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  permitted_storage_policy   TEXT,
  evidence                   TEXT
);
CREATE INDEX lead_sources_lead_idx ON lead_sources (lead_id);
CREATE INDEX lead_sources_source_external_idx ON lead_sources (source_name, external_id);

-- -------------------------------------------------------------------------
-- website_audits
-- -------------------------------------------------------------------------
CREATE TABLE website_audits (
  id             TEXT PRIMARY KEY,
  lead_id        TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  requested_url  TEXT NOT NULL,
  final_url      TEXT,
  status         TEXT NOT NULL
                   CHECK (status IN ('success','partial','blocked','unavailable','failed')),
  http_status    INTEGER,
  audit_version  TEXT NOT NULL,
  findings       TEXT NOT NULL DEFAULT '[]',
  metrics        TEXT,
  error_category TEXT,
  started_at     TEXT NOT NULL,
  completed_at   TEXT
);
CREATE INDEX website_audits_lead_idx ON website_audits (lead_id);
CREATE INDEX website_audits_lead_started_idx ON website_audits (lead_id, started_at);

-- -------------------------------------------------------------------------
-- opportunity_briefs
-- -------------------------------------------------------------------------
CREATE TABLE opportunity_briefs (
  id                     TEXT PRIMARY KEY,
  lead_id                TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id            TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  summary                TEXT NOT NULL,
  observations           TEXT NOT NULL DEFAULT '[]',
  possible_opportunity   TEXT NOT NULL DEFAULT '',
  recommended_service    TEXT NOT NULL DEFAULT '',
  suggested_deliverable  TEXT NOT NULL DEFAULT '',
  confidence             TEXT NOT NULL DEFAULT 'medium'
                           CHECK (confidence IN ('low','medium','high')),
  unknowns               TEXT NOT NULL DEFAULT '[]',
  source                 TEXT NOT NULL DEFAULT 'template'
                           CHECK (source IN ('template','ai')),
  model_metadata         TEXT,
  created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX opportunity_briefs_lead_idx ON opportunity_briefs (lead_id);

-- -------------------------------------------------------------------------
-- outreach_drafts
-- -------------------------------------------------------------------------
CREATE TABLE outreach_drafts (
  id                        TEXT PRIMARY KEY,
  owner_id                  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id                   TEXT NOT NULL REFERENCES leads(id)     ON DELETE CASCADE,
  campaign_id               TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  channel                   TEXT NOT NULL
                              CHECK (channel IN ('email','contact_form','instagram_dm','linkedin_manual','other')),
  subject                   TEXT,
  body                      TEXT NOT NULL,
  personalization_evidence  TEXT NOT NULL DEFAULT '[]',
  status                    TEXT NOT NULL DEFAULT 'needs_review'
                              CHECK (status IN ('draft','needs_review','approved','contacted','replied','archived')),
  source                    TEXT NOT NULL DEFAULT 'template'
                              CHECK (source IN ('template','ai')),
  needs_human_review        INTEGER NOT NULL DEFAULT 1 CHECK (needs_human_review IN (0, 1)),
  approved_at               TEXT,
  contacted_at              TEXT,
  replied_at                TEXT,
  created_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX outreach_drafts_owner_idx ON outreach_drafts (owner_id);
CREATE INDEX outreach_drafts_owner_status_idx ON outreach_drafts (owner_id, status);
CREATE INDEX outreach_drafts_lead_idx ON outreach_drafts (lead_id);

-- -------------------------------------------------------------------------
-- activities
-- -------------------------------------------------------------------------
CREATE TABLE activities (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id        TEXT REFERENCES leads(id)     ON DELETE CASCADE,
  campaign_id    TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  activity_type  TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  metadata       TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX activities_owner_idx ON activities (owner_id);
CREATE INDEX activities_lead_idx ON activities (lead_id);
CREATE INDEX activities_owner_created_idx ON activities (owner_id, created_at);

-- -------------------------------------------------------------------------
-- tasks
-- -------------------------------------------------------------------------
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id       TEXT REFERENCES leads(id)     ON DELETE CASCADE,
  campaign_id   TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  task_type     TEXT NOT NULL DEFAULT 'other'
                  CHECK (task_type IN
                    ('review_lead','verify_contact','send_approved_message',
                     'follow_up','prepare_proposal','book_meeting','other')),
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high')),
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','done','cancelled')),
  due_at        TEXT,
  notes         TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX tasks_owner_idx ON tasks (owner_id);
CREATE INDEX tasks_owner_status_idx ON tasks (owner_id, status);
CREATE INDEX tasks_owner_due_idx ON tasks (owner_id, due_at);
CREATE INDEX tasks_lead_idx ON tasks (lead_id);

-- -------------------------------------------------------------------------
-- service_offerings
-- -------------------------------------------------------------------------
CREATE TABLE service_offerings (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  ideal_customer     TEXT NOT NULL DEFAULT '',
  value_proposition  TEXT NOT NULL DEFAULT '',
  case_study_url     TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX service_offerings_owner_idx ON service_offerings (owner_id);

-- -------------------------------------------------------------------------
-- app_settings
-- -------------------------------------------------------------------------
CREATE TABLE app_settings (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX app_settings_owner_key_idx ON app_settings (owner_id, key);
