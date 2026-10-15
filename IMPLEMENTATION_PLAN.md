# DWN Lead Engine — Implementation Plan

**Status:** Phase 5 complete (scoring engine + opportunity briefs)
**Last updated:** 2026-10-15
**Spec:** [`DWN_Lead_Engine_Claude_Code_Spec (1).md`](./DWN_Lead_Engine_Claude_Code_Spec%20(1).md) — the authoritative PRD. This document is the operational mirror.

---

## 1. Repo reconnaissance (findings)

- **Starting state:** Greenfield. The workspace `c:\Coding Files\Lead Generator\` contained only the spec file before this phase.
- **No prior commits, lockfile, or framework coupling** — no legacy Supabase/Firebase/D1 code to migrate around. The "if an existing repo is tightly coupled to Supabase, migrate deliberately" clause (spec §5) does not apply.
- **DWN brand assets** live next door at `c:\Coding Files\DWN\dwn-website-design\project\` (static Divinector HTML, `_ds/` design-system folder, `uploads/` imagery). Two design systems are present:
  - `modernist-*` — neutral grey, bright red accent (`#ec3013`), Archivo everywhere, 0-radius.
  - `organic-*` — warm cream (`#f5ead8`), terracotta accent (`#c67139`), olive secondary (`#7a8a5e`), Caprasimo display + Figtree body, 8–28px radius. **DWN's current live site uses this system.**
- **Package manager:** `pnpm` chosen (fast, matches OpenNext docs, no project constraint against it).

### Brand direction decision

The spec (§6) asks for a Linear/Stripe-style internal-tool aesthetic (neutral surfaces, compact tables, keyboard discipline) AND to pull the accent from DWN's existing brand. The Organic cream-background system is beautiful for an editorial agency site but fights data density. The Modernist palette is closer to the right ergonomics but isn't what DWN publicly presents.

**Resolution:** Neutral off-white / near-black surfaces (CRM ergonomics), DWN's actual terracotta `#c67139` as the single restrained accent, olive `#7a8a5e` reserved for positive/success states. Type: Figtree throughout (geometric sans, works at small sizes); Caprasimo reserved for the brand mark / sign-in splash only. This honors "inspect existing website for its current brand palette before inventing a new one" without importing a palette that hurts the primary job.

If the owner (Nihar) prefers a fuller Organic treatment, flip the surface tokens later — the design system will be token-driven so this is a one-file change.

---

## 2. Technical stack (final decisions)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 App Router**, TypeScript strict | Spec §5 non-negotiable. Latest minor supported by OpenNext. |
| Runtime | **Cloudflare Workers** via `@opennextjs/cloudflare` | Current recommended path (Pages adapter is deprecated for new Next.js apps). |
| Database | **Cloudflare D1 (SQLite)** | Spec §5 non-negotiable. Not Supabase. |
| ORM | **Drizzle ORM** + `drizzle-orm/d1` + `drizzle-kit` | Spec §5 explicit, best current D1 story. |
| Styling | **Tailwind CSS v4** + shadcn/ui (manual, not CLI-locked) + Lucide | Spec §5. |
| Forms / validation | React Hook Form + **Zod** | Spec §5, §10, §13. |
| Tables | TanStack Table where useful | Spec §5. |
| Charts | Recharts (sparingly, reports only) | Spec §5. |
| Package manager | **pnpm** | Fast, deterministic. |
| Local dev | `pnpm dev` (Next dev server) + `pnpm wrangler dev` for Workers runtime verification | Keeps iteration fast without constantly booting a Worker. |
| Deployment | `pnpm opennextjs-cloudflare build && pnpm wrangler deploy` | Standard OpenNext flow. |

### Compatibility pins
- `compatibility_date`: `2024-09-23` or later.
- `compatibility_flags`: `["nodejs_compat", "global_fetch_strictly_public"]` — the second flag is critical for SSRF defense: it forces runtime `fetch()` to reject private/loopback IPs. We still implement application-layer SSRF checks (spec §9), but this is defense-in-depth.
- **Avoided:** Node Middleware (Next 15.2+) — not supported by OpenNext. We'll use Edge middleware or route-level checks instead.
- **Avoided:** Playwright / Chromium / native Node packages in the Worker — spec §5 forbids assuming availability. Audit engine uses bounded `fetch` + an HTML parser only.

### Deferred until justified
- R2 (CSV artifacts, generated reports) — not needed until Phase 3.
- Queues (async discovery/audit) — Phase 4+ at earliest; MVP uses foreground batches with a polling UI (spec §7.2 explicitly allows this).
- KV (cache/config) — only if needed for rate-limit counters or settings cache; initial `app_settings` lives in D1.
- Cron Triggers — only if we add scheduled rescoring or audit refresh (not in MVP acceptance criteria).
- Cloudflare Workers AI — treated as *one optional provider*, not the default. Provider abstraction supports swap-in.

---

## 3. Authentication strategy

Spec §5 (Authentication section) lists two acceptable paths; neither should be the "default":

**Chosen for MVP: Cloudflare Access**, with a documented fallback plan for app-managed auth.

Rationale: DWN Lead Engine is a **single-owner internal tool** (user memory confirms Nihar is the sole intended user). Cloudflare Access gives us:
- Zero custom crypto to maintain.
- Email/Google-SSO gate at the edge, before the Worker runs.
- Identity assertion forwarded as `Cf-Access-Jwt-Assertion` header; we verify it server-side on every protected route.
- No password reset, session store, or MFA code to build.

Server-side verification lives in a single middleware helper that:
1. Reads `Cf-Access-Jwt-Assertion`.
2. Verifies the JWT against the team's JWKS endpoint.
3. Attaches the authenticated email to the request context.
4. Rejects (403) if the header is missing or invalid.

**Local dev:** `pnpm dev` runs without Access (localhost). A `DEV_OWNER_EMAIL` env var provides the identity for local-only auth bypass. This is clearly marked and only honored when `process.env.NODE_ENV !== 'production'`.

