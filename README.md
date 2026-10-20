<h1 align="center">Lead Engine</h1>

<p align="center">
  <strong>Outreach that earns a reply. Not a reputation.</strong>
</p>

<p align="center">
  Find businesses that need what you sell, qualify them with evidence, and send outreach you'd actually want to receive — in one tool, without becoming a spammer.
</p>

<p align="center">
  <a href="https://dwn-lead-engine.designwithnihar.workers.dev"><strong>Live app →</strong></a>
  &nbsp;·&nbsp;
  <a href="https://dwn-lead-engine.designwithnihar.workers.dev/pricing">Pricing</a>
  &nbsp;·&nbsp;
  <a href="https://dwn-lead-engine.designwithnihar.workers.dev/features">Features</a>
  &nbsp;·&nbsp;
  <a href="https://dwn-lead-engine.designwithnihar.workers.dev/legal/terms">Terms</a>
  &nbsp;·&nbsp;
  <a href="https://dwn-lead-engine.designwithnihar.workers.dev/legal/privacy">Privacy</a>
</p>

<p align="center">
  <sub>Built by <a href="https://dwn-site.pages.dev/">Design with Nihar</a> · Based in India</sub>
</p>

---

## Why Lead Engine exists

Most outreach tools optimize for volume. They promise 10,000 emails a day and tank your reply rate (and your sender reputation) along the way. Lead Engine optimizes for the opposite:

- **Evidence-based scoring.** Every prospect gets a per-factor breakdown — not an opaque "AI score." You see *why* a lead ranks where it does.
- **Website audits before contact.** A built-in auditor examines each prospect's public site (SSRF-hardened, no scraping tricks) and surfaces concrete opportunities to lead the outreach with.
- **Human-approval gate.** No auto-sending. Drafts land in `needs_review` by default. The AI drafts; you decide what ships.
- **Reply triage.** When replies come back, an AI classifier (Gemini) buckets them into interested / needs-info / not-a-fit / unsubscribe / unclear and surfaces next actions.
- **Niche-agnostic.** 12 industry presets (agency, fitness, SaaS, real estate, home services, consultant, e-commerce, marketing, accounting, legal, dental/medical, blank slate) tune scoring factors and templates to your field in a 5-step onboarding wizard.

---

## Features

<table>
  <tr>
    <td width="50%">
      <h4>🔍 Multi-source discovery</h4>
      Manual entry, CSV import (with formula-injection defense), and Google Places text search. Automatic deduplication by canonical domain or normalized name + city.
    </td>
    <td width="50%">
      <h4>🩺 Website audit engine</h4>
      Eight baseline checks (HTTPS, title, meta, viewport, headings, image alt, contact path, page weight) + user-defined custom signals. Hardened against SSRF (private/loopback/metadata IPs rejected both pre- and post-redirect).
    </td>
  </tr>
  <tr>
    <td>
      <h4>📊 Deterministic scoring</h4>
      Transparent per-factor breakdown with evidence trail. Idempotent — same inputs always produce the same score. User-editable weights per workspace, plus custom factors on Teams tier.
    </td>
    <td>
      <h4>✍️ AI-assisted outreach drafts</h4>
      Gemini-powered personalized drafts with Zod-validated structure and a template fallback that always works. Variable registry lets you plug lead/workspace/audit values into any template.
    </td>
  </tr>
  <tr>
    <td>
      <h4>🔁 Automation wave 2</h4>
      Reply triage, follow-up cadences, auto-enrichment, bounce handling, snooze/wake, hot-lead alerts, weekly digests, webhook dispatch — 10 cron handlers.
    </td>
    <td>
      <h4>👥 Teams + RBAC</h4>
      Multi-tenant workspaces, email-invite flow, four roles (owner/admin/member/viewer), fail-silent audit log, lead and task assignment.
    </td>
  </tr>
  <tr>
    <td>
      <h4>💳 Razorpay billing</h4>
      Full subscription infra for Freelancer and Teams tiers (currently in <em>Coming Soon + waitlist</em> mode pending launch). Workspace usage metering against per-plan quotas.
    </td>
    <td>
      <h4>📨 Mail-client-friendly sends</h4>
      Prefers Gmail web, Outlook web, and system <code>mailto:</code> compose links over OAuth to keep setup zero-friction. OAuth code is preserved for when direct-send is enabled.
    </td>
  </tr>
