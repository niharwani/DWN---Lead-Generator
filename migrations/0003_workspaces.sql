-- =========================================================================
-- DWN Lead Engine — workspaces migration (Phase A)
--
-- Adds multi-tenant workspace tables. Existing profiles are backfilled into
-- solo workspaces with workspace.id = profile.id, which preserves all
-- owner_id foreign keys on existing rows without any data rewrite.
-- =========================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------------------
-- workspaces — one row per tenant
-- -------------------------------------------------------------------------
CREATE TABLE workspaces (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  slug                   TEXT NOT NULL UNIQUE,
  plan                   TEXT NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free','freelancer','teams','studio')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at          TEXT,
  onboarding_state       TEXT,  -- JSON: {step, completed, ...}
  industry_preset        TEXT,  -- 'agency' | 'fitness' | 'saas' | ...
  logo_url               TEXT,
  accent_color           TEXT,
  created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- workspace_members — membership + role
-- -------------------------------------------------------------------------
CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner','admin','member','viewer')),
  invited_by   TEXT REFERENCES profiles(id),
  invited_at   TEXT,
  accepted_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, profile_id)
);
CREATE INDEX workspace_members_profile_idx ON workspace_members (profile_id);

-- -------------------------------------------------------------------------
-- workspace_invites — pending invitations
-- -------------------------------------------------------------------------
CREATE TABLE workspace_invites (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner','admin','member','viewer')),
  invited_by   TEXT NOT NULL REFERENCES profiles(id),
  token        TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  accepted_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- Backfill: every existing profile becomes a solo workspace.
-- workspace.id = profile.id so all existing owner_id values remain valid.
-- plan='studio' for existing DWN profiles (free for life).
-- onboarding_state='{"completed":true}' so they skip onboarding.
-- -------------------------------------------------------------------------
INSERT INTO workspaces (id, name, slug, plan, onboarding_state)
  SELECT
    id,
    COALESCE(full_name, email) || '''s workspace',
    LOWER(REPLACE(REPLACE(email, '@', '-at-'), '.', '-')),
    'studio',
    '{"completed":true}'
  FROM profiles;

INSERT INTO workspace_members (workspace_id, profile_id, role)
  SELECT id, id, 'owner' FROM profiles;