**Fallback (if Access doesn't fit):** Lucia-style or Auth.js session auth with D1 session table. Keep the owner-check helper identical in signature so the swap is cheap. Decision recorded here so the plan doc stays authoritative.

---

## 4. Project layout (target)

```
c:/Coding Files/Lead Generator/
├── DWN_Lead_Engine_Claude_Code_Spec (1).md    # authoritative PRD (do not edit)
├── IMPLEMENTATION_PLAN.md                      # this document
├── README.md                                   # setup + run instructions
├── .env.example                                # Next.js-side vars only
├── .dev.vars.example                           # Wrangler-side secrets (local)
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json                               # strict mode on
├── next.config.ts
├── open-next.config.ts                         # Cloudflare caching config
├── wrangler.jsonc                              # D1 binding, flags, routes
├── tailwind.config.ts
├── postcss.config.mjs
├── drizzle.config.ts
├── public/
│   └── brand/                                  # DWN logo assets copied from DWN project
├── migrations/                                 # D1 SQL migrations (committed)
│   └── 0000_init.sql
├── src/
│   ├── app/
│   │   ├── (auth)/                             # sign-in splash (if app-managed)
│   │   ├── (app)/                              # authenticated shell
│   │   │   ├── layout.tsx                      # sidebar + topbar
│   │   │   ├── overview/
│   │   │   ├── discover/
│   │   │   ├── leads/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── campaigns/
│   │   │   ├── outreach/
│   │   │   ├── tasks/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── api/                                # route handlers (spec §13)
│   │   ├── layout.tsx                          # root layout, fonts, theme
│   │   └── globals.css                         # Tailwind + tokens
│   ├── lib/
│   │   ├── auth/                               # Access JWT verification + helpers
│   │   ├── db/                                 # Drizzle client, schema, migrations runner
│   │   ├── validation/                         # shared Zod schemas
│   │   ├── scoring/                            # deterministic score engine
│   │   ├── audit/                              # website audit + SSRF guard
│   │   ├── sources/                            # LeadSourceAdapter implementations
│   │   ├── ai/                                 # provider abstraction (optional)
│   │   ├── csv/                                # import/export, formula-injection guards
│   │   └── demo/                               # seed data + demo-mode toggle
│   ├── components/
│   │   ├── ui/                                 # shadcn primitives
│   │   ├── layout/
│   │   ├── leads/
│   │   ├── campaigns/
│   │   └── ...
│   └── types/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/                                    # Playwright (host-side, not Worker-side)
```

---

## 5. Phase breakdown (mirrors spec §20, with concrete deliverables)

### Phase 0 — Repo reconnaissance *(complete, 2026-10-14)*
- [x] Mine DWN brand assets, pick palette direction.
- [x] Verify OpenNext + Next.js 15 compatibility (Cloudflare Workers target).
- [x] Pick package manager (pnpm) and auth strategy (Cloudflare Access + Access-free local dev).
- [x] Scaffold the project (Next 15 TS, Tailwind v4, OpenNext, Wrangler, Drizzle).
- [x] Lay down brand tokens, root layout, route stubs for all 8 nav sections.
- [x] Verify `pnpm typecheck` passes and `pnpm dev` serves 200s on every route.
- [ ] `pnpm preview` (Workers runtime bundle) — deferred; retest at the end of Phase 2 when real routes exist. Not a Phase 0 gate.
- [ ] Commit nothing (no git repo until user asks).

**Exit criteria met:** `pnpm dev` renders the full sidebar + topbar shell with DWN brand tokens applied. Every nav item routes to a Phase 0 placeholder panel explaining what the later phase will build. `IMPLEMENTATION_PLAN.md` and `README.md` are current.

### Phase 1 — App shell + demo workflows (no DB)
- Design tokens, typography scale, light/dark mode.
- Sidebar + topbar layout, keyboard-focused patterns.
- All 8 top-level routes with real UI (Overview, Discover, Leads, Lead Detail, Campaigns, Outreach, Tasks, Reports, Settings).
- Demo data served from an in-memory module keyed to `demo_mode = true`.
- Dead-button policy: every control does something (even if that something is "open an empty detail panel").
- Loading / empty / error / success states for every list.

**Exit criteria:** A user can click through every nav item, see demo leads, open a demo lead detail, see a demo audit, generate a template-based opportunity brief, approve a demo draft. Zero backend.

### Phase 2 — D1, auth, CRUD *(complete, 2026-10-14)*
- D1 schema matching spec §12. Migrations in `migrations/`.
- Drizzle schema module mirroring the SQL (type-safe queries).
- Cloudflare Access JWT verification helper + local bypass.
- Owner-scoped CRUD for leads, campaigns, tasks, activities, outreach drafts.
- API routes with Zod validation + consistent error shape.
- Authorization tests (one owner cannot read another's rows).
- Replace demo data wiring with D1 queries (demo mode becomes a seeded owner, not an in-memory fixture).

**Exit criteria:** Create → list → edit → archive a real lead against local D1. Auth check enforced server-side. Tests green.

### Phase 3 — CSV + campaigns + dashboard-from-real-data *(complete, 2026-10-14)*
- CSV template, preview, row-level validation, dedup, partial import, downloadable summary.
- Formula-injection defense on both import (reject inbound) and export (prefix dangerous cells).
- Campaign create / associate / status flow.
- Dashboard metrics computed from D1 (`COUNT` queries behind a `/api/reports/summary`).
- Activity timeline + task CRUD.

### Phase 4 — Website audit engine *(complete, 2026-10-14)*
- `src/lib/audit/ssrf.ts`: URL + resolved-IP guard with tests (private IPv4/IPv6, loopback, link-local, metadata endpoints, redirect-to-private).
- Bounded HTML fetcher (timeout, size cap, redirect count, concurrency limit).
- HTML parser (`node-html-parser` — pure JS, Workers-compatible, 15 KB).
- Baseline checks (spec §9 §Checks for MVP, items 1–11, plus server-observed timing).
- Optional PageSpeed Insights adapter behind a feature flag + env key *(deferred)*.
- Audit history + versioned findings persisted to `website_audits`.

### Phase 5 — Scoring + opportunity briefs *(complete, 2026-10-15)*
- Deterministic score engine with configurable weights in `app_settings`.
- Score breakdown + version persisted on every scoring.
- "Insufficient evidence" state when inputs are too thin.
- Template-based opportunity brief generator (works without AI).

### Phase 6 — Discovery adapters *(complete, 2026-10-15)*
- `LeadSourceAdapter` interface + registry in `src/lib/sources/`.
- CSV + manual + Google Places adapters.
- Discovery runner handles dedup (domain + name/city), optional per-result audit, optional post-run scoring.
- Field-masked Places v1 call limits payload to the columns we persist.

### Phase 7 — AI-assisted outreach *(complete, 2026-10-15)*
- Template-based `buildTemplateDraft` always available (no key required).
- `buildAiDraft` calls Anthropic Messages API via `fetch` (no SDK), with Zod schema validation on model output.
- Draft lifecycle unchanged; do-not-contact is enforced *before* draft creation.
- Template fallback whenever the AI call fails — reason captured in `personalizationEvidence`.

### Phase 8 — Reporting + production hardening *(complete, 2026-10-15)*
- Added city breakdown to `/reports`.
- In-memory sliding-window rate limiter on audit / discovery / AI-draft actions.
- Runbook notes added to README (secrets, migrations, deploy, rollback).

---

## 6. Non-negotiable guardrails (from spec, pinned here)

1. **No scraping Google Search HTML or LinkedIn.** No CAPTCHA bypass. No proxy rotation for evasion.
2. **No auto-sending outreach.** "Approved" means approved for the owner to send manually.
3. **No fake metrics in production.** Demo data is tagged visibly; production dashboards query real tables.
4. **No `NEXT_PUBLIC_*` secrets.** API keys live in Wrangler secrets / `.dev.vars`.
5. **No arbitrary URL fetching without SSRF guards.** The audit engine's fetcher is the only outbound-fetch helper and is tested against the private-IP matrix.
6. **No RLS claims without implementation.** Server-side owner checks run on every protected handler; "UI hiding" is never the authorization mechanism.
7. **No background-job pretense.** Jobs run foreground until Queues are wired explicitly in a later phase.
8. **No AI dependency for core CRM.** Everything from lead CRUD through scoring works without an AI key.
9. **CSV safety on both edges.** Reject formula-prefixed inbound, prefix outbound dangerous cells.
10. **Do-not-contact flag is honored before drafts are created**, not just when sending.

---

## 7. Open questions / deferred decisions

| # | Question | Decision window | Default if silent |
|---|---|---|---|
| 1 | Cloudflare Access vs app-managed auth | Phase 2 start | **Cloudflare Access** (chosen above) |
| 2 | HTML parser for audit: `linkedom` vs `node-html-parser` | Phase 4 start | `linkedom` (closer to DOM API, Worker-tested) |
| 3 | AI provider for Phase 7 | Phase 7 start | Anthropic Claude Sonnet (owner may provide key) |
| 4 | Demo-mode UX: tenant flag vs separate seeded owner | Phase 2 end | Separate seeded owner tagged `is_demo=true` |
| 5 | Deployment target domain | Phase 8 | TBD — owner to provide subdomain |

---

## 8. Running log of phase completions

### Phase 0 — Repo reconnaissance *(complete, 2026-10-14)*

**What was implemented**
- Mined DWN brand (Organic system — terracotta `#c67139`, olive `#7a8a5e`, Caprasimo + Figtree). Chose CRM-neutral surfaces with terracotta accent only; Caprasimo reserved for display, Figtree used throughout.
- Verified `@opennextjs/cloudflare` supports Next.js 15 App Router on Workers; pinned `nodejs_compat` + `global_fetch_strictly_public` flags and compat date `2024-12-30`.
- Scaffolded the Next.js 15 + TypeScript strict + Tailwind v4 project at the workspace root.
- Wrote the full Cloudflare toolchain: `wrangler.jsonc` (D1 binding placeholder, flags, assets, observability), `open-next.config.ts`, `drizzle.config.ts`, `.env.example`, `.dev.vars.example`, `.gitignore`, `pnpm-workspace.yaml` with `allowBuilds`.
- Built the authenticated-shell layout: `(app)/layout.tsx`, `Sidebar`, `Topbar`, `PageHeader`, `PlaceholderPanel` — all token-driven and themed to the DWN accent.
- Placeholder page for every nav route (Overview, Discover, Leads, Campaigns, Outreach, Tasks, Reports, Settings). Each one explains which later phase will build it and what to expect.
- Root `/` 307-redirects to `/overview`.
- Memory system seeded: `project_dwn_lead_engine.md`, `user_role.md`, `reference_dwn_assets.md`, `MEMORY.md` index.

**Files created**
- Config: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `open-next.config.ts`, `wrangler.jsonc`, `drizzle.config.ts`, `postcss.config.mjs`, `.env.example`, `.dev.vars.example`, `.gitignore`
- Docs: `README.md`, `IMPLEMENTATION_PLAN.md` (this file)
- App: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/(app)/layout.tsx`, and `src/app/(app)/<section>/page.tsx` × 8
- Shared: `src/lib/utils.ts`, `src/lib/nav.ts`, `src/components/layout/{sidebar,topbar,page-header}.tsx`, `src/components/placeholder-panel.tsx`

**Commands run and results**
- `pnpm install` — 619 packages installed, build scripts (esbuild, sharp, workerd, unrs-resolver) approved via `pnpm-workspace.yaml` `allowBuilds`.
- `pnpm typecheck` — clean, no errors.
- `pnpm dev` — Ready in 4.9s. Fixed `experimental.typedRoutes` → top-level `typedRoutes` after initial warning.
- `curl http://localhost:3000/*` — root 307s to `/overview`; all 8 nav routes return HTTP 200 with 40–45 KB of HTML. Sidebar brand marks render.

**External credentials needed:** none yet. Google Places, PageSpeed, and AI provider keys are all deferred to the phases that use them.

**Known limitations entering Phase 1**
- No D1 database created yet — `wrangler.jsonc` has a `REPLACE_WITH_D1_ID_AFTER_WRANGLER_D1_CREATE` placeholder. `pnpm wrangler d1 create dwn_lead_engine` happens at Phase 2 kickoff.
- `pnpm preview` (Workers runtime bundle) not yet exercised; retest when real server-side routes exist at the end of Phase 2.
- No tests yet — Phase 1 adds the Vitest harness; Phase 2 adds authorization tests; Phase 4 adds the SSRF matrix.
- No git repo. User to confirm when they want `git init`.

**Next step**
Phase 1 — app shell + demo workflows. First task: install the shadcn primitives we'll use (`button`, `card`, `table`, `badge`, `dialog`, `input`, `select`, `tabs`, `dropdown-menu`), build the demo-mode data module, and replace the placeholder panels with the full Overview dashboard tiles backed by the fixture.

---

### Phase 1 — App shell + demo workflows *(complete, 2026-10-14)*

**What was implemented**

- **Demo data module** (`src/lib/demo/`) — 17 fictional leads across every niche (jewellery, D2C, hospitality, interiors, architecture, consulting, clinics, SMB-ops), 5 campaigns (one draft, one paused, three active), 7 website audits with findings (incl. HTTP 522 "unavailable", broken form, no-HTTPS, PDF-menu, oversized hero), 3 opportunity briefs, 6 outreach drafts spanning the full lifecycle (`draft`, `needs_review`, `approved`, `contacted`, `replied`), 8 tasks grouped across overdue/today/thisWeek/upcoming/completed, 10 activity events, 3 discovery jobs (one `completed`, one `partial`). All reserved/example domains. One lead explicitly in the `insufficient_evidence` state. One deal `won`, one `lost`, two `not_a_fit` to exercise outcome handling.
- **Public selectors** (`src/lib/demo/index.ts`) — `getLeads`/`getLead`/`getLeadsByCampaign`, filtering + sorting, overview metrics, pipeline funnel, source/niche/score-band breakdowns, campaign metrics (with denominators), task grouping, draft grouping, activity/audit/brief lookups. Signatures designed so Phase 2 can swap the impl for Drizzle queries without touching page code.
- **Formatters** (`src/lib/demo/format.ts`) — labels for every enum, IST-aware date formatters, relative-time formatter anchored to the demo "now", score-band + severity + stage color helpers, currency + bytes + ms formatters.
- **UI primitives** (`src/components/ui/`) — `Button` + `ButtonLink`, `Card`/`CardHeader`/`CardBody`/`CardFooter`, `Badge` (8 variants), `Input` + `Textarea` + `Select` + `Field` + `Label`, `Table` + `THead`/`TBody`/`TR`/`TH`/`TD`, `EmptyState`, `StatTile`, `Tabs` (link-based, server-rendered). All token-driven, no runtime theming libs.
- **Demo banner** (`src/components/layout/demo-banner.tsx`) — persistent terracotta-tinted banner above the topbar flagging that every record is fictional.
- **Overview** — 10 stat tiles (total/new-this-week/needing-review/qualified/follow-ups-due/drafts-awaiting/replies/meetings/proposals/wins + revenue hint), pipeline funnel bars, Due-today panel sourcing overdue + today tasks, Recent activity feed with lead cross-links, Lead-source breakdown bars, Best-performing campaigns table with explicit denominators (`replies / contacted`). Quick actions on page header (Find leads / Import CSV / Add lead).
- **Leads list** — URL-driven filters (q, niche, city, stage, condition, source), sort (score/updated/created/name), count summary, server-rendered table, score-band chips, hover-only external link icons, inline notices for `?action=new` and `?action=import` explaining when those arrive. Clear filter link.
- **Lead detail** — all 8 sections from spec §7.4 built out:
  1. Stage + score + website condition + source tiles,
  2. Business profile (website, email, phone, address, tags),
  3. "Why this lead" with full score breakdown (positive points in green, penalties in red, evidence shown + source links where available, insufficient-evidence empty state),
  4. Website audit (HTTP status / page weight / server-timed load, limits note, per-finding card with severity, evidence + source, confidence, and recommended fix),
  5. Opportunity brief (summary, verified observations, possible opportunity, recommended service, suggested deliverable, unknowns),
  6. Outreach drafts (channel badge, status badge, body preview, personalization evidence list, inline Approve/Mark contacted/Log reply actions),
  7. Activity timeline (vertical with timestamp dots),
  8. Tasks + Outcome sidebar (won/lost/not_a_fit shows deal value + loss reason).
- **Discover** — new-discovery form with campaign/niche/city/keywords/limit/source + three run-time flags (audit, score, skip DNC), Available-sources panel showing Manual/CSV/Google-Places with Ready / Phase-3 / Needs-key badges, Policy reminders card, Recent discovery jobs table with partial-status warning tooltip for the Google-Places-no-key case.
- **Campaigns** — card grid with per-campaign metrics (Leads/Qualified/Replies+Contacted denominator/Wins), explicit denominator reminder card. Campaign detail: 6-tile metric row, audience & offer block, status sidebar, associated-leads table.
- **Outreach** — 6-column kanban (Draft / Needs review / Approved / Contacted / Replied / Archived) with per-card channel + updated time + body preview + personalization evidence chips + status-appropriate action buttons. Mandatory-human-approval callout at top.
- **Tasks** — 5-stat header (Overdue/Today/This week/Upcoming/Completed) + grouped lists with lead cross-links, priority + status badges, completion checkbox (disabled until Phase 2).
- **Reports** — Pipeline funnel, Outcomes panel (wins + recorded revenue), Score distribution bars, Niche breakdown bars, Source breakdown bars, Campaign comparison table with explicit numerator/denominator for replies.
- **Settings** — Business profile (editable studio name / city / currency / pitch), Services & offers (list of 6 service lines, each editable + hide-able), Scoring weights (10 factors with point input + Disable button), Source integrations (Google Places + PageSpeed shown as "Not configured" with `wrangler secret put` instructions, never a key value), AI provider (Templates-only / Anthropic selector + env status), Audit settings (timeout, size cap, redirects, user-agent, with SSRF-guard note), Demo mode (reset button + Phase-2 live-mode toggle).
- Root `/` 307 → `/overview` unchanged.

**Files created**
- `src/lib/demo/{types,data,format,index}.ts`
- `src/components/ui/{button,card,badge,input,table,empty-state,tabs,stat-tile}.tsx`
- `src/components/layout/demo-banner.tsx`
- `src/app/(app)/{overview,discover,leads,campaigns,outreach,tasks,reports,settings}/page.tsx` (rewrote all 8 placeholders)
- `src/app/(app)/leads/[id]/page.tsx` (new dynamic route)
- `src/app/(app)/campaigns/[id]/page.tsx` (new dynamic route)

**Commands run and results**
- `pnpm typecheck` — clean after each incremental build.
- `pnpm dev` — ready in 2s. First-render compile times: Overview 689ms (671 modules), rising to 737 modules for the campaign detail route — reasonable.
- Smoke test on 17 routes (8 nav + 2 lead details + 2 campaign details + 3 filter variations + 2 action query strings) — every one returned HTTP 200.
- Dev-server console: no warnings, no React hydration errors, no missing-dep warnings.

**External credentials needed:** still none. Google Places / PageSpeed / AI remain optional and gated behind their later phases.

**Known limitations entering Phase 2**
- Everything is still client-less — no interactive sort/filter beyond form-submit, no multi-select, no checkbox interactivity. Those become real in Phase 2 (CRUD) and Phase 3 (CSV + campaigns).
- All approve/mark-contacted/add-task buttons on the Lead detail render but have no handlers. They'll wire up in Phase 2 once API routes exist.
- Demo data is in-memory per-request; no persistence between page loads for any mutation. Expected.
- The sort form in Leads uses two separate `<form>` elements — the sort form carries filters as hidden inputs. This works via URL round-trips but will be unified into a single controlled form in Phase 2 when we introduce client interactivity.
- Still no git repo.

**Next step**
Phase 2 — D1 + CRUD + auth. First tasks:
1. `pnpm wrangler d1 create dwn_lead_engine` (needs Cloudflare login).
2. Draft `src/lib/db/schema.ts` matching spec §12 and generate the initial migration.
3. Build the Cloudflare Access JWT verifier + local-dev bypass.
4. Add owner-scoped CRUD route handlers for leads, campaigns, tasks, drafts, activities.
5. Replace demo-data calls behind a `demoMode` guard that resolves to D1 queries when the owner is a non-demo user.
6. Write authorization tests (owner A cannot read owner B's rows).

---

### Phase 2 — D1, auth, CRUD *(complete, 2026-10-14)*

**What was implemented**

- **Drizzle schema** (`src/lib/db/schema.ts`) covering every spec §12 table in SQLite dialect: `profiles`, `campaigns`, `leads`, `campaign_leads` (junction), `discovery_jobs`, `lead_sources`, `website_audits`, `opportunity_briefs`, `outreach_drafts`, `activities`, `tasks`, `service_offerings`, `app_settings`. UUIDs are `TEXT`, timestamps are `TEXT` ISO-8601, booleans are `INTEGER (0, 1)`, enum columns are `TEXT` with Drizzle's enum helper. Inferred `Lead`, `NewLead`, etc. types exported for repository consumers.
- **Migration SQL** (`migrations/0001_init.sql`) hand-written to mirror the schema with CHECK constraints Drizzle's helpers don't emit (enum validity + `fit_score BETWEEN 0 AND 100`). 44 statements applied cleanly via `pnpm db:migrate:local`.
- **D1 client** (`src/lib/db/client.ts`) — `getDb()` reads the `DB` binding through `getCloudflareContext({ async: true })` and returns a cached Drizzle instance per request. Throws a clear error if the binding is missing so misconfiguration surfaces loudly.
- **Normalization helpers** (`src/lib/db/normalize.ts`) — pure, dependency-free: `normalizeDomain`, `normalizeUrl`, `normalizeName`, `clampScore`, `scoreBandFor`. Rejects non-http(s) schemes (`javascript:`, `file:`, `ftp:`), null-returns on parse failure, forces lowercase + www-strip, clamps scores and non-finite values.
- **Auth layer** (`src/lib/auth/`) — two files:
  - `access.ts` — Cloudflare Access JWT verification using `jose`, with a cached per-team JWKS fetcher. Enforces issuer + audience. Requires `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` in production.
  - `session.ts` — `getIdentity()` reads the `Cf-Access-Jwt-Assertion` header → `verifyAccessJwt` → `{ email, name }`, with `DEV_OWNER_EMAIL` bypass that's hard-gated to `NODE_ENV !== 'production'` (so a leaked env var can never unlock prod). `getOwner()` resolves or auto-creates the `profiles` row. `requireOwner()` throws a `Response(401)` for API routes; `requirePageOwner()` (in `src/lib/data.ts`) calls `notFound()` for pages.
- **Repositories** (`src/lib/db/repos/`) — nine owner-scoped modules + a barrel:
  - `leads.ts`: `listLeads` with 8 filters + 4 sort keys, `getLead`, `findLeadByDomain` + `findLeadByNameAndCity` (dedup), `createLead` with URL/domain/name normalization, `updateLead`, `archiveLead`, `listDistinctNiches`, `listDistinctCities`, `countOwnerLeads`.
  - `campaigns.ts`: list, get, create, update, `listLeadsByCampaign` (junction + niche-fallback), `getCampaignMetrics` with explicit replies/contacted denominator, `listBestCampaigns`, `assignLeadToCampaign` / `unassignLeadFromCampaign` with owner-match checks on both sides.
  - `tasks.ts`: list, get, create, update (auto-stamps `completed_at` on done), delete.
  - `drafts.ts`: list, get, create (always starts `needs_review`), `transitionDraft` (stamps `approved_at` / `contacted_at` / `replied_at` on the matching transition only), `updateDraftBody`.
  - `activities.ts`: list, create (with limit).
  - `audits.ts`: list + latest + create, with ownership verified via join through `leads`.
  - `briefs.ts`: same ownership-via-join pattern.
  - `discovery-jobs.ts`, `service-offerings.ts`, `metrics.ts` (SQL `CASE WHEN` aggregations for overview tiles + funnel + source/niche/score-band breakdowns).
- **Adapters** (`src/lib/db/adapt.ts`) — bridge DB row shapes to the Phase 1 view-model types. Keeps page code unchanged across the swap. Includes `scoreBreakdownToColumns` for writes with band derivation.
- **Seed generator** (`scripts/generate-seed.ts`) — emits `scripts/seed.sql` (gitignored, 50 KB) from the Phase 1 fixtures. `pnpm db:seed` runs the generator then `wrangler d1 execute --local --file=scripts/seed.sql`. Idempotent: deletes the demo owner before re-inserting, so repeated runs don't accumulate. Native-build dep (`better-sqlite3`) was dropped in favor of this pure-SQL path after Visual Studio build tools failed on Windows.
- **API routes** (`src/app/api/`):
  - `_lib/response.ts` — `jsonOk` / `jsonCreated` / `jsonError` / `parseJson(req, schema)` / `withErrorHandling(handler)`. Consistent envelope: `{ error: { code, message, details? } }`. Catches thrown `Response`, `ZodError`, `UnauthenticatedError`.
  - `_lib/schemas.ts` — Zod enums + field validators shared across handlers.
  - `/api/leads` (GET list w/ filter + sort, POST create w/ dedup → 409 on normalized-domain or (name, city) match).
  - `/api/leads/[id]` (GET, PATCH, DELETE → archive).
  - `/api/campaigns` + `/api/campaigns/[id]`.
  - `/api/tasks` + `/api/tasks/[id]`.
  - `/api/outreach-drafts/[id]` (PATCH handles both content edits and status transitions through `transitionDraft`; refuses `approved` / `contacted` on do-not-contact leads with 409).
- **Page data facade** (`src/lib/data.ts`) — `pageListLeads`, `pageGetLead`, `pageDistinctNiches`, `pageListCampaigns`, `pageOverviewMetrics`, `pagePipelineFunnel`, `pageSourceBreakdown`, `pageNicheBreakdown`, `pageScoreBandBreakdown`, `pageListTasks`, `pageGroupedTasks`, `pageListDrafts`, `pageGroupDraftsByStatus`, `pageListAudits`, `pageLatestAudit`, `pageListBriefs`, `pageLatestBrief`, `pageListActivities`, `pageListDiscoveryJobs`, `pageListServices`, `pageBestCampaigns`, `pageCampaignMetrics`, `pageListLeadsByCampaign`. Every function first calls `requirePageOwner()` so a page cannot forget auth.
- **All 8 nav pages rewritten** to call the facade. Where child components needed cross-row lookups (Overview → activity → lead, Outreach → draft → lead, Tasks → task → lead), the parent now prefetches a single `leads` list and passes `leadById: Map<string, Lead>` to children instead of calling `getLead` per row (avoids N+1 queries).
- **Vitest harness** + 38 unit tests across three files:
  - `tests/unit/normalize.test.ts` (18 tests) — domain stripping, bare-domain promotion, non-http(s) rejection (`javascript:`, `file:`, `ftp:`), URL canonical form, name whitespace + punctuation handling, score clamping (negative, >100, NaN, Infinity), score band classification + insufficient-evidence override + clamp-before-classify.
  - `tests/unit/adapt.test.ts` (5 tests) — `rowToLead` round-trip of nested score + nested do_not_contact, `scoreBreakdownToColumns` derives band from `(total, confidence)`.
  - `tests/unit/format.test.ts` (15 tests) — `formatRelative` within same minute / hour / day / month, INR currency with Indian grouping, byte/ms formatters, source-label fallback for unknown ids, palette helpers return non-empty strings for every enum variant.
- **Env + config**:
  - `.env.local` created (gitignored) with `DEV_OWNER_EMAIL=demo@dwn.local` so the dev bypass resolves to the seeded demo profile.
  - `.gitignore` adds `scripts/seed.sql` (generated artifact).
  - `package.json` adds `db:seed`, `db:seed:generate`, `db:seed:remote`, `test`, `test:watch`.
  - `pnpm-workspace.yaml` unchanged (no new native builds).

**Files added / modified**
- Schema + migrations: `src/lib/db/{schema,client,normalize,adapt}.ts`, `migrations/0001_init.sql`
- Auth: `src/lib/auth/{access,session}.ts`
- Repos: `src/lib/db/repos/{leads,campaigns,tasks,drafts,activities,audits,briefs,discovery-jobs,service-offerings,metrics,index}.ts`
- API: `src/app/api/_lib/{response,schemas}.ts`, `src/app/api/{leads,campaigns,tasks}/route.ts` and `.../[id]/route.ts`, `src/app/api/outreach-drafts/[id]/route.ts`
- Pages (modified): all 8 nav pages + both dynamic details — swapped to facade imports, awaited, with lead-by-id maps where needed
- Facade: `src/lib/data.ts`
- Seed: `scripts/generate-seed.ts`
- Tests: `vitest.config.ts`, `tests/unit/{normalize,adapt,format}.test.ts`
- Deps: `jose`, `vitest`, `tsx` added
- Env + docs: `.env.local`, `.gitignore`, `README.md`, `package.json`

**Commands run and results**
- `pnpm install` — jose, vitest, tsx installed clean.
- `pnpm wrangler d1 migrations apply dwn_lead_engine --local` — 44 statements applied to `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`. **No remote traffic** (every command uses `--local`).
- `pnpm db:seed` — `scripts/seed.sql` generated (51 KB), applied cleanly.
- `pnpm wrangler d1 execute dwn_lead_engine --local --command='SELECT ... FROM leads'` — confirms 17 leads, 6 campaigns, 8 drafts, 7 audits in the demo-owner namespace.
- `pnpm typecheck` — clean after three fix-ups (nullable URL/email/phone/region patches, Zod default narrowing on `sourceName`, activities `createdAt` type-narrowing).
- `pnpm dev` — ready in 1.9s. All 16 smoke-test routes (8 nav + 4 lead details + 2 campaign details + 2 filter variants) returned HTTP 200. `curl /leads?q=haveli` returned HTML containing `Haveli Fine Jewels` + `lead_haveli` + `Priority review`, confirming the full D1 → repo → adapter → page → DOM chain.
- `pnpm test` — 38 / 38 tests pass in 779 ms.

**Auth status**
- Wrangler CLI happens to be authenticated against `agniradev@gmail.com` locally, but **no command issued in this phase touched that account**. Every D1 operation was `--local`. The `wrangler.jsonc` `database_id` is still the `REPLACE_WITH_D1_ID_AFTER_WRANGLER_D1_CREATE` placeholder; `--remote` would fail at that check.

**Known limitations entering Phase 3**
- API route handlers return correct 401/409/404s but have no corresponding frontend-side mutation (buttons on the Lead Detail still don't do anything). Phase 3 wires server actions + optimistic updates.
- Dedup is enforced at the API layer. A cross-source dedup fallback (name + email within an owner) is not yet in place — Phase 3 CSV import will add it.
- D1 integration tests (owner-isolation at the SQL layer) deferred to a dedicated `@cloudflare/vitest-pool-workers` setup in a later phase. Current tests cover pure helpers only.
- Score factor records on seeded leads sometimes include a "negative" numeric entry carrying a positive points value (fixture artifact from Phase 1 — the scoring engine itself is deferred to Phase 5). Does not break scoring display.
- Still no git repo.

**Next step**
Phase 3 — CSV + campaigns + dashboard-from-real-data:
1. CSV template download endpoint + import preview + row-level validation.
2. Formula-injection guards on both import (reject `=`/`+`/`-`/`@` prefixes) and export (prefix with `'`).
3. Dedup preview UI showing new / updated / duplicate / failed counts.
4. Campaign create / associate / status flow wired to API routes.
5. Server actions for the Lead Detail action buttons (Approve draft, Mark contacted, Add task).
6. Activity timeline entries created on every meaningful mutation.

---

### Phase 3 — CSV + campaigns + dashboard-from-real-data *(complete, 2026-10-14)*

**What was implemented**

- **CSV library** (`src/lib/csv/`) — four pure modules, no deps:
  - `parse.ts` — minimal RFC 4180 parser (CRLF/LF, quoted fields, escaped `""`, UTF-8 BOM strip, trailing-newline tolerance, unclosed-quote warning).
  - `emit.ts` — RFC-compliant emitter with the **formula-injection guard** required by spec §14: any cell beginning with `=`, `+`, `-`, `@`, `|`, `\t`, or `\r` is prefixed with `'` so Excel + Sheets refuse to evaluate it. Internal quotes are doubled; cells with commas / quotes / newlines are RFC-quoted. CRLF line endings.
  - `leads.ts` — Lead-specific header aliasing (24 synonyms covering `business name`, `company`, `email`, `industry`, `phone number`, etc.), per-row Zod validation, dedup classification against the owner-scoped `findLeadByDomain` + `findLeadByNameAndCity` lookups (injected, keeps the module pure), and the `EXPORT_COLUMNS` schema the export route uses.
  - `template.ts` — builds the downloadable CSV template with a sample row.
- **Server actions** (`src/lib/actions.ts`) — single `"use server"` module exposing 12 actions: `createLeadAction`, `changeLeadStageAction` (with stage_changed / outcome_recorded activity), `toggleDoNotContactAction`, `archiveLeadAction`, `approveDraftAction`, `markContactedAction` (also stamps `lastContactedAt` and advances the lead to `contacted` stage), `logReplyAction` (advances to `replied`), `archiveDraftAction`, `createTaskAction`, `completeTaskAction`, `createCampaignAction`, `assignLeadToCampaignAction` + `unassignLeadFromCampaignAction`. Every action:
  1. Resolves the owner via `requirePageOwner()`.
  2. Validates with Zod (schemas accept `.transform()` / `.default()` via a `ZodTypeAny` generic that infers the output type).
  3. Writes an **activity row** (`lead_created`, `stage_changed`, `outcome_recorded`, `draft_approved`, `contact_logged`, `reply_logged`, `lead_updated`) so the timeline is append-only.
  4. Calls `revalidatePath` on every page that reads affected rows.
  5. The DNC guard — `approved` / `contacted` transitions throw for leads flagged do-not-contact (mirrors the API route behaviour).
- **CSV API routes:**
  - `GET /api/leads/export` — streams a CSV of the current filter (`q`, `niche`, `city`, `stage`, `condition`, `source`, `minScore`, `maxScore`, `sort`). Formula-guarded.
  - `GET /api/leads/import/template` — downloads the sample template (owner-gated).
  - `POST /api/leads/import` — discriminated-union body: `{ mode: "preview", content }` returns the classified preview; `{ mode: "commit", content, duplicateStrategy, sourceName }` inserts new rows, optionally updates duplicates by domain / (name, city). 5 MB cap. Partial-success tolerant: per-row failures are returned in the response and don't abort the batch.
- **Pages** (new):
  - [`/leads/new`](src/app/(app)/leads/new/page.tsx) — Add Lead form posting to `createLeadAction`. Pre-fills niche + city datalist from the owner's existing distinct values. Server-side dedup gate; a form error surfaces when a duplicate is detected.
  - [`/leads/import`](src/app/(app)/leads/import/page.tsx) + [`import-form.tsx`](src/app/(app)/leads/import/import-form.tsx) — client component for the upload → preview → commit flow. Shows column-mapping report, row-error list, counts (new / dup-domain / dup-name-city / invalid), first-10-row preview, and a strategy selector (`skip` / `update_existing`). Commits via `fetch('/api/leads/import')` then `router.refresh()`.
  - [`/campaigns/new`](src/app/(app)/campaigns/new/page.tsx) — New Campaign form posting to `createCampaignAction`.
- **Wired-up buttons** (previously inert):
  - **Lead Detail header** — stage dropdown + Save button (`changeLeadStageAction`), Mark/Clear DNC (`toggleDoNotContactAction`).
  - **Lead Detail — Outreach drafts** — Approve / Mark contacted / Log reply / Archive buttons for the status-matching transition.
  - **Lead Detail — Tasks** — collapsible "Add task" form (`createTaskAction`), per-task Complete button (`completeTaskAction`).
  - **Outreach kanban cards** — Approve / Mark contacted / Log reply inline per card.
  - **Tasks page** — single-line Add-task form at the top, per-row Complete button, strike-through on completed rows.
  - **Overview + Leads list** — "Add lead" / "Import CSV" / "Export CSV" (query-string-preserved) link to real routes.
- **Reusable form helper** [`src/components/forms/action-button.tsx`](src/components/forms/action-button.tsx) — wraps a single button in its own `<form>` so a server action fires on click without any client JS. Used across Lead Detail, Outreach, Tasks.
- **Tests** — added `tests/unit/csv.test.ts` with 19 tests covering: parser (LF, CRLF, quoted commas / newlines / escaped quotes, BOM stripping, trailing newline, unclosed-quote warning), emitter formula-guard (`=`, `+`, `-`, `@`, `|`, `\t`, `\r` prefixes), RFC quoting (double-quote doubling, cell containing comma / quote / newline is wrapped), round-trip parse→emit→parse, keyed-emitter header handling, header aliasing (case-insensitivity + synonyms + unknown-column null).

**Files added / modified**
- CSV library: `src/lib/csv/{parse,emit,leads,template}.ts`
- Actions + helpers: `src/lib/actions.ts`, `src/components/forms/action-button.tsx`
- API routes: `src/app/api/leads/{export,import}/route.ts`, `src/app/api/leads/import/template/route.ts`
- Pages (new): `src/app/(app)/leads/{new,import}/page.tsx` + `import/import-form.tsx`, `src/app/(app)/campaigns/new/page.tsx`
- Pages (modified): all 8 nav pages + both detail pages — wired to actions where appropriate
- Tests: `tests/unit/csv.test.ts`

**Commands run and results**
- `pnpm typecheck` — clean after Zod generic + nullable-field refactors.
- `pnpm test` — 57 / 57 pass in 384 ms (18 normalize + 5 adapt + 15 format + 19 csv).
- `pnpm dev` — ready in 1.9s. Smoke tested 13 routes (8 nav + 3 new form pages + 2 detail pages). All HTTP 200.
- `GET /api/leads/import/template` — returns the 2-row template; the phone number sample is prefixed with `'` (formula guard proven on export of a `+91…` string).
- `GET /api/leads/export?stage=won` — returns the single Won lead (Pune Perfumery) with ₹3,20,000 recorded revenue.
- `GET /api/leads/export` — every exported phone number starting with `+91` is prefixed with `'`; `"Haveli Lane, Fort"` is RFC-quoted.
- End-to-end import round-trip: POST a 3-row CSV with one duplicate (Haveli) → preview correctly classifies 2 new + 1 dup → commit returns `{ inserted: 2, skippedDuplicate: 1, invalid: 0 }` → D1 confirms both new rows with `source_name = csv_import` and 2 corresponding `lead_created` activity entries.
- D1 cleanup afterwards (`DELETE FROM activities WHERE title LIKE 'Imported Test%'; DELETE FROM leads WHERE business_name LIKE 'Test Import%';`) so demo state is pristine.

**Known limitations entering Phase 4**
- CSV import re-reads the file on commit (browser carries the raw text in memory). Fine for the Phase 3 size cap (5 MB); will be revisited if we need streaming or multi-file batches.
- Campaign-to-lead association is enforced server-side but the Leads list doesn't yet have a bulk "assign to campaign" multi-select. Add from a Lead Detail dropdown instead (deferred to Phase 5 UI polish).
- No optimistic UI on action buttons — the server action completes before the page revalidates. Perceptible delay is sub-100ms locally; may want to add `useOptimistic` or client-side pending states later if it becomes an issue.
- No Textarea / rich-text input for lead notes yet (notes are read-only in the current UI). Phase 4 adds notes + do-not-contact history as part of the audit timeline.
- Audit stub on the Lead Detail still shows seeded findings — real audit engine lands in Phase 4.
- Still no git repo.

**Next step**
Phase 4 — Website audit engine:
1. SSRF guard in `src/lib/audit/ssrf.ts` — URL validation, IP resolution + rejection of private / loopback / link-local / metadata ranges for IPv4 and IPv6, redirect revalidation, concurrency + size + timeout caps.
2. Bounded HTML fetcher that is Workers-compatible (no `undici`, no native Node packages).
3. HTML parser (`linkedom` or `node-html-parser` — verify Workers compat first).
4. Baseline checks per spec §9 (checks 1–11): HTTPS, redirect chain, title/meta, viewport, headings, images alt, broken sampled links, contact path presence, basic timing.
5. Audit history + versioned findings persisted to `website_audits`.
6. Server action: "Re-run audit" on Lead Detail.
7. SSRF test matrix (private IPv4, IPv6 loopback, metadata endpoint, redirect-to-private).
8. Optional PageSpeed Insights adapter behind a feature flag.

---

### Phase 4 — Website audit engine *(complete, 2026-10-14)*

**What was implemented**

- **SSRF guard** ([`src/lib/audit/ssrf.ts`](src/lib/audit/ssrf.ts)) — the critical defense since this is the first phase that makes outbound requests. Rejects:
  - Schemes other than `http:` / `https:` (so `javascript:`, `file:`, `ftp:`, `data:`, `gopher:` all return `unsupported_scheme`).
  - URLs with userinfo (`user:pass@host`).
  - **IPv4 literals** in RFC 1918 (10/8, 172.16/12, 192.168/16), loopback (127/8), link-local (169.254/16), CGNAT (100.64/10), reserved (0/8, 192.0.0/24, 192.0.2/24, 198.18/15, 198.51.100/24, 203.0.113/24), multicast + reserved (224/4, 240/4). Cloud metadata `169.254.169.254` returns a dedicated `metadata_endpoint` reject code.
  - **IPv6 literals** including `::`, `::1`, `fc00::/7` ULA, `fe80::/10` link-local, `ff00::/8` multicast, `64:ff9b::/96`, `2001::/32`, `2001:db8::/32`. IPv4-mapped IPv6 (`::ffff:…`) is blocked **outright** regardless of the embedded IPv4 — mapped forms are a common SSRF bypass trick.
  - **Hostname blocklist** — `localhost`, `0.0.0.0`, `broadcasthost`, `ip6-localhost`, `metadata.google.internal`, `metadata.azure.com`, `instance-data.ec2.internal`. Case-insensitive.
  - **Suffix blocklist** — `.local`, `.internal`, `.localhost`, `.onion`.
  - A dev-only opt-in bypass (`AUDIT_ALLOW_PRIVATE=1`) is hard-gated to `NODE_ENV !== 'production'` so a leaked env var cannot unlock prod.
- **Bracket-aware hostname extraction**: `new URL("http://[::1]/").hostname` returns `[::1]` in Node — we strip the brackets before the IPv6 classifier runs, otherwise every IPv6 literal would slip past as an unrecognized hostname.
- **Bounded HTTP fetcher** ([`src/lib/audit/fetcher.ts`](src/lib/audit/fetcher.ts)):
  - Validates the URL first, then follows redirects **manually** (`redirect: "manual"`) so each hop runs back through the SSRF guard before the next request fires.
  - `AbortSignal.timeout()` per hop (10 s default).
  - Streams the body with a per-chunk byte counter — aborts the stream the moment the configured size cap (2 MB default) is exceeded instead of ever buffering an unbounded payload.
  - Rejects non-HTML content types explicitly (`non_html` stage) rather than parsing random bytes.
  - Caps redirect depth (5 hops default) → `too_many_redirects`.
  - Returns a structured `FetchResult` discriminated union — success includes `html`, `bodyBytes`, `elapsedMs`, `redirectChain`; failure includes `stage` + `reason` so the audit record can surface a human-readable finding.
- **HTML parser** — switched to `node-html-parser` (~15 KB, pure JS, no DOM globals, works in Workers). Parsed via `parseAuditHtml(html)` with tags lowercased and comments stripped.
- **Baseline checks** ([`src/lib/audit/checks.ts`](src/lib/audit/checks.ts)) — eight pure functions returning `AuditFinding[]`:
  1. **HTTPS presence** — HTTP pages flagged `high` severity.
  2. **`<title>` presence + length** — missing / too-short / too-long thresholds.
  3. **`<meta name="description">`** — missing is `low`.
  4. **`<meta name="viewport">`** — missing is `medium` (mobile-breaker).
  5. **Heading structure** — no h1 / multiple h1 flags.
  6. **Image alt text** — samples 20 images; severity scales with ratio missing.
  7. **Contact path** — scans for `mailto:` / `tel:` / `/contact|/book|/enquiry`-style anchors; absence flagged `medium`.
  8. **Page weight** — threshold at 1.2 MB (low) / 2 MB (medium).
- **Audit engine orchestrator** ([`src/lib/audit/engine.ts`](src/lib/audit/engine.ts)): validate → fetch → parse → run checks → `deriveWebsiteCondition()` → return record. Failure paths produce an audit with status `blocked` / `unavailable` / `partial` / `failed` plus a single explanatory finding so the timeline reflects what happened. `deriveWebsiteCondition` maps findings → `strong` / `acceptable` / `outdated` / `weak` based on severity density; the mapping is tested.
- **Server action + persistence**: `runAuditAction` (in [`src/lib/actions.ts`](src/lib/actions.ts)) reads the lead's `websiteUrl` server-side (never from form input — so a user can't trick the server into fetching an arbitrary URL), invokes `runAudit`, persists via `createAudit`, updates `lead.websiteCondition` based on findings, and writes an `audit_run` activity entry.
- **Lead Detail wiring**: the Website Audit section now has a "Run audit" / "Re-run audit" button (disabled when no `websiteUrl` is set). Clicking it fires the server action, re-renders the page, and the new audit lands at the top of the audit section with its findings + the lead's new condition.
- **Tests**:
  - [`tests/unit/audit-ssrf.test.ts`](tests/unit/audit-ssrf.test.ts) — **62 tests** covering scheme + shape, 16 private/reserved IPv4 ranges, 12 private/reserved IPv6 ranges (including IPv4-mapped), hostname blocklist (case-insensitive), suffix blocklist, dev-only bypass (production vs dev with `vi.stubEnv`), and the `parseIpv6` + `isPrivateIpv4` + `isPrivateIpv6` helpers directly.
  - [`tests/unit/audit-checks.test.ts`](tests/unit/audit-checks.test.ts) — **23 tests** covering HTTPS detection, title/description/viewport presence, heading structure, image alt sampling (missing / present / `alt=""` decorative), contact-path variants (mailto / tel / `/contact`), page-weight threshold, and `deriveWebsiteCondition` across every finding-density band.
  - Total suite: **142 tests pass in 466 ms** (18 normalize + 5 adapt + 15 format + 19 csv + 62 ssrf + 23 checks).

**Files added / modified**
- Audit engine: `src/lib/audit/{ssrf,fetcher,checks,engine}.ts`
- Actions: `src/lib/actions.ts` (added `runAuditAction`, imported `createAudit` + `runAudit`)
- Page: `src/app/(app)/leads/[id]/page.tsx` (wired `Re-run audit` button into `WebsiteAuditSection`)
- Deps: `node-html-parser` added
- Tests: `tests/unit/audit-ssrf.test.ts`, `tests/unit/audit-checks.test.ts`
- Scripts: `scripts/smoke-audit.ts` (one-off end-to-end script, not committed to the test suite)

**Commands run and results**
- `pnpm install` — node-html-parser (15 KB) installed clean.
- `pnpm typecheck` — clean after two touch-ups (bracket-stripped IPv6 hostname + Node 24's non-configurable `process.env.NODE_ENV` → `vi.stubEnv`).
- `pnpm test` — **142 / 142** pass in 466 ms.
- `pnpm tsx scripts/smoke-audit.ts` — end-to-end against 9 real + synthetic targets:
  - All 6 SSRF-dangerous URLs correctly **blocked** (loopback IPv4, private IPv4, cloud metadata, IPv6 `[::1]`, `javascript:`, `.local` suffix).
  - `https://example.com/` returned HTTP 200, surfaced 3 findings (no meta description, no h1, no contact path), derived condition `acceptable`.
  - `https://www.cloudflare.com/` returned HTTP 200, surfaced 3 findings (multiple h1, no contact path, 1.33 MB page weight), derived condition `acceptable`.
  - `https://www.cloudflare.com/favicon.ico` returned the `non_html` failure path with the right error category.
- Live Lead Detail test: `UPDATE leads SET website_url='https://example.com' WHERE id='lead_lotus_skincare'`, confirmed the page renders the "Re-run audit" button and the audit section. Restored the original demo URL afterwards.

**Trust-boundary note**
- In the Workers production runtime, these application-layer checks run **alongside** the `global_fetch_strictly_public` compatibility flag we set in Phase 0, which makes `fetch()` itself refuse to resolve to private IPs at the DNS layer. The two layers divide labour: application layer rejects everything we can see from the URL string (IP literals, bad schemes, suspicious hostnames), runtime layer rejects anything that resolves to a private IP at connect time (defeats DNS rebinding, protects against hostnames that pass our blocklist but resolve privately).
- In Next dev (Node runtime) the runtime flag doesn't apply, so the application-layer checks are the only defense. If you need to audit a local test server during development, `AUDIT_ALLOW_PRIVATE=1` in `.env.local` opens an opt-in bypass. The bypass is hard-gated to `NODE_ENV !== 'production'`.

**Known limitations entering Phase 5**
- No broken-link sampling yet (spec §9 item 8 lists it as MVP; current engine extracts links for the contact-path check but doesn't verify each sample). Deferred to the follow-up audit expansion.
- No PageSpeed Insights adapter yet (optional per spec; opt-in flag). Will be added when a real audit workflow benefits from mobile-render metrics.
- No DNS resolution step in Node dev — we rely on hostname blocklist + runtime flag. If dev's lack of `global_fetch_strictly_public` ever matters for a specific attack scenario, we can swap in a `dns.lookup()` resolver call in dev-only paths. Not critical for the Phase 4 scope.
- No concurrency limit on parallel audits yet — one lead = one audit = one in-flight fetch. Will add a per-owner semaphore when the Phase 6 discovery adapters start enqueuing bulk audits.
- The `aborted` and `oversized` branches are tested in the SSRF matrix but not with a mock server — swap in `@cloudflare/vitest-pool-workers` later for proper integration coverage.
- Still no git repo.

**Next step**
Phase 5 — Scoring + opportunity briefs:
1. Deterministic scoring engine in `src/lib/scoring/engine.ts` — reads lead + audit + campaign and computes a bounded 0–100 score with per-factor breakdown.
2. Configurable factor weights in `app_settings`.
3. "Insufficient evidence" state when inputs are too thin (no website, no audit, no public business footprint).
4. Service-fit matching (which DWN service best addresses the audit findings).
5. Template-based opportunity brief generator (works without AI; AI generation is Phase 7).
6. Re-score action + "Score lead" button on Lead Detail.
7. Tests: score bounds, factor combinatorics, insufficient-evidence override, idempotency (same inputs → same output).

---

### Phase 5 — Scoring + opportunity briefs *(complete, 2026-10-15)*

**What was implemented**

- **Scoring engine** ([`src/lib/scoring/engine.ts`](src/lib/scoring/engine.ts)) — a pure function `scoreLead(inputs)` that takes `{ lead, audit?, campaign?, services?, weights?, nowIso? }` and returns a `ScoreBreakdown` with per-factor contributions, evidence strings, and derived band. No DB, no network, no `Date.now()` — the caller passes `nowIso` so re-running the same inputs produces a byte-identical result (spec §10 idempotency rule). Version pinned at `scoring/v0.2`.
- **Factor catalogue + default weights** mirror spec §10 and extend with the three audit-driven factors we built in Phase 4 (`missing_viewport`, `missing_https`, `heavy_page`). Full default map:
  - `no_website` +20, `inaccessible` +15, `outdated` +15, `missing_viewport` +5, `missing_contact_path` +10, `missing_https` +10, `heavy_page` +5, `niche_match` +10, `service_fit` +15, `useful_contact_path` +5, `low_evidence_penalty` −15, `strong_site_penalty` −10.
- **Confidence derivation** (`deriveConfidence`) — four-tier bucket: `insufficient` when the lead has no website, no verified contact, AND no source URL; `high` when there's a website *and* a successful audit; `medium` for either alone or verified contact; `low` for sparse profile signals (source URL only). The `insufficient` short-circuit forces band → `insufficient_evidence` and total → 0 regardless of what else fires — spec §10 "Insufficient evidence is a separate state, not an arbitrary numeric band."
- **Service-fit matcher** (`matchServiceOffering`) — picks the most defensible service in priority order: (1) no website → website build; (2) audit unavailable → website rebuild; (3) `cta_hierarchy` / `weak_landing` findings → landing page; (4) `old_theme` → e-commerce; (5) niche hints (D2C → e-commerce, SMB ops → automation, etc.); (6) fallback to the owner's first active service. Returns `null` when no active services exist.
- **Template-based opportunity brief generator** (`buildTemplateBrief`) — pure function returning a brief shape ready to persist. Composes:
  - A plain-English summary describing the business, website condition, and campaign flag.
  - Observations list drawn from audit findings (top 4 non-info-severity) plus augmented facts (no reachable website, public email/phone availability).
  - `possibleOpportunity` phrased against the matched service.
  - `suggestedDeliverable` templated per service type (website / e-commerce / landing / automation / brand).
  - `confidence` propagated from the score breakdown.
  - `unknowns` with sensible defaults ("Who is the decision-maker?", "Audit not yet run" when applicable).
  - `source: "template"` — AI generation lands in Phase 7 behind the provider abstraction.
- **Per-owner weight config** in `app_settings` — new repo [`src/lib/db/repos/settings.ts`](src/lib/db/repos/settings.ts). `getSetting(db, ownerId, key)` and `setSetting(db, ownerId, key, value)` for generic JSON values, upserting via `onConflictDoUpdate` on the `(owner_id, key)` unique index. Typed convenience wrappers `getScoringWeights` + `setScoringWeights`. Partial stored weights merge over `DEFAULT_WEIGHTS` so adding a new factor to the engine never orphans existing rows. Settings key: `scoring_weights/v0.2`.
- **Server actions** in [`src/lib/actions.ts`](src/lib/actions.ts):
  - `scoreLeadAction(formData)` — loads lead + latest audit + services + campaigns + owner weights; picks a best-fit campaign by niche match (active or draft preferred); runs `scoreLead`; persists via `updateLead({ score })`; writes a `score_computed` activity entry with the version + confidence; revalidates affected pages.
  - `generateBriefAction(formData)` — same input loading, calls `buildTemplateBrief`, persists via `createBrief` (preserving existing briefs — the briefs table keeps history), writes a `note_added` activity.
  - `saveScoringWeightsAction(formData)` + `resetScoringWeightsAction(formData)` — read every `points.<code>` + `enabled.<code>` field from the Settings form, clamp points to [-100, 100], upsert the whole map, revalidate `/settings`.
- **Lead Detail wiring** ([`src/app/(app)/leads/[id]/page.tsx`](src/app/(app)/leads/[id]/page.tsx)):
  - "Why this lead" section header shows the score version + relative computedAt, plus a "Score lead" / "Re-score" button that fires `scoreLeadAction`.
  - Empty state copy updated — distinguishes "Not scored yet" from "Insufficient evidence to score" based on `score?.band`.
  - Opportunity brief section has a "Generate brief" button when no brief exists, "Regenerate" when one does. Both fire `generateBriefAction`.
- **Settings page scoring UI** ([`src/app/(app)/settings/page.tsx`](src/app/(app)/settings/page.tsx)) — removed the static `SCORING_FACTORS` fixture. The form now:
  - Lists every factor from `FACTOR_LABELS` with its code shown as a `<code>` chip.
  - Renders a checkbox for `enabled` + a numeric input for `points`, pre-populated from `pageScoringWeights()`.
  - Save button submits to `saveScoringWeightsAction`; Reset defaults button submits to `resetScoringWeightsAction` via `formAction`.
- **Page data facade** — added `pageScoringWeights()` to [`src/lib/data.ts`](src/lib/data.ts) so the Settings page follows the same auth-gated pattern as everything else.
- **Tests** — [`tests/unit/scoring.test.ts`](tests/unit/scoring.test.ts) with **31 tests** across six groups:
  - `deriveConfidence` (5): insufficient when truly empty; low for source-URL-only; medium for website-only / contact-only; high for website + successful audit.
  - Bounds (2): maxed-out score clamps at 100; negative penalties clamp at 0.
  - Insufficient-evidence (2): correct band + total 0 + single `insufficient_evidence` factor; source URL alone escapes the sentinel.
  - Factor combinatorics (7): `no_website`, `inaccessible` (and that it suppresses other audit factors), audit → factor mapping for all four codes, `niche_match` only on matching campaign, `useful_contact_path` on email/phone, `strong_site_penalty` on clean audits, disabled weights, magnitude ordering.
  - Idempotency (2): same inputs + nowIso = identical breakdown; version string pinned.
  - Weight overrides (1): per-factor point override respected.
  - Service matching (5): no-website → website; unavailable audit → website; CTA findings → landing; D2C niche → e-commerce; empty active services → null.
  - Template brief (5): recommended service name for no-website lead; audit findings pulled into observations; confidence propagates from score; "audit not yet run" unknown; `source: "template"`.
  - `FACTOR_LABELS` sanity (1).
- Total suite: **173 tests pass in 721 ms** (18 normalize + 5 adapt + 15 format + 19 csv + 62 ssrf + 23 audit-checks + 31 scoring).

**Files added / modified**
- Engine: `src/lib/scoring/engine.ts` (new, 467 lines)
- Repo: `src/lib/db/repos/settings.ts` (new), `src/lib/db/repos/index.ts` (export)
- Actions: `src/lib/actions.ts` (added `scoreLeadAction`, `generateBriefAction`, `saveScoringWeightsAction`, `resetScoringWeightsAction` + imports)
- Facade: `src/lib/data.ts` (added `pageScoringWeights`)
- Pages: `src/app/(app)/leads/[id]/page.tsx` (Re-score button, Generate/Regenerate button, score version meta), `src/app/(app)/settings/page.tsx` (live weight editor replacing static fixture)
- Tests: `tests/unit/scoring.test.ts` (new, 31 tests)

**Commands run and results**
- `pnpm typecheck` — clean after two touch-ups (`active[0]` narrowed via tuple destructure for `exactOptionalPropertyTypes`; `result.factors[0]` nullable access).
- `pnpm wrangler d1 migrations apply dwn_lead_engine --local` — "No migrations to apply" (schema unchanged — `app_settings` already existed from Phase 2).
- `pnpm test` — **173 / 173** pass in 721 ms.
- `pnpm dev` — ready in 2.1s on port 3001 (3000 was still occupied). Smoke-tested routes:
  - `/overview`, `/leads/lead_haveli`, `/leads/lead_harish_advisory`, `/leads/lead_marine_drive`, `/settings` all returned HTTP 200.
  - `/leads/lead_haveli` renders "Re-score" + "Regenerate" buttons.
  - `/leads/lead_harish_advisory` renders "Insufficient evidence" state alongside a working "Re-score" trigger.
  - `/settings` renders the live scoring weights form with every factor code (including `low_evidence_penalty`, `strong_site_penalty`).
- End-to-end engine run against seeded Lotus Skincare Co + its audit:
  - Score: 45 / 100, band `needs_manual_review`, confidence `high`.
  - Fired factors: `outdated +15`, `service_fit +15`, `niche_match +10`, `useful_contact_path +5`.
  - Service match: "Landing pages & campaign microsites" (audit flagged `cta_hierarchy`).
  - Brief recommended "Landing pages & campaign microsites" with 4 observations drawn from the audit.
  - Running the same inputs twice produces byte-identical breakdowns (idempotency confirmed).

**Trust-boundary note**
- The engine takes **no external input** at the primary call site — the server action reads the lead from D1 by ID, loads its own audit, and never trusts form-posted score payloads. Weight config is owner-scoped and clamped to [-100, 100] on write.
- `scoreLead` is a pure function. All D1 writes happen *outside* the engine (in `scoreLeadAction`), so the engine can be used from a batch job, a background queue, or a one-off script without any Cloudflare context setup.

**Known limitations entering Phase 6**
- The score's `niche_match` factor currently credits only one campaign (the best-fit). Multi-campaign fit is deferred — it's not clear owners actually want a score reflecting membership in two overlapping campaigns.
- Weight editing in Settings is "last writer wins" — if two tabs edit simultaneously the second save overwrites the first. Acceptable for a single-owner app.
- Brief regeneration preserves history (new row per generate), but there's no "pin" or "delete" UI yet — only the latest renders. Phase 7 adds the AI version alongside, which may need an interactive compare.
- Score factor codes stored in old rows (seeded Phase 1/2) still include the Phase 1 codes (e.g. `activity`, `manual_bonus`) which the Phase 5 engine no longer emits. They render fine (we display the stored label + evidence), but re-scoring the lead will replace the breakdown with the Phase 5 shape. Not a regression — the version field documents the engine that produced the stored breakdown.
- No AI brief yet — spec §11's AI generation flow lands in Phase 7.
- Still no git repo.

**Next step**
Phase 6 — Discovery adapters:
1. `LeadSourceAdapter` interface + registry in `src/lib/sources/`.
2. CSV adapter wraps the Phase 3 pipeline so discovery and import share one surface.
3. Manual-entry adapter (just records a job for the audit trail).
4. Google Places adapter — server-side only, field-masked, quota-aware, graceful on missing key.
5. `discovery_jobs` table repo + polling UI (foreground batches, no Queues yet).
6. Discovery results flow through dedup (reuse Phase 3 lookups) → optional audit → optional score when flags set.

---

### Phase 6 — Discovery adapters *(complete, 2026-10-15)*

**What was implemented**
- Adapter contract in [`src/lib/sources/types.ts`](src/lib/sources/types.ts): `LeadSourceAdapter` returns `DiscoveredCandidate[]`; the runner owns dedup, persistence, audits, and scoring. Adapters stay pure.
- Three adapters: [`manual.ts`](src/lib/sources/manual.ts) (produces no candidates — the audit-trail entry only), [`csv.ts`](src/lib/sources/csv.ts) (defers to the existing `/leads` import flow), [`places.ts`](src/lib/sources/places.ts) (Places v1 Text Search with `X-Goog-FieldMask` locked to the eight columns we store).
- Registry at [`src/lib/sources/registry.ts`](src/lib/sources/registry.ts) with `adapterCapabilities(env)` so the Discover page's "Available sources" panel reflects live key status.
- Runner at [`src/lib/sources/runner.ts`](src/lib/sources/runner.ts): dedup via `findLeadByDomain` → `findLeadByNameAndCity`, optional audit via `runAudit`, optional score via `scoreLead`. Writes progress every 5 candidates. Final status is `completed` / `partial` / `failed` based on error ratio.
- Repo gained `updateDiscoveryJob` ([`src/lib/db/repos/discovery-jobs.ts`](src/lib/db/repos/discovery-jobs.ts)).
- Server action `runDiscoveryAction` in [`src/lib/actions.ts`](src/lib/actions.ts) validates with Zod, checks adapter capability, applies the `discovery` rate-limit bucket, and either runs the adapter or redirects to the right UI (manual → add-lead form, csv → import flow).
- Discover page ([`src/app/(app)/discover/page.tsx`](src/app/(app)/discover/page.tsx)) now posts to `runDiscoveryAction`; the "Google Places" option is enabled only when `GOOGLE_PLACES_API_KEY` is configured.

**Known limitations**
- Foreground execution means long Places runs block the request. 20-result cap keeps it under typical timeouts; Queues integration is still deferred.
- CSV adapter is a stub that records a job entry — the actual importer lives in `/api/leads/import` from Phase 3 (unchanged).

### Phase 7 — AI-assisted outreach *(complete, 2026-10-15)*

**What was implemented**
- [`src/lib/outreach/draft.ts`](src/lib/outreach/draft.ts) exports two pure functions:
  - `buildTemplateDraft` — deterministic, no network, always available. Picks channel from available contact fields (email > website → contact_form > other), picks service from brief or first-active, builds body from audit note + top-observation + opportunity + VP + opt-out sign-off.
  - `buildAiDraft` — calls Anthropic Messages API via `fetch` (no SDK) with model from `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`). Zod-validates `{ subject, body, personalization_evidence }`; parsing or validation failure throws and the action falls back to template.
- `generateDraftAction` in [`src/lib/actions.ts`](src/lib/actions.ts): checks do-not-contact *before* draft creation, picks AI path only when key is configured, applies the `ai_draft` rate-limit bucket, writes a `draft_created` activity, and stores a `AI fallback: <reason>` evidence line when the AI path fails.
- Lead Detail "New draft" button ([`src/app/(app)/leads/[id]/page.tsx`](src/app/(app)/leads/[id]/page.tsx)) now wires to `generateDraftAction`. Button is disabled with a tooltip when the lead is marked do-not-contact.
- Env resolver [`src/lib/env.ts`](src/lib/env.ts) merges Worker bindings and `process.env` so adapters + the AI provider see the same keys in dev and prod.

### Phase 8 — Reporting + production hardening *(complete, 2026-10-15)*

**What was implemented**
- Rate limiter: [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) implements a per-owner sliding-window counter with three buckets (`audit` 20/min, `discovery` 5/min, `ai_draft` 15/min). Lives in isolate memory — a defense against loops and casual abuse, not a cross-isolate quota. Applied to `runAuditAction`, `runDiscoveryAction`, and `generateDraftAction`.
- City breakdown: new `getCityBreakdown` repo function; `pageCityBreakdown` data facade; new card on `/reports` showing lead counts by city.
- README updated with a short runbook: secrets (`GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `CF_ACCESS_*`), migration flow, deploy, rollback.

**Tests**
- `tests/unit/rate-limit.test.ts` — 4 tests (limit enforcement, window expiry, per-owner isolation, retry-after signal).
- `tests/unit/outreach-draft.test.ts` — 6 tests (channel selection, brief incorporation, audit mention, template source tag).
- Full suite: **183 tests pass** (previously 173).

**Trust-boundary note**
- Both the Places adapter and the Anthropic provider call *external HTTPS endpoints*. These are not subject to the SSRF guard (which is scoped to arbitrary user-provided URLs via the audit engine); their hosts are fixed string literals (`places.googleapis.com`, `api.anthropic.com`). No user-controlled URL is ever passed to these fetchers.
- The AI model output is parsed as JSON and validated with Zod before persistence; malformed output triggers the template fallback rather than a persisted-garbage draft.
- The rate limiter is advisory: a motivated attacker with multiple sessions could still exhaust Anthropic quota. The real quota ceiling is enforced by Anthropic's own API limits — our limiter protects against inner-loop mistakes.

**Deferred to a future phase**
- A proper production-grade rate limiter (Durable Objects or KV-backed) to work across isolates.
- An outreach-draft editor in the UI (the current flow generates + persists; editing is still "copy, edit externally, log reply").
- Date-range filters on `/reports`.
- Mobile QA sign-off across widths beyond manual spot-checks.
