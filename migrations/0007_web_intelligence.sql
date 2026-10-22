-- =========================================================================
-- DWN Lead Engine — Web Intelligence module
--
-- Adds the three new tables the Web Intelligence module needs on top of the
-- existing leads / lead_sources / website_audits infrastructure:
--
--   • crawl_jobs       — one row per discover-and-crawl run (reuses the
--                        discovery_jobs status taxonomy but keeps crawl-
--                        specific knobs: maxDepth, maxPages, perDomainCap,
--                        seedUrl / seedKeywords).
--   • crawl_pages      — per-URL fetch record (status, content-type, bytes,
--                        elapsed, depth, discovered-via).
--   • extracted_people — publicly-documented decision-makers (name, title,
--                        profileUrl, source URL, confidence).
--
-- Nothing in this migration touches existing rows. All new tables carry
-- owner_id (D1 has no RLS — every repo filters server-side) and reference
-- leads() with ON DELETE CASCADE where appropriate.
-- =========================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------------------
-- crawl_jobs — the top-level unit of work for the Web Intelligence module.
-- -------------------------------------------------------------------------
CREATE TABLE crawl_jobs (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id        TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  lead_id            TEXT REFERENCES leads(id) ON DELETE SET NULL,
  seed_url           TEXT NOT NULL,
  seed_label         TEXT,
  niche              TEXT NOT NULL DEFAULT '',
  city               TEXT,
  region             TEXT,
  country            TEXT NOT NULL DEFAULT 'India',
  max_pages          INTEGER NOT NULL DEFAULT 20,
  max_depth          INTEGER NOT NULL DEFAULT 2,
  per_domain_cap     INTEGER NOT NULL DEFAULT 20,
  status             TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','completed','partial','failed','cancelled')),
  pages_fetched      INTEGER NOT NULL DEFAULT 0,
  pages_failed       INTEGER NOT NULL DEFAULT 0,
  people_found       INTEGER NOT NULL DEFAULT 0,
  findings_count     INTEGER NOT NULL DEFAULT 0,
  error_summary      TEXT,
  started_at         TEXT,
  completed_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX crawl_jobs_owner_idx         ON crawl_jobs(owner_id);
CREATE INDEX crawl_jobs_owner_status_idx  ON crawl_jobs(owner_id, status);
CREATE INDEX crawl_jobs_lead_idx          ON crawl_jobs(lead_id);

-- -------------------------------------------------------------------------
-- crawl_pages — per-URL fetch record. Multiple rows per crawl job.
-- -------------------------------------------------------------------------
CREATE TABLE crawl_pages (
  id                TEXT PRIMARY KEY,
  job_id            TEXT NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  lead_id           TEXT REFERENCES leads(id) ON DELETE SET NULL,
  url               TEXT NOT NULL,
  final_url         TEXT,
  discovered_via    TEXT NOT NULL DEFAULT 'seed'
                      CHECK (discovered_via IN ('seed','link','sitemap','search')),
  depth             INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','fetched','skipped','blocked','failed')),
  http_status       INTEGER,
  content_type      TEXT,
  bytes             INTEGER,
  elapsed_ms        INTEGER,
  title             TEXT,
  error_stage       TEXT,
  error_reason      TEXT,
  fetched_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX crawl_pages_job_idx     ON crawl_pages(job_id);
CREATE INDEX crawl_pages_lead_idx    ON crawl_pages(lead_id);
CREATE UNIQUE INDEX crawl_pages_job_url_idx ON crawl_pages(job_id, url);

-- -------------------------------------------------------------------------
-- extracted_people — publicly-documented decision-makers.
-- -------------------------------------------------------------------------
CREATE TABLE extracted_people (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id        TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  job_id         TEXT REFERENCES crawl_jobs(id) ON DELETE SET NULL,
  full_name      TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  job_title      TEXT,
  profile_url    TEXT,
  source_url     TEXT NOT NULL,
  evidence       TEXT,  -- JSON (free form; typically the surrounding sentence)
  confidence     TEXT NOT NULL DEFAULT 'medium'
                   CHECK (confidence IN ('low','medium','high')),
  observed_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX extracted_people_owner_idx ON extracted_people(owner_id);
CREATE INDEX extracted_people_lead_idx  ON extracted_people(lead_id);
CREATE UNIQUE INDEX extracted_people_lead_name_idx
  ON extracted_people(lead_id, normalized_name);
