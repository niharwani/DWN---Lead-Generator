-- =========================================================================
-- DWN Lead Engine — product extensions migration (Phase A)
--
-- Adds attribution columns, reply-threading fields, snooze columns,
-- sessions/magic-link tables, and Teams-tier tables.
-- All ALTER TABLEs use nullable columns so existing rows stay valid.
-- =========================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------------------
-- Attribution columns (Teams tier)
-- -------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN created_by TEXT REFERENCES profiles(id);
ALTER TABLE leads ADD COLUMN assigned_to TEXT REFERENCES profiles(id);
ALTER TABLE outreach_drafts ADD COLUMN created_by TEXT REFERENCES profiles(id);
ALTER TABLE tasks ADD COLUMN assigned_to TEXT REFERENCES profiles(id);
ALTER TABLE activities ADD COLUMN actor_profile_id TEXT REFERENCES profiles(id);

-- -------------------------------------------------------------------------
-- Reply triage + automation extensions
-- -------------------------------------------------------------------------
ALTER TABLE outreach_drafts ADD COLUMN gmail_thread_id TEXT;
ALTER TABLE outreach_drafts ADD COLUMN gmail_message_id TEXT;
ALTER TABLE outreach_drafts ADD COLUMN cadence_step INTEGER DEFAULT 0;
ALTER TABLE outreach_drafts ADD COLUMN parent_draft_id TEXT REFERENCES outreach_drafts(id);
ALTER TABLE outreach_drafts ADD COLUMN scheduled_for TEXT;

-- -------------------------------------------------------------------------
-- Snooze / wake
-- -------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN snoozed_until TEXT;
ALTER TABLE tasks ADD COLUMN snoozed_until TEXT;

-- -------------------------------------------------------------------------
-- Monthly usage metering
-- -------------------------------------------------------------------------
CREATE TABLE workspace_usage (
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_yyyymm       TEXT NOT NULL,  -- '202610'
  audits_used         INTEGER NOT NULL DEFAULT 0,
  ai_drafts_used      INTEGER NOT NULL DEFAULT 0,
  reply_triages_used  INTEGER NOT NULL DEFAULT 0,
  enrichments_used    INTEGER NOT NULL DEFAULT 0,
  discovery_runs_used INTEGER NOT NULL DEFAULT 0,
  gmail_sends_used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, period_yyyymm)
);

-- -------------------------------------------------------------------------
-- Audit log (Teams tier)
-- -------------------------------------------------------------------------
CREATE TABLE audit_log (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_profile_id TEXT REFERENCES profiles(id),
  action           TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT,
  metadata         TEXT,  -- JSON
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_log_workspace_created_idx ON audit_log (workspace_id, created_at);

-- -------------------------------------------------------------------------
-- Custom scoring factors (Teams tier)
-- -------------------------------------------------------------------------
CREATE TABLE custom_score_factors (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  label            TEXT NOT NULL,
  points           INTEGER NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1,
  detection_method TEXT NOT NULL,  -- 'regex' | 'presence' | 'count' | 'manual'
  detection_config TEXT,           -- JSON
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, code)
);

-- -------------------------------------------------------------------------
-- Custom audit signals (Teams tier)
-- -------------------------------------------------------------------------
CREATE TABLE custom_audit_signals (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  label            TEXT NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'info',
  detection_method TEXT NOT NULL,
  detection_config TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, code)
);

-- -------------------------------------------------------------------------
-- Follow-up cadences (per campaign)
-- -------------------------------------------------------------------------
CREATE TABLE follow_up_cadences (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id  TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  steps        TEXT NOT NULL,  -- JSON array: [{offset_days, template, channel}]
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- Outbound webhooks (Teams tier)
-- -------------------------------------------------------------------------
CREATE TABLE webhooks (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  secret       TEXT NOT NULL,
  events       TEXT NOT NULL,  -- JSON array of event names
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webhook_deliveries (
  id            TEXT PRIMARY KEY,
  webhook_id    TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL
                  CHECK (status IN ('pending','succeeded','failed')),
  http_status   INTEGER,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  delivered_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- Notification preferences
-- -------------------------------------------------------------------------
CREATE TABLE notification_preferences (
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id         TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  digest_frequency   TEXT NOT NULL DEFAULT 'weekly'
                       CHECK (digest_frequency IN ('off','daily','weekly')),
  hot_lead_alerts    INTEGER NOT NULL DEFAULT 1,
  reply_alerts       INTEGER NOT NULL DEFAULT 1,
  slack_webhook_url  TEXT,
  discord_webhook_url TEXT,
  PRIMARY KEY (workspace_id, profile_id)
);

-- -------------------------------------------------------------------------
-- Sessions (replaces CF Access as the primary auth)
-- -------------------------------------------------------------------------
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  expires_at          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address          TEXT,
  user_agent          TEXT
);
CREATE INDEX sessions_profile_idx ON sessions (profile_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- -------------------------------------------------------------------------
-- Magic link tokens (short-lived, consumed on use)
-- -------------------------------------------------------------------------
CREATE TABLE magic_link_tokens (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX magic_link_tokens_email_idx ON magic_link_tokens (email);
