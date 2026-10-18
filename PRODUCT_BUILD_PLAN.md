# DWN Lead Engine → SaaS Product — Build Plan

**Status:** Planning (not yet implemented)
**Date:** 2026-10-18
**Companion to:** [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md) (product strategy, tiers, positioning)
**This doc:** The concrete, change-only engineering plan. **No wholesale rewrites.** The existing app is complete; this plan layers productization on top.

---

## 0. Guiding principles for this build

1. **Additive, not destructive.** Every migration adds tables/columns. No column renames, no breaking schema changes, no touching the 183 existing tests.
2. **Reuse `ownerId` as the tenant key.** The 12 repository files in [`src/lib/db/repos/`](src/lib/db/repos/) already filter by `ownerId`. We will *not* rename it to `workspaceId`. Instead, auth resolves the session to a `workspace_id` value and feeds it in **as** `ownerId`. The repos keep working untouched.
3. **Feature flags, not forks.** Teams-only features gate behind a `requireFeature()` helper. Freelancer-only limits gate behind a `checkLimit()` helper. Core code paths stay unified.
4. **The current DWN production tenant stays alive.** The existing [`dwn-lead-engine.designwithnihar.workers.dev`](https://dwn-lead-engine.designwithnihar.workers.dev) deployment becomes workspace #1 after migration, with Nihar's profile as the owner. Zero data loss.
5. **Ship in slices, not big-bang.** Each phase is independently shippable. The product can go into closed beta after Phase 3 (billing optional).

---

## 1. What exists today (don't touch unless listed)

### Already-shipped surfaces
| Surface | Location | Keep as-is? |
|---|---|:-:|
| Schema | [`src/lib/db/schema.ts`](src/lib/db/schema.ts) | ✓ (add tables, don't modify) |
| Repos | [`src/lib/db/repos/*.ts`](src/lib/db/repos/) | ✓ (12 files, all stay) |
| Routes | [`src/app/(app)/*`](src/app/(app)/) | ✓ (minor additions) |
| API handlers | [`src/app/api/*`](src/app/api/) | ✓ (additions only) |
| Audit engine | [`src/lib/audit/`](src/lib/audit/) | ✓ |
| SSRF guard | [`src/lib/audit/ssrf.ts`](src/lib/audit/ssrf.ts) | ✓ |
| Scoring engine | [`src/lib/scoring/engine.ts`](src/lib/scoring/engine.ts) | ✓ (extend, don't rewrite) |
| Discovery adapters | [`src/lib/sources/`](src/lib/sources/) | ✓ |
| Outreach draft builder | [`src/lib/outreach/draft.ts`](src/lib/outreach/draft.ts) | ✓ |
| Gmail scaffold | [`src/lib/gmail/`](src/lib/gmail/) | ✓ (wire up remaining pieces) |
| Rate limiter | [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) | ✓ (extend buckets) |
| Cron (stale leads, re-audit) | [`src/lib/cron/`](src/lib/cron/) | ✓ (extend handlers) |
| Server actions | [`src/lib/actions.ts`](src/lib/actions.ts) | ✓ (additions only) |
| Settings page | [`src/app/(app)/settings/page.tsx`](src/app/(app)/settings/page.tsx) | partial changes (see §6) |
| Auth session resolver | [`src/lib/auth/session.ts`](src/lib/auth/session.ts) | **replaces** — the only big auth rewrite |

### What's broken or incomplete today (fix during this build)
- Gmail integration is **scaffolded but not wired** — see `GMAIL_INTEGRATION.md`. Finish the UI + server action + reply-polling cron.
- Settings page has placeholder "Save profile" buttons that don't persist — hook them to real actions.
- A/B variants are schema-ready but no UI surface to pick a winner.

---

## 2. The one load-bearing change: multi-tenant via `ownerId = workspaceId`

### 2.1 How this works without renaming anything

**Today:**
```
auth session → profile.id → ownerId filter on every repo query
```

**After:**
```
auth session → profile.id → workspace_members → workspace.id → used AS ownerId
```

The repos never notice. They still receive an `ownerId: string` argument and query against the same column. The *source* of that string changes.

### 2.2 Migration `0003_workspaces.sql` (additive)
```sql
-- One row per tenant. Seeded from existing profiles so prod data survives.
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'freelancer' | 'teams' | 'studio'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TEXT,
  onboarding_state TEXT,  -- JSON: {step: 'who_are_you', completed: false, ...}
  industry_preset TEXT,   -- 'agency' | 'fitness' | 'saas' | ...
  logo_url TEXT,
  accent_color TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member' | 'viewer'
  invited_by TEXT REFERENCES profiles(id),
  invited_at TEXT,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, profile_id)
);
CREATE INDEX workspace_members_profile_idx ON workspace_members(profile_id);

-- Workspace invites that have not yet been accepted
CREATE TABLE workspace_invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT NOT NULL REFERENCES profiles(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill: every existing profile becomes a solo workspace.
-- The existing owner_id values on leads/drafts/etc stay valid because
-- we set workspace.id = profile.id for the backfill.
INSERT INTO workspaces (id, name, slug, plan)
  SELECT id, COALESCE(full_name, email) || '''s workspace', LOWER(REPLACE(email, '@', '-at-')), 'studio'
  FROM profiles;

INSERT INTO workspace_members (workspace_id, profile_id, role)
  SELECT id, id, 'owner' FROM profiles;
```

**Why the backfill works perfectly:** `workspace.id = profile.id` for every existing profile → every row with `owner_id = <profile_id>` is now also implicitly `owner_id = <workspace_id>`. Zero data rewriting.

### 2.3 Migration `0004_product_extensions.sql`
```sql
-- Attribution for Teams tier
ALTER TABLE leads ADD COLUMN created_by TEXT REFERENCES profiles(id);
ALTER TABLE leads ADD COLUMN assigned_to TEXT REFERENCES profiles(id);
ALTER TABLE outreach_drafts ADD COLUMN created_by TEXT REFERENCES profiles(id);
ALTER TABLE tasks ADD COLUMN assigned_to TEXT REFERENCES profiles(id);
ALTER TABLE activities ADD COLUMN actor_profile_id TEXT REFERENCES profiles(id);

-- Reply triage + automation extensions
ALTER TABLE outreach_drafts ADD COLUMN gmail_thread_id TEXT;
ALTER TABLE outreach_drafts ADD COLUMN gmail_message_id TEXT;
ALTER TABLE outreach_drafts ADD COLUMN cadence_step INTEGER DEFAULT 0;
ALTER TABLE outreach_drafts ADD COLUMN parent_draft_id TEXT REFERENCES outreach_drafts(id);
ALTER TABLE outreach_drafts ADD COLUMN scheduled_for TEXT;

-- Snooze / wake
ALTER TABLE leads ADD COLUMN snoozed_until TEXT;
ALTER TABLE tasks ADD COLUMN snoozed_until TEXT;

-- Monthly usage metering
CREATE TABLE workspace_usage (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_yyyymm TEXT NOT NULL,  -- '202610'
  audits_used INTEGER NOT NULL DEFAULT 0,
  ai_drafts_used INTEGER NOT NULL DEFAULT 0,
  reply_triages_used INTEGER NOT NULL DEFAULT 0,
  enrichments_used INTEGER NOT NULL DEFAULT 0,
  discovery_runs_used INTEGER NOT NULL DEFAULT 0,
  gmail_sends_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, period_yyyymm)
);

-- Audit log (Teams tier)
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_profile_id TEXT REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT,  -- JSON
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_log_workspace_created_idx ON audit_log(workspace_id, created_at);

-- Custom scoring factors (Teams tier)
CREATE TABLE custom_score_factors (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  points INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  detection_method TEXT NOT NULL,  -- 'regex' | 'presence' | 'count' | 'manual'
  detection_config TEXT,  -- JSON
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, code)
);

-- Custom audit signals (shared with scoring factors conceptually)
CREATE TABLE custom_audit_signals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  detection_method TEXT NOT NULL,
  detection_config TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, code)
);

-- Follow-up cadences (per campaign)
CREATE TABLE follow_up_cadences (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  steps TEXT NOT NULL,  -- JSON array: [{offset_days: 3, template: '...', channel: 'email'}]
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Outbound webhooks (Teams tier)
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL,  -- JSON array of event names
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'pending' | 'succeeded' | 'failed'
  http_status INTEGER,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences
CREATE TABLE notification_preferences (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  digest_frequency TEXT NOT NULL DEFAULT 'weekly',  -- 'off' | 'daily' | 'weekly'
  hot_lead_alerts INTEGER NOT NULL DEFAULT 1,
  reply_alerts INTEGER NOT NULL DEFAULT 1,
  slack_webhook_url TEXT,
  discord_webhook_url TEXT,
  PRIMARY KEY (workspace_id, profile_id)
);

-- Sessions (replaces CF Access as the primary auth)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX sessions_profile_idx ON sessions(profile_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

-- Magic link tokens (short-lived, consumed on use)
CREATE TABLE magic_link_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX magic_link_tokens_email_idx ON magic_link_tokens(email);
```

### 2.4 Session resolver rewrite (the only big auth change)

Replace [`src/lib/auth/session.ts`](src/lib/auth/session.ts) `getOwner()` with workspace-aware logic. The key constraint: **keep the `Owner` return type's `id` field as the current workspace id** so every downstream repo call keeps working.

```ts
// new signature
export async function getOwner(): Promise<Owner | null>
// where Owner.id = currentWorkspaceId (NOT profileId)
// and we add Owner.profileId for the actual user identity

export type Owner = {
  id: string;              // workspace_id — used as ownerId everywhere
  profileId: string;       // human user id
  email: string;
  fullName: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: 'free' | 'freelancer' | 'teams' | 'studio';
  };
  isDemo: boolean;
};
```

Resolution order inside `getOwner()`:
1. Read session cookie → look up `sessions` row.
2. From session, get `active_workspace_id`; if null, pick first workspace from `workspace_members` for that profile.
3. Verify the profile is still a member of that workspace.
4. Return `Owner` with `id = active_workspace_id`.

Backwards-compat shim: if a request has `Cf-Access-Jwt-Assertion` (DWN prod), resolve to the single workspace that profile belongs to and auto-mint a session. Keeps the existing DWN deployment working through the migration.

### 2.5 Why nothing else in the data layer needs to change
Every call site like `listLeads(db, ownerId)` keeps working — the string just happens to be a workspace id now. Zero changes to the 12 repo files or the ~40 route handlers that call them.

---

## 3. Phase-by-phase build sequence

Each phase is **shippable in isolation**. Checkmark items are "done" criteria.

### Phase A — Multi-tenant plumbing (foundational, ~1 week)

**Goal:** Workspaces exist, DWN prod tenant migrates cleanly, nothing else changes for the end user yet.

**New files:**
- `migrations/0003_workspaces.sql` (see §2.2)
- `migrations/0004_product_extensions.sql` (see §2.3)
- `src/lib/db/repos/workspaces.ts` — CRUD + membership helpers
- `src/lib/db/repos/sessions.ts` — session CRUD
- `src/lib/auth/magic-link.ts` — magic-link token generation + verification
- `src/lib/auth/sessions.ts` — session cookie read/write (`sl_sid` cookie, HttpOnly, Secure, SameSite=Lax)
- `src/app/api/auth/login/route.ts` — email → send magic link via Resend
- `src/app/api/auth/callback/route.ts` — consume token, create session, redirect
- `src/app/api/auth/logout/route.ts`
- `src/app/(auth)/login/page.tsx` — simple email input
- `src/app/(auth)/check-email/page.tsx`

**Modified files (small changes only):**
- `src/lib/auth/session.ts` — rewrite `getOwner()` as described in §2.4; keep CF Access fallback for prod continuity.
- `src/lib/db/schema.ts` — add drizzle definitions for the new tables (append, no edits to existing tables).
- `src/components/layout/topbar.tsx` (if present) — add workspace switcher dropdown + member avatar.

**Zero-touch surfaces:** all 12 repo files, all 8 app routes, all API handlers that take `ownerId`, scoring/audit/discovery/draft engines.

**Done criteria:**
- `pnpm db:migrate:local` applies cleanly.
- Existing seed data still loads; DWN demo workspace shows in UI.
- Can log in via magic link locally (dev bypass still works).
- Can log out.
- Can create a second workspace from the user menu.
- Can switch between workspaces (data correctly scopes).
- 183 existing tests still pass.
- Add ~15 new tests: workspace creation, membership queries, session lifecycle, cross-workspace isolation.

### Phase B — Industry presets + onboarding wizard (~1 week)

**Goal:** New users land in a usable workspace in <5 minutes without reading docs.

**New files:**
- `src/lib/presets/index.ts` — preset loader + typed registry
- `src/lib/presets/types.ts` — `IndustryPreset` type (name, scoring weights, services, templates, suggested niches)
- `src/lib/presets/agency.ts` (= current DWN defaults, extracted)
- `src/lib/presets/fitness.ts`
- `src/lib/presets/saas.ts`
- `src/lib/presets/real-estate.ts`
- `src/lib/presets/home-services.ts`
- `src/lib/presets/consultant.ts`
- `src/lib/presets/ecommerce.ts`
- `src/lib/presets/marketing.ts`
- `src/lib/presets/accounting.ts`
- `src/lib/presets/legal.ts`
- `src/lib/presets/dental-medical.ts`
- `src/lib/presets/other.ts` (blank slate)
- `src/app/(onboarding)/layout.tsx` — minimal shell, no sidebar
- `src/app/(onboarding)/onboarding/page.tsx` — step dispatcher
- `src/app/(onboarding)/onboarding/_steps/01-who.tsx`
- `src/app/(onboarding)/onboarding/_steps/02-what.tsx`
- `src/app/(onboarding)/onboarding/_steps/03-icp.tsx`
- `src/app/(onboarding)/onboarding/_steps/04-services.tsx`
- `src/app/(onboarding)/onboarding/_steps/05-integrations.tsx`
- `src/app/(onboarding)/onboarding/_steps/done.tsx`
- `src/lib/onboarding/state.ts` — persist/resume in `workspaces.onboarding_state`
- `src/lib/onboarding/apply-preset.ts` — bulk-insert service_offerings + app_settings from preset config

**Modified files:**
- `src/lib/actions.ts` — add `completeOnboardingStepAction`, `applyPresetAction`
- `src/app/(app)/layout.tsx` — redirect to `/onboarding` when workspace onboarding incomplete
- `src/app/(app)/overview/page.tsx` — add first-run checklist card (dismissible, lives in `app_settings`)

**Zero-touch:** scoring engine (presets just supply a different `WeightMap`), service_offerings schema, audit engine.

**Done criteria:**
- Fresh signup flows into `/onboarding` → finishes at `/overview` with a seeded demo campaign.
- Picking "Fitness Coach" preset seeds fitness-tuned services + weights.
- Resume mid-wizard: close tab, log back in, resume at last step.
- All 12 presets have at least name + 3 services + 3 scoring weight overrides + 1 draft template.

### Phase C — Niche-agnostic customization (~1 week)

**Goal:** A workspace from any industry can fully tune its scoring, audit signals, and template variables.

**New files:**
- `src/lib/variables/registry.ts` — variable substitution engine; supports `{{lead.business_name}}` etc.
- `src/lib/variables/custom.ts` — workspace-level custom variables stored in `app_settings`
- `src/lib/scoring/custom-factors.ts` — runtime extension to `scoreLead()` for `custom_score_factors` rows
- `src/lib/audit/custom-signals.ts` — runtime extension to the audit engine for `custom_audit_signals` rows
- `src/app/(app)/settings/_sections/custom-factors.tsx` — Teams-tier UI section
- `src/app/(app)/settings/_sections/custom-signals.tsx` — Teams-tier UI section
- `src/app/(app)/settings/_sections/templates.tsx` — editable draft templates with variable autocomplete
- `src/app/(app)/settings/_sections/branding.tsx` — workspace name, pitch, logo, accent color

**Modified files:**
- `src/lib/scoring/engine.ts` — accept optional `customFactors: CustomScoreFactor[]` parameter, iterate same as built-ins. Keep SCORE_VERSION bump logic.
- `src/lib/audit/engine.ts` — accept optional `customSignals` parameter, run alongside the 8 baseline checks.
- `src/lib/outreach/draft.ts` — use variable registry for all substitutions (currently inlined); extract studio-name hardcoding to workspace lookup.
- `src/app/(app)/settings/page.tsx` — compose new section components; feature-gate custom factors/signals behind `requireFeature('custom_factors')`.

**Zero-touch:** repos, audit SSRF guard, scoring factor codes already defined.

**Done criteria:**
- A workspace can add a factor "has Instagram link" and see it fire on new audits.
- A workspace can edit the draft template and preview it with a sample lead.
- Branding section updates logo + accent in-app (CSS custom property swap).
- Rename every hardcoded "Design with Nihar" / "DWN" string in user-facing shell to workspace.name lookup.

### Phase D — Automations wave 2 (~2 weeks)

**Goal:** All the automations proposed in [`PRODUCT_PLAN.md §1`](PRODUCT_PLAN.md) are live, driven by cron.

**New cron triggers** (add to [`wrangler.jsonc`](wrangler.jsonc#L41-L48)):
- `*/15 * * * *` — reply triage sweep (every 15 min; fast if nobody has Gmail connected)
- `0 */2 * * *` — follow-up cadence runner (every 2 hours)
- `0 */6 * * *` — bounce/DSN detection sweep
- `0 10 * * MON` — weekly digest emails
- `0 3 * * *` — auto-enrichment pass for new/stale leads
- `*/5 * * * *` — webhook retry queue drain

**New files:**
- `src/lib/cron/reply-triage.ts` — fetches Gmail replies, classifies with Claude Haiku, writes `replySentiment`, side-effects per class
- `src/lib/cron/follow-ups.ts` — iterates `follow_up_cadences`, generates next-step drafts for contacted leads with no reply
- `src/lib/cron/bounces.ts` — detects DSN replies, flags DNC
- `src/lib/cron/digests.ts` — composes + sends weekly digest emails
- `src/lib/cron/enrichment.ts` — background enrichment pass
- `src/lib/cron/snooze-wake.ts` — un-snoozes expired snoozes
- `src/lib/cron/webhook-dispatch.ts` — fires outbound webhooks, retries on failure
- `src/app/api/cron/reply-triage/route.ts` + 5 more cron endpoint handlers
- `src/lib/outreach/triage.ts` — Claude Haiku call + Zod schema
- `src/lib/outreach/cadence.ts` — cadence step evaluator
- `src/lib/notifications/dispatcher.ts` — unified send layer: in-app + email + Slack + Discord
- `src/lib/notifications/slack.ts`
- `src/lib/notifications/discord.ts`
- `src/lib/notifications/digest-template.ts`

**Modified files:**
- `src/lib/outreach/draft.ts` — add `generateFollowUpDraft()` that reuses existing builder with cadence-step context
- `src/lib/actions.ts` — add snooze/unsnooze actions, cadence attach/detach actions
- `src/app/(app)/overview/page.tsx` — new "Replies awaiting triage" + "Follow-ups due today" sections
- `src/app/(app)/leads/[id]/page.tsx` — snooze button, cadence attach button
- `src/app/(app)/campaigns/[id]/page.tsx` — cadence editor UI

**Zero-touch:** audit engine, scoring engine, discovery adapters, SSRF guard.

**Done criteria:**
- Reply arrives in Gmail → within 15 min, draft shows classified in UI with suggested next action.
- `unsubscribe` reply auto-flips `doNotContact=true` and logs activity.
- Snooze a lead for 3 days → disappears from default queue → returns after 3 days.
- Weekly digest email arrives Monday morning with lead counts.
- Hot-lead alert fires in-app (and optionally Slack) when a priority_review lead appears.

### Phase E — Billing + usage metering (~1 week)

**Goal:** Stripe integration, server-side limit enforcement, Customer Portal for self-serve upgrades.

**New files:**
- `src/lib/billing/stripe.ts` — thin wrapper around Stripe REST (no SDK — same pattern as Anthropic REST wrapper)
- `src/lib/billing/plans.ts` — plan definitions + feature flags (single source of truth)
- `src/lib/billing/limits.ts` — `checkLimit(workspace, 'ai_drafts')`, `requireFeature(workspace, 'webhooks')`, `incrementUsage(workspace, 'audits')`
- `src/lib/db/repos/usage.ts` — read/write `workspace_usage`
- `src/app/api/billing/checkout/route.ts` — creates checkout session
- `src/app/api/billing/portal/route.ts` — creates customer portal session
- `src/app/api/billing/webhook/route.ts` — Stripe webhook handler (signature verification required)
- `src/app/(app)/settings/_sections/billing.tsx` — plan card + upgrade button + current usage display
- `src/app/(app)/billing/page.tsx` — standalone plan comparison page

**Modified files:**
- Every mutation that costs money gets a `checkLimit()` guard at the top:
  - `src/lib/actions.ts` → `runAuditAction`, `runDiscoveryAction`, `generateDraftAction`, `sendDraftViaGmailAction`
  - `src/lib/cron/*` runners → check limit before AI calls
- `src/components/layout/topbar.tsx` — add usage meter indicator (soft-warn at 80%)

**Zero-touch:** schema (usage table already added in Phase A migration 0004), rate limiter.

**Done criteria:**
- Can upgrade a workspace from Free → Freelancer via Stripe checkout.
- Downgrade / cancel via Customer Portal.
- Hitting the AI drafts cap returns a 402 with a clear "upgrade" CTA, no crash.
- Payment failure webhook flips plan to `read-only` after 7-day grace.
- Usage counters reset at month boundary (UTC).

**Deliberately deferred:** actual price values. Per user's instruction, pricing is a Phase H decision.

### Phase F — Teams features + RBAC (~1.5 weeks)

**Goal:** Multi-user workspaces are first-class. Role-based access gates mutations.

**New files:**
- `src/lib/auth/rbac.ts` — `requireRole(owner, 'admin')`, role-based assertions
- `src/lib/audit-log/writer.ts` — `recordAuditLog(workspace, actor, action, entity, metadata)` helper, wraps mutations
- `src/app/(app)/settings/_sections/members.tsx` — invite UI, role editor
- `src/app/(app)/settings/_sections/audit-log.tsx` — paginated activity feed
- `src/app/(app)/settings/_sections/webhooks.tsx` — webhook CRUD
- `src/app/api/invites/send/route.ts`
- `src/app/api/invites/accept/route.ts`
- `src/app/(auth)/invite/[token]/page.tsx` — invite acceptance landing
- `src/lib/db/repos/webhooks.ts`
- `src/lib/db/repos/audit-log.ts`

**Modified files:**
- Every mutating server action in `src/lib/actions.ts` gets:
  - `requireRole(owner, minRole)` at the top (viewer gets 403, member can mutate most things, admin manages members, owner handles billing)
  - `recordAuditLog(...)` call on success
- `src/lib/notifications/dispatcher.ts` — Slack + Discord webhook delivery wired up
- `src/app/(app)/leads/[id]/page.tsx` — "Assign to" dropdown of workspace members
- `src/app/(app)/tasks/page.tsx` — filter by assignee

**Zero-touch:** repos (RBAC is a layer above repos; repos keep filtering by workspace_id blindly).

**Done criteria:**
- Owner invites user by email → user gets magic-link invite → joins workspace with specified role.
- Viewer can read everything but every mutation returns 403.
- Audit log shows every lead mutation / draft approval / member change.
- Slack webhook fires on reply classified as `interested`.

### Phase G — Finish Gmail + Outlook + Calendar integrations (~1 week)

**Goal:** Communication channels work end-to-end.

**New files:**
- `src/lib/outlook/oauth.ts`
- `src/lib/outlook/client.ts` — Microsoft Graph API wrapper (REST, no SDK)
- `src/app/api/outlook/oauth/start/route.ts`
- `src/app/api/outlook/oauth/callback/route.ts`
- `src/app/api/outlook/disconnect/route.ts`
- `src/lib/calendar/calcom.ts` — Cal.com deep-link helper + API
- `src/lib/cron/outlook-replies.ts`

**Modified files (Gmail wiring from `GMAIL_INTEGRATION.md` finally completed):**
- `src/lib/env.ts` — add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`, Outlook equivalents
- `src/app/(app)/settings/_sections/integrations.tsx` — Connect/Disconnect buttons for Gmail + Outlook
- `src/app/(app)/leads/[id]/page.tsx` — "Send via Gmail" / "Send via Outlook" button on approved drafts
- `src/lib/actions.ts` — add `sendDraftViaGmailAction` and `sendDraftViaOutlookAction`
- New cron entry in `wrangler.jsonc` for Outlook reply polling

**Zero-touch:** outreach draft builder (just a new "transport" layer).

**Done criteria:**
- Connect Gmail → send a draft → row shows `contacted` → reply arrives → triage classifies → task gets created.
- Same end-to-end with Outlook.
- Calendar section surfaces user's Cal.com link; one-click paste into draft body.

### Phase H — Launch prep (~1 week)

**Goal:** Public-ready: marketing site, docs, legal, support.

**New files:**
- `src/app/(marketing)/layout.tsx` — public landing shell (no auth)
- `src/app/(marketing)/page.tsx` — landing page
- `src/app/(marketing)/pricing/page.tsx` — pricing comparison (reads live prices from Stripe, so pricing changes don't need redeploys)
- `src/app/(marketing)/features/page.tsx`
- `src/app/(marketing)/legal/terms/page.tsx`
- `src/app/(marketing)/legal/privacy/page.tsx`
- `src/app/(marketing)/legal/dpa/page.tsx`
- `docs/` (MDX-based inside the Next app, or separate static site — decide)

**Modified files:**
- `src/app/page.tsx` — currently redirects to `/overview`; make it conditional on auth state (unauth → `/`, auth → `/overview`)
- `README.md` — public-facing section at top, developer section below

**New admin surface:**
- `src/app/(admin)/admin/layout.tsx` — email-allowlist gate (env var `SUPER_ADMIN_EMAILS`)
- `src/app/(admin)/admin/workspaces/page.tsx` — workspace list
- `src/app/(admin)/admin/workspaces/[id]/page.tsx` — detail view with impersonation (view-only)
- `src/app/(admin)/admin/comp/page.tsx` — comp a plan upgrade manually

**Done criteria:**
- `/` is a real landing page for unauthed visitors.
- `/pricing` renders live from Stripe.
- Signup from landing → onboarding → first lead in <10 min.
- Legal pages pass a lightweight legal review.
- Admin can impersonate a workspace to help a support ticket.

---

## 4. Deployment & migration strategy for the existing DWN tenant

The current production deployment at `dwn-lead-engine.designwithnihar.workers.dev` has real DWN data behind Cloudflare Access. We do NOT want a flag-day cutover.

### Phase order for the DWN prod tenant specifically:
1. **Before Phase A deploys:** take a D1 remote export (`wrangler d1 export`). This is a safety net; migrations are additive but take the backup anyway.
2. **Phase A deploys:** migration runs → DWN profile gets a workspace with `plan='studio'` (free for DWN forever). CF Access JWT fallback keeps working through the backwards-compat shim in `getOwner()`. Nothing in the UX changes for Nihar.
3. **Phase B deploys:** DWN workspace already has data, so onboarding wizard is skipped (`onboarding_state.completed = true` set by migration for workspaces whose `created_at < migration_date`).
4. **Phase D deploys:** DWN tenant automatically gets the new cron behaviors. New settings surface the opt-outs.
5. **Phase H deploys:** domain strategy — move marketing site to `getleadengine.com` (or chosen name), app lives at `app.getleadengine.com`. DWN's existing workspace keeps working at either URL via a tenant router.

### Keeping CF Access as an option
After migration, Cloudflare Access becomes an **optional overlay** that enterprise self-hosted customers can enable in front of the app. Document in Studio-tier materials. The default public SaaS uses magic-link + optional Google OAuth.

---

## 5. Test strategy (changes only)

The 183 existing tests stay unchanged. New test files to add (parallel to the implementation phases):

- `tests/unit/workspaces.test.ts` — workspace CRUD, slug uniqueness
- `tests/unit/sessions.test.ts` — session create/expire/rotate
- `tests/unit/magic-link.test.ts` — token hash + expiry
- `tests/unit/rbac.test.ts` — role gate matrix
- `tests/unit/presets.test.ts` — each preset loads a valid config
- `tests/unit/custom-factors.test.ts` — scoring engine with custom factors
- `tests/unit/custom-signals.test.ts` — audit engine with custom signals
- `tests/unit/variables.test.ts` — substitution registry
- `tests/unit/cadences.test.ts` — cadence step evaluator
- `tests/unit/triage.test.ts` — Claude Haiku classifier, including fallback path
- `tests/unit/billing-limits.test.ts` — checkLimit + requireFeature
- `tests/unit/webhook-dispatch.test.ts` — signing + retry
- `tests/unit/notifications.test.ts` — dispatcher routing (Slack / Discord / email)
- `tests/integration/cross-workspace-isolation.test.ts` — tries to read workspace B's data while logged into A, must 404
- `tests/integration/onboarding-flow.test.ts` — end-to-end wizard with each preset
- `tests/integration/invite-accept.test.ts` — invite → accept → mutate as new role
- `tests/integration/billing-webhook.test.ts` — Stripe webhook sim

**New test coverage goal:** +120 tests across the phases, bringing total to ~300.

---

## 6. Settings page restructure (concrete)

[`src/app/(app)/settings/page.tsx`](src/app/(app)/settings/page.tsx) is already sectioned. We don't rewrite — we **extract and extend**. Final structure:

```
Settings
├── Workspace
│   ├── Branding (Phase C)         — name, logo, accent, pitch
│   ├── Business profile           — EXISTS, hook up save
│   └── Industry preset            — show + re-apply
├── Members (Teams, Phase F)       — invite, role, remove
├── Lead evaluation
│   ├── Scoring weights            — EXISTS
│   ├── Custom scoring factors (Teams, Phase C)
│   └── Custom audit signals (Teams, Phase C)
├── Services & offers              — EXISTS
├── Templates (Phase C)            — editable draft templates with variable picker
├── Automations
│   ├── Follow-up cadences (Phase D)
│   ├── Reply triage (Phase D)     — enable/disable, model picker
│   ├── Auto-enrichment (Phase D)
│   └── Auto-decay (Phase D)
├── Integrations
│   ├── Gmail (Phase G)            — scaffold exists
│   ├── Outlook (Phase G)
│   ├── Google Places              — EXISTS
│   ├── PageSpeed                  — EXISTS
│   ├── AI provider                — EXISTS
│   ├── Slack / Discord (Teams, Phase D)
│   ├── Webhooks (Teams, Phase F)
│   └── Calendar (Teams, Phase G)
├── Notifications (Phase D)        — digest frequency, hot-lead alerts
├── Website audit settings         — EXISTS
├── Audit log (Teams, Phase F)
└── Billing (Phase E)              — plan card, usage, upgrade
```

Each section becomes a `_sections/*.tsx` component. Current page.tsx becomes a composition root.

---

## 7. Minimal interface for feature flags & limits

One file, one import, used everywhere. Design proposal:

```ts
// src/lib/billing/plans.ts
export type Feature =
  | 'ai_drafts' | 'gmail_send' | 'outlook_send' | 'cadences'
  | 'variant_analytics' | 'slack_notifications' | 'webhooks'
  | 'calendar' | 'scheduled_exports' | 'audit_log'
  | 'custom_factors' | 'custom_signals' | 'rbac' | 'sso' | 'white_label';

export type MeteredResource =
  | 'audits' | 'ai_drafts' | 'reply_triages' | 'enrichments'
  | 'discovery_runs' | 'gmail_sends';

export type Plan = {
  id: 'free' | 'freelancer' | 'teams' | 'studio';
  features: Feature[];
  limits: Partial<Record<MeteredResource, number>>; // per month; omitted = unlimited
  maxLeads?: number;
  maxCampaigns?: number;
  maxSeats?: number;
};
```

```ts
// src/lib/billing/limits.ts
export function requireFeature(owner: Owner, feature: Feature): void;
// throws Response(402) if not entitled
export async function checkLimit(owner: Owner, resource: MeteredResource): Promise<void>;
// throws Response(402) if over the cap for the current period
export async function incrementUsage(owner: Owner, resource: MeteredResource, n = 1): Promise<void>;
```

**Pricing values stay empty in Phase E** — the plan config is wired, but we leave the actual dollar amounts and quota numbers as TODO constants. Per the user's instruction, those get set in Phase H / post-launch.

---

## 8. Phase ordering summary (and what you can parallelize)

| Phase | Duration | Blocks | Can run parallel with |
|---|---|---|---|
| A — Multi-tenant plumbing | ~1 wk | Everything | — |
| B — Onboarding + presets | ~1 wk | — | C, F (if careful) |
| C — Niche customization | ~1 wk | — | B, D |
| D — Automations wave 2 | ~2 wk | — | C, E |
| E — Billing | ~1 wk | H (public launch) | D, F |
| F — Teams + RBAC | ~1.5 wk | — | D, G |
| G — Gmail/Outlook/Cal finish | ~1 wk | — | D, F |
| H — Launch prep | ~1 wk | public go-live | — (after all above) |

**Fastest viable public launch:** A → B → E → H (~4 weeks, no Teams features, no advanced automations, works but thin). More realistic ambitious plan: A → B → C → D → E → F → G → H (~9 weeks of focused work).

**Recommended path:** A → B → C → D → F → G → E → H. Puts the product value first (automations + customization + Teams), then adds billing, then launches. Lets you run a free closed beta during the automation builds and gather feedback before the paywall goes up.

---

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| D1 migration locks production during Phase A deploy | Additive-only migrations; `wrangler d1 export` beforehand. Deploy at 2am UTC when DWN usage is zero. |
| Session change breaks DWN prod login | CF Access JWT fallback shim stays in `getOwner()`; test prod login with a staging deployment first. |
| Cron Trigger pileup if automations stack | Each cron handler has its own route + rate limiter bucket. Monitor Workers CPU after Phase D ships. |
| Stripe webhook signature verification mistakes | Use the official recommended HMAC check; add a test that forges a bad signature and asserts rejection. |
| User finds a cross-workspace data leak | Phase A integration test suite covers this; penetration-test the deployment before public launch. |
| Pooled AI costs blow up before billing enforcement | Hard cap in `rate-limit.ts` for AI calls per workspace per day. Alert the admin inbox at 90%. |
| Industry preset list grows unmaintainable | Each preset is a single file + schema'd config. Add a `pnpm validate:presets` script that type-checks all presets. |
| Rename of hardcoded "DWN" strings misses places | Grep-script test: `tests/lint/no-hardcoded-dwn.test.ts` fails CI if "Design with Nihar" or "DWN" appears outside allowed files (readme, migration backfills). |

---

## 10. Explicitly NOT in this plan (yet)

To keep scope honest:
- Mobile app — not now.
- Chrome extension — not now.
- Full HubSpot parity (deals pipeline customization, forecasting) — not now.
- LinkedIn automation — never, per responsible-use guardrails.
- WYSIWYG email editor — plain text + markdown only.
- Multi-region deploy — Cloudflare's edge handles global latency; one deployment is enough.
- Self-serve data deletion (GDPR) — Phase H+ (manual admin tool first, self-serve later).

---

## 11. Memory + state notes for future sessions

- Product name is NOT chosen. All code uses "DWN Lead Engine" placeholder. Pick before Phase H.
- Pricing values are intentionally blank in Phase E. Fill in during pre-launch pricing exercise.
- Industry preset count is 12 — can grow post-launch based on signups.
- The `getOwner()` return type change in Phase A is the ONLY API change that ripples through the codebase. Audit every caller after Phase A merges to catch stale usage of `owner.id` meaning "profile id."
- Keep the "human approval gate" positioning even on Teams tier. No auto-send, ever.