</table>

See [`PRODUCT_PLAN.md`](./PRODUCT_PLAN.md) for the full product strategy, [`PRODUCT_BUILD_PLAN.md`](./PRODUCT_BUILD_PLAN.md) for the engineering plan, and [`UI_REDESIGN_BRIEF.md`](./UI_REDESIGN_BRIEF.md) for the visual-redesign brief currently in flight.

---

## Status

| Phase | Scope | State |
| :-- | :-- | :-- |
| A | Multi-tenant plumbing + magic-link auth | ✅ Shipped |
| B | Industry presets + 5-step onboarding wizard | ✅ Shipped |
| C | Variable registry + custom scoring factors + custom audit signals + 4 Settings sections | ✅ Shipped |
| D | 10 cron handlers + reply triage + cadences + notifications | ✅ Shipped |
| E | Billing infrastructure + usage metering | ✅ Shipped (waitlist mode) |
| F | Teams + RBAC + invites + audit log | ✅ Shipped |
| G | Gmail / Outlook / Calendar wiring | ✅ Shipped (mailto mode) |
| H | Marketing + legal + admin surfaces | ✅ Shipped |
| ↳ | Razorpay swap (replaces Stripe) | ✅ Shipped |
| ↳ | Product-mode (waitlist + mailto + Gemini) | ✅ Shipped |
| — | UI/UX redesign (motion, polish, dark mode) | 🎨 In progress — see [`UI_REDESIGN_BRIEF.md`](./UI_REDESIGN_BRIEF.md) |
| — | Integration pass (wire feature flags + RBAC guards into existing mutations) | ⏳ Pending |
| — | `app_settings` → real-table swap for 5 Phase C/D repos | ⏳ Pending |

**974 tests passing. TypeScript strict. Deployed to Cloudflare Workers.**

---

## Stack

