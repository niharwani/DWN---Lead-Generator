-- Stream F — crawl_snapshots
--
-- Per-page HTML snapshots recorded by the Web Intelligence crawler. Each row
-- stores a content hash (SHA-256 of normalized visible text) plus a nullable
-- pointer to the raw HTML archive in R2 (binding INTEL_SNAPSHOTS). The hash
-- enables cheap change-detection on re-crawl; the R2 key enables historical
-- re-extraction if extractors improve later.
--
-- `job_id` references crawl_jobs(id) with ON DELETE SET NULL so snapshots
-- survive job retention sweeps and remain useful for diffs. If the
-- crawl_jobs table has not yet shipped (sibling stream), the FK constraint
-- is still valid — SQLite tolerates a forward reference as long as the
-- referenced table exists at insert time. If a deployment runs this
-- migration without crawl_jobs present, the INSERT will fail at runtime.
-- The paired migration that creates crawl_jobs MUST be applied first (or
-- in the same batch).
--
-- Note: to keep this migration independently applyable even when the sibling
-- stream has not landed yet, we declare the FK without strict enforcement.
-- SQLite only enforces FKs when `PRAGMA foreign_keys = ON` is in effect,
-- which Drizzle/D1 default-set. If crawl_jobs is missing at migrate time
-- the CREATE TABLE itself still succeeds (SQLite defers FK existence
-- checks to the first INSERT).

CREATE TABLE crawl_snapshots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES crawl_jobs(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  title TEXT,
  r2_key TEXT,
  bytes INTEGER,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX crawl_snapshots_owner_lead_idx
  ON crawl_snapshots(owner_id, lead_id);

CREATE INDEX crawl_snapshots_owner_url_observed_idx
  ON crawl_snapshots(owner_id, url, observed_at);
