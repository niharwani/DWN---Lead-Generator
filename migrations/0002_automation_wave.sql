-- =========================================================================
-- DWN Lead Engine — automation wave schema (post-launch)
--
-- Adds fields needed for:
--   - Monthly re-audit cron with regression detection
--     (leads.last_audited_at, leads.previous_website_condition)
--   - A/B outreach variants
--     (outreach_drafts.variant_group, outreach_drafts.variant_label)
--   - Reply sentiment tagging
--     (outreach_drafts.reply_sentiment)
--
-- All columns are nullable so existing rows remain valid without backfill.
-- =========================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------------------
-- leads: track prior audit result for regression diffing
-- -------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN last_audited_at TEXT;
ALTER TABLE leads ADD COLUMN previous_website_condition TEXT
  CHECK (previous_website_condition IS NULL OR previous_website_condition IN
    ('no_website','inaccessible','outdated','weak','acceptable','strong','unknown'));

CREATE INDEX leads_owner_last_audited_idx ON leads (owner_id, last_audited_at);

-- -------------------------------------------------------------------------
-- outreach_drafts: variant grouping + reply sentiment
-- -------------------------------------------------------------------------
ALTER TABLE outreach_drafts ADD COLUMN variant_group TEXT;
ALTER TABLE outreach_drafts ADD COLUMN variant_label TEXT;
ALTER TABLE outreach_drafts ADD COLUMN reply_sentiment TEXT
  CHECK (reply_sentiment IS NULL OR reply_sentiment IN
    ('interested','needs_info','not_a_fit','unsubscribe','unclear'));

CREATE INDEX outreach_drafts_variant_group_idx
  ON outreach_drafts (owner_id, variant_group);