| Layer | Choice |
| :-- | :-- |
| Framework | [Next.js 15](https://nextjs.org) (App Router, TypeScript strict) |
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com) via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) + [Drizzle ORM](https://orm.drizzle.team/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) (CSS-first tokens, no config file) |
| Validation | [Zod](https://zod.dev) |
| Icons | [Lucide](https://lucide.dev) |
| Fonts | [Figtree](https://fonts.google.com/specimen/Figtree) + [Caprasimo](https://fonts.google.com/specimen/Caprasimo) |
| Auth | Magic-link via [Resend](https://resend.com) · session cookies in D1 |
| Email | [Resend](https://resend.com) |
| AI | [Google Gemini](https://ai.google.dev) (`gemini-2.5-flash` + `gemini-2.5-flash-lite`) |
| Billing | [Razorpay](https://razorpay.com) subscriptions |
| Package manager | [pnpm](https://pnpm.io) |

**Design principles:** All external API calls use plain `fetch` — no vendor SDKs. All multi-tenant data filtering happens server-side via the repository layer (`ownerId` is the tenant key; UI gating is never the authorization mechanism).

---

## Project structure

```
src/
├── app/
│   ├── globals.css              # Tailwind v4 CSS-first tokens
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Auth-aware landing (owner → /overview, guest → marketing)
│   ├── (marketing)/             # Public: /pricing, /features, /legal/*
│   ├── (auth)/                  # /login, /check-email, /invite/[token]
│   ├── (onboarding)/            # 5-step wizard
│   ├── (app)/                   # Authenticated shell + 10 app pages
│   ├── (admin)/                 # Super-admin surface (gated by SUPER_ADMIN_EMAILS)
│   └── api/                     # Route handlers (auth, cron, billing, waitlist, workspaces, …)
├── components/
│   ├── layout/                  # Sidebar, topbar, page header
│   ├── ui/                      # shadcn-style primitives
│   ├── outreach/                # Compose buttons (mailto / gmail web / outlook web)
│   └── waitlist/                # Waitlist capture form
├── lib/
│   ├── ai/gemini.ts             # Plain-fetch Gemini wrapper
│   ├── audit/                   # Website audit engine + SSRF guard
│   ├── auth/                    # Session resolution, magic links, RBAC, super-admin gate
│   ├── audit-log/               # Fail-silent audit log writer
│   ├── billing/                 # Razorpay client, plans, limits, usage metering
│   ├── calendar/                # Cal.com link storage
│   ├── cron/                    # 10 scheduled handlers (triage, cadences, bounces, …)
│   ├── db/                      # Drizzle schema + 12 repositories
│   ├── email/resend.ts          # Resend REST wrapper
│   ├── gmail/                   # Gmail OAuth + API (currently UI-hidden)
│   ├── notifications/           # Dispatcher + Slack + Discord + digest template
│   ├── onboarding/              # Preset applier + wizard state
│   ├── outlook/                 # Microsoft Graph client (currently UI-hidden)
│   ├── outreach/                # Draft builder, triage classifier, cadence engine
│   ├── presets/                 # 12 industry preset configs
│   ├── rate-limit.ts            # Sliding-window buckets
│   ├── scoring/engine.ts        # Deterministic scoring engine
│   ├── sources/                 # Discovery adapters (manual, CSV, Google Places)
│   └── variables/               # Template substitution registry
├── migrations/                  # D1 SQL migrations (0001–0006)
├── scripts/                     # Deploy, seed, SSRF smoke tests
└── tests/                       # Vitest — 974 passing
```

---

## Development

### Prerequisites

- **Node.js** ≥ 20 (tested on 24.12)
- **pnpm** ≥ 9 (tested on 11.7)
- A **Cloudflare account** — free tier is fine; only needed for D1 and deployment

### Setup

```bash
pnpm install
```

Copy the env templates:

```bash
cp .env.example .env.local       # Next.js tooling vars
cp .dev.vars.example .dev.vars   # Wrangler-side secrets (gitignored)
```

Fill `.dev.vars` with any provider keys you want to exercise locally — all are optional. The app runs usefully in demo mode without a single API key.

### Local database

```bash
pnpm db:migrate:local       # Apply migrations to local D1 (one-time + after schema changes)
pnpm db:seed                # Seed the demo profile with the 17-lead fixture
```

### Dev server

```bash
pnpm dev
# http://localhost:3000 → redirects to /overview with DEV_OWNER_EMAIL
```

The dev-owner bypass is only honored when `NODE_ENV !== 'production'`. Production uses magic-link auth via Resend.

### Checks

```bash
pnpm typecheck              # tsc --noEmit
pnpm test                   # Vitest, one-shot
pnpm test:watch             # Vitest, watch mode
pnpm lint                   # ESLint
pnpm preview                # Build + run under Wrangler (catches Workers-runtime issues)
```

---

## Deployment

Full deploy runbook — the exact flow this repo was shipped with.

```bash
# 1. One-time: authenticate wrangler
pnpm wrangler login

# 2. Push server-side secrets (first deploy only; re-push to rotate)
pnpm wrangler secret put RESEND_API_KEY
pnpm wrangler secret put MAIL_FROM                   # e.g. "Lead Engine <login@yourdomain.com>"
pnpm wrangler secret put APP_BASE_URL                # production URL
pnpm wrangler secret put SESSION_COOKIE_SECRET       # 32+ char random string
pnpm wrangler secret put CRON_SECRET                 # 32+ char random string
pnpm wrangler secret put SUPER_ADMIN_EMAILS          # comma-separated

# Optional provider keys (app degrades gracefully without them):
pnpm wrangler secret put GEMINI_API_KEY              # AI drafts + triage + enrichment
pnpm wrangler secret put GOOGLE_PLACES_API_KEY       # Google Places discovery
pnpm wrangler secret put PAGESPEED_API_KEY           # Audit metrics enhancement
pnpm wrangler secret put RAZORPAY_KEY_ID             # Billing (also RAZORPAY_KEY_SECRET + WEBHOOK_SECRET + 4× PLAN_ID)
pnpm wrangler secret put GMAIL_CLIENT_ID             # Gmail OAuth (also CLIENT_SECRET + REDIRECT_URI)
pnpm wrangler secret put OUTLOOK_CLIENT_ID           # Outlook OAuth (also CLIENT_SECRET + REDIRECT_URI)

# 3. First deploy only: apply schema + optionally seed demo data to remote D1
pnpm wrangler d1 create dwn_lead_engine              # paste the database_id into wrangler.jsonc
pnpm db:migrate:remote
pnpm db:seed:remote                                   # optional

# 4. Deploy
pnpm deploy                                           # opennextjs-cloudflare build + wrangler deploy
```

### Rollback

Cloudflare Workers keeps the last successful deployment. From the Workers dashboard → `dwn-lead-engine` → Deployments → **Rollback**.

D1 migrations are forward-only; if a bad migration ships, write a corrective migration rather than reversing. Keep pre-migration backups with:

```bash
pnpm wrangler d1 export dwn_lead_engine --remote --output backups/pre-change.sql
```

### Cron triggers

Ten scheduled cron handlers run on this Worker (see `wrangler.jsonc`):

| Schedule | Handler |
| :-- | :-- |
| `0 9 * * *` | Stale-lead digest |
| `0 2 1 * *` | Monthly re-audit sweep (regression detection) |
| `*/15 * * * *` | Gmail reply triage sweep |
| `0 */2 * * *` | Follow-up cadence runner |
| `0 */6 * * *` | Bounce / DSN detection |
| `0 10 * * MON` | Weekly digest email |
| `0 3 * * *` | Auto-enrichment pass |
| `*/5 * * * *` | Webhook retry queue drain |
| `15 2 * * *` | Snooze / wake sweep |
| `5,20,35,50 * * * *` | Outlook reply sweep |

All handlers verify the `X-DWN-Cron-Secret` header against `CRON_SECRET` before running.

---

## Responsible-use guardrails

These are **non-negotiable** and enforced in code:

- **No scraping Google Search HTML or LinkedIn.** No CAPTCHA bypass. No auto-sending outreach.
- **Every outbound fetch runs through an SSRF guard** with a tested private-IP matrix (IPv4 + IPv6, cloud metadata endpoints, `.internal` / `.local` / `.onion` hostnames). Redirects are re-validated.
- **Secrets live in Wrangler secrets** or `.dev.vars` — never in `NEXT_PUBLIC_*`, never committed.
- **CSV exports defend against spreadsheet formula injection** (leading `=`, `+`, `-`, `@`, tab, CR are prefixed with `'`).
- **Human approval is required** before any outreach is marked contacted.
- **Do-not-contact flags block new draft creation** — not just sending.

Users of the product are responsible for complying with applicable laws (CAN-SPAM, GDPR, DPDP Act 2023, local outreach rules) and provider terms. The app's design encourages human-approved outreach only — it does not provide blanket legal-compliance guarantees.

---

## Documentation

| Document | What's inside |
| :-- | :-- |
| [`PRODUCT_PLAN.md`](./PRODUCT_PLAN.md) | Product strategy, two-tier model, industry presets, launch roadmap |
| [`PRODUCT_BUILD_PLAN.md`](./PRODUCT_BUILD_PLAN.md) | Phase-by-phase engineering plan with file-level ownership |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Original single-tenant implementation plan (phases 0–8) |
| [`UI_REDESIGN_BRIEF.md`](./UI_REDESIGN_BRIEF.md) | Design-system tokens, motion vocabulary, page-by-page redesign spec |
| [`GMAIL_INTEGRATION.md`](./GMAIL_INTEGRATION.md) | Gmail OAuth setup checklist (currently UI-hidden) |
| [`USING.md`](./USING.md) | End-user walkthroughs |

---

## License

Not currently open-source — all rights reserved to Design with Nihar. Reach out if you'd like to use this code.

---

<p align="center">
  <sub>Built with care by <a href="https://dwn-site.pages.dev/">Design with Nihar</a> · <a href="mailto:hello@dwnsolutions.com">hello@dwnsolutions.com</a></sub>
</p>
