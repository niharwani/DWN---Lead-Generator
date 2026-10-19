# Lead Engine

**Find businesses that need what you sell, qualify them with evidence, and send outreach you'd actually want to receive — in one tool, without becoming a spammer.**

- **Live app:** [dwn-lead-engine.designwithnihar.workers.dev](https://dwn-lead-engine.designwithnihar.workers.dev)
- **Pricing:** [/pricing](/pricing)
- **Terms of Service:** [/legal/terms](/legal/terms)
- **Privacy Policy:** [/legal/privacy](/legal/privacy)

---

## Development

> The section below is for developers working on the codebase.

**DWN Lead Engine** — internal lead-generation CRM for **Design with Nihar** — discovers relevant businesses, audits their public websites, ranks fit for DWN's services, prepares personalized outreach drafts, and tracks the sales pipeline.

> **Status:** Phase H (launch prep). Phases A–H are shipped locally. See [`PRODUCT_BUILD_PLAN.md`](./PRODUCT_BUILD_PLAN.md) for the SaaS productization roadmap.

---

## Stack

- **Next.js 15** (App Router, TypeScript strict)
- **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- **Cloudflare D1** (SQLite) via **Drizzle ORM**
- **Tailwind CSS v4** (CSS-first tokens, no `tailwind.config.ts`)
- **Zod** for validation, **Lucide** for icons, **Figtree** + **Caprasimo** for typography
- **pnpm** package manager

See `IMPLEMENTATION_PLAN.md` for stack rationale and the 8-phase roadmap.

---

## Local setup

### Prerequisites

- Node.js ≥ 20 (tested on 24.12)
- pnpm ≥ 9 (tested on 11.7)
- A Cloudflare account (free tier is fine) — only required for D1 and deployment, not for `pnpm dev`

### Install

```powershell
pnpm install
```

### Run the dev server

```powershell
pnpm dev
```

Open http://localhost:3000. The app redirects to `/overview`.

### Type check

```powershell
pnpm typecheck
```

### Run tests

```powershell
pnpm test        # one-shot
pnpm test:watch  # watch mode
```

### Preview the Workers build locally

```powershell
pnpm preview
```

This runs `@opennextjs/cloudflare` to build a Worker bundle, then boots it under Wrangler. Use this to catch runtime incompatibilities before deploying.

---

## Environment variables

Two files, two scopes.

### `.env.local` — Next.js tooling

Copy `.env.example` → `.env.local`. Only variables consumed by Next.js itself (framework config, `NEXT_PUBLIC_*`) go here.

### `.dev.vars` — Wrangler secrets (local)

Copy `.dev.vars.example` → `.dev.vars`. All provider keys and server-only secrets go here. `.dev.vars` is gitignored. **Never add provider keys to `.env.local`.**

For production, use `pnpm wrangler secret put <KEY>` instead of committing values anywhere.

---

## Cloudflare D1 setup

### Local-only (zero Cloudflare account required)

The default workflow runs entirely against a local SQLite file at
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`. No `wrangler login`,
no remote D1 database, no network traffic to Cloudflare.

```powershell
# 1. Apply the schema to local D1 (one-time, re-run after schema changes)
pnpm db:migrate:local

# 2. Seed the demo profile with the 17-lead fixture
pnpm db:seed

# 3. Point the dev-owner bypass at the seeded profile
# (Copy .env.example → .env.local, keep DEV_OWNER_EMAIL=demo@dwn.local)

# 4. Boot the app
pnpm dev
```

The dev bypass only works when `NODE_ENV !== 'production'`. In production, the
app requires a Cloudflare Access JWT instead — see "Remote D1 + deployment"
below.

### Remote D1 + deployment *(when you're ready)*

```powershell
# One-time: create the remote D1 database and update wrangler.jsonc
pnpm wrangler d1 create dwn_lead_engine
#   → paste the returned `database_id` into wrangler.jsonc

# Apply migrations + seed demo data to the remote DB
pnpm db:migrate:remote
pnpm db:seed:remote
```

### Schema changes workflow

```powershell
# 1. Edit src/lib/db/schema.ts
# 2. Hand-write a new migration SQL file in migrations/ with a sequential prefix
#    (drizzle-kit `generate` is also available via `pnpm db:generate`)
# 3. Apply locally and then remotely
pnpm db:migrate:local
pnpm db:migrate:remote
```

### Querying local D1 directly

```powershell
pnpm wrangler d1 execute dwn_lead_engine --local --command="SELECT COUNT(*) FROM leads;"
```

---

## CSV import / export

### Download the template

Open [`/leads/import`](http://localhost:3000/leads/import) and click **Template**, or:

```powershell
curl -o template.csv http://localhost:3000/api/leads/import/template
```

The template includes a sample row with the full set of recognised columns.

### Supported import columns

Canonical names (also accept aliases like `name`, `company`, `email`, `phone`, `industry`, `website`):

```
business_name, category, niche, website_url, public_email, public_phone,
address, city, region, country, source_name, source_url, notes
```

Unknown columns are ignored (with a warning on the preview). Rows that fail
validation are reported with a row number + reason — the batch continues.

### Import flow

1. Upload a CSV on `/leads/import`.
2. Review the preview — classified as **new**, **duplicate (domain)**, or **duplicate (name + city)**. Row errors are listed inline.
3. Pick a duplicate strategy — **Skip** (default) or **Update existing** (overwrites email / phone / address / category / niche on matches).
4. Click **Commit**. The response reports inserted / updated / skipped / invalid counts and any per-row failures.

### Export

Click **Export CSV** on the Leads page. The current filter is respected — bookmark a filtered view, click Export, you get only those rows.

### Formula-injection defense

Every exported cell beginning with `=`, `+`, `-`, `@`, `|`, tab, or carriage return is prefixed with a single quote `'`. Excel and Google Sheets treat the leading quote as a text literal and will **not** evaluate the cell as a formula (spec §14). Phone numbers starting with `+` are the most common case you'll notice.

Import treats all cells as plain text — no code is ever executed from an imported file.

---

## Website audit engine

The audit engine fetches a public URL, parses the HTML, and runs eight baseline checks (HTTPS, title, meta description, viewport, headings, image alt text, contact path, page weight). Results persist to `website_audits` with a derived `websiteCondition` on the lead (`strong` / `acceptable` / `outdated` / `weak`).

Run it from the Lead Detail page via **Run audit** / **Re-run audit** in the Website audit card. The URL comes from the lead row, not from any form input — a user cannot direct the server to fetch an arbitrary URL.

### SSRF defense (spec §9)

Every outbound fetch runs through [`validateUrlForFetch`](src/lib/audit/ssrf.ts) *and* re-validates every redirect target. Blocked:

- Any scheme other than `http` / `https` (so `javascript:`, `file:`, `ftp:`, `data:`, `gopher:` all fail)
- URLs with userinfo (`user:password@host`)
- IPv4 literals in RFC 1918, loopback (127/8), link-local (169.254/16), CGNAT (100.64/10), reserved ranges, multicast
- IPv6 literals: `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, documentation / translation prefixes
- IPv4-mapped IPv6 (`::ffff:…`) — blocked outright
- Cloud metadata hostnames (`169.254.169.254`, `metadata.google.internal`, `metadata.azure.com`, `instance-data.ec2.internal`)
- Hostnames ending in `.local`, `.internal`, `.localhost`, `.onion`
- Bare `localhost`, `0.0.0.0`, `broadcasthost`

In production the Workers runtime adds a second defense layer via `global_fetch_strictly_public` (set in [`wrangler.jsonc`](wrangler.jsonc)) — `fetch()` itself refuses to resolve to private IPs at the DNS layer, which defeats DNS rebinding.

### Dev-only bypass

Set `AUDIT_ALLOW_PRIVATE=1` in `.env.local` to let the audit engine hit `127.0.0.1` / private IPs **during local dev only**. The bypass is hard-gated to `NODE_ENV !== 'production'`; a leaked env var cannot unlock prod.

### Running the smoke test

A one-off end-to-end script covers both SSRF rejections and real public URLs:

```powershell
pnpm tsx scripts/smoke-audit.ts
```

---

## Discovery adapters

Three sources ship: **Manual entry**, **CSV import**, and **Google Places (New) Text Search**. All of them write to `discovery_jobs` so Discover's history reflects every run.

- Manual + CSV adapters redirect you to the appropriate UI (the Add Lead form and the import flow).
- The Google Places adapter is enabled only when `GOOGLE_PLACES_API_KEY` is set. It calls [`places:searchText`](https://developers.google.com/maps/documentation/places/web-service/text-search) with an `X-Goog-FieldMask` restricted to the eight public columns we persist (id, displayName, formattedAddress, websiteUri, phone numbers, primaryType, googleMapsUri). No scraping, no HTML, no SERP touch.
- The runner dedups each candidate against existing leads (canonical domain first, then normalized name + city), optionally runs the audit engine, and optionally scores the lead.

## AI-assisted outreach drafts

Click **New draft** on any lead to generate an outreach draft. The resolver:

1. Checks the lead's do-not-contact flag — if set, draft creation is blocked (spec §10).
2. If `ANTHROPIC_API_KEY` is configured, calls the Anthropic Messages API via plain `fetch` (no SDK). Model defaults to `claude-sonnet-4-6`; override with `ANTHROPIC_MODEL`.
3. Validates the model's JSON output against a Zod schema. On any failure (HTTP error, invalid JSON, schema mismatch), falls back to the deterministic template and records `AI fallback: <reason>` in the draft's personalization evidence.
4. Persists the draft with `status = needs_review`. Nothing is auto-sent; approval is manual.

Without `ANTHROPIC_API_KEY` the template path is the only path — the app is fully usable without a provider key.

## Rate limiting

The server applies an in-isolate sliding-window limiter to expensive actions:

| Action | Bucket | Limit |
|---|---|---|
| `runAuditAction` | `audit` | 20 / minute / owner |
| `runDiscoveryAction` | `discovery` | 5 / minute / owner |
| `generateDraftAction` (AI path) | `ai_draft` | 15 / minute / owner |

The limiter lives in Worker heap memory — it's a defense against loops and casual abuse, not a cross-isolate quota. Anthropic / Google API-level limits are the hard ceiling.

## Deployment runbook

```powershell
# 1. Authenticate wrangler (one-time)
pnpm wrangler login

# 2. Push server-side secrets (one-time, then re-push to rotate)
pnpm wrangler secret put ANTHROPIC_API_KEY        # optional, enables AI drafts
pnpm wrangler secret put GOOGLE_PLACES_API_KEY    # optional, enables Google Places
pnpm wrangler secret put CF_ACCESS_TEAM_DOMAIN    # required for prod auth
pnpm wrangler secret put CF_ACCESS_AUD            # required for prod auth

# 3. Apply schema + seed demo data to remote D1 (first deploy only)
pnpm db:migrate:remote
pnpm db:seed:remote     # optional — seeds the fictional 17-lead fixture

# 4. Deploy
pnpm deploy
```

### Rollback

Workers keeps the last successful deployment. From the Cloudflare dashboard, go to Workers → `dwn-lead-engine` → Deployments → **Rollback** on the previous version. D1 is a separate concern: migrations are forward-only, so if a bad migration ships, write a corrective migration rather than attempting to reverse one.

### Day-two operations

- **Add a new provider key:** `pnpm wrangler secret put <KEY>` — Workers reloads automatically on the next request.
- **Query production D1:** `pnpm wrangler d1 execute dwn_lead_engine --remote --command="…"`
- **Inspect logs:** `pnpm wrangler tail` or the Workers dashboard.
- **Change scoring weights:** [`/settings`](http://localhost:3000/settings) → "Lead scoring weights" — stored per-owner in `app_settings`.

---

## Project layout

See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md#4-project-layout-target) for the full tree. Short version:

```
src/
  app/
    (app)/        # authenticated shell (8 nav sections)
    api/          # route handlers (Phase 2+)
  components/
    layout/       # sidebar, topbar, page header
    ui/           # shadcn primitives (Phase 1+)
  lib/
    auth/         # Cloudflare Access JWT verification (Phase 2)
    db/           # Drizzle schema + client (Phase 2)
    scoring/      # deterministic lead scoring (Phase 5)
    audit/        # website audit + SSRF guard (Phase 4)
    sources/      # LeadSourceAdapter implementations (Phase 6)
    ai/           # provider abstraction (Phase 7)
migrations/       # D1 SQL migrations (Phase 2+)
```

---

## Responsible-use guardrails

Pinned in [`IMPLEMENTATION_PLAN.md` §6](./IMPLEMENTATION_PLAN.md#6-non-negotiable-guardrails-from-spec-pinned-here) and non-negotiable:

- No scraping Google Search HTML or LinkedIn, no CAPTCHA bypass, no auto-sending outreach.
- Every outbound fetch (audit engine) runs through an SSRF guard with a tested private-IP matrix.
- Secrets live in Wrangler secrets / `.dev.vars`, never `NEXT_PUBLIC_*`.
- Human approval is required before any outreach is marked contacted.
- Do-not-contact flags block new draft creation, not just sending.
