# DWN Lead Engine — Productization Plan

**Status:** Planning doc (not yet implemented)
**Date:** 2026-10-18
**Owner:** Nihar / DWN
**Context:** Internal single-owner CRM is complete through Phase 8. This document plans the pivot from "internal tool" to "SaaS product sold under DWN," with tiered subscriptions, multi-tenant workspaces, an onboarding flow that makes the engine useful for any niche (not just DWN's services), and a second wave of smarter automations.

---

## 0. TL;DR

1. **Automations wave 2** — reply triage, follow-up cadences, hot-lead alerts, auto-enrichment, digest emails, bounce handling, drip sequences (human-approved).
2. **Multi-tenant foundation** — workspaces → members → RBAC → per-workspace data isolation. Every table carries `workspace_id`; the existing `owner_id` becomes `workspace_id` + `created_by`.
3. **Billing** — Stripe (or Lemon Squeezy for ease). Two tiers: **Freelancer** and **Teams**. Hard limits enforced server-side, not UI-only.
4. **Onboarding wizard** — 5-step flow that captures the user's niche, offer, ICP, services, and brand voice. Pre-seeds scoring weights, factor labels, service offerings, draft templates, and discovery niches. Supports **industry presets** (agency, fitness coach, SaaS, real estate, home services, B2B consulting, e-commerce brand, etc.).
5. **Variable system** — rename the DWN-specific scoring factors and audit heuristics into **user-defined evaluation criteria** so a fitness coach scoring prospects can define their own "has Instagram > 10k followers" factor, not just "no website."
6. **Launch path** — product name, pricing page, docs site, Stripe webhook plumbing, support inbox, legal (ToS/Privacy/DPA).

---

## 1. Better automations (wave 2)

Current automations are in [`wrangler.jsonc`](wrangler.jsonc#L41-L48) (two crons) + [`src/lib/outreach/draft.ts`](src/lib/outreach/draft.ts) + the Gmail scaffold at [`src/lib/gmail/`](src/lib/gmail/). Everything below assumes the existing cron infrastructure and human-approval gate stays intact. Nothing auto-sends; automations surface tasks, drafts, and alerts.

### 1.1 Reply triage (AI classifier)
- When a Gmail reply lands (daily cron picks it up), feed the reply body + original draft into Claude with a 5-class schema: `interested / needs_info / not_a_fit / unsubscribe / unclear`.
- Already schema-ready: `outreach_drafts.replySentiment` exists in [`schema.ts:447-449`](src/lib/db/schema.ts#L447-L449).
- Side effects per class:
  - `interested` → create `book_meeting` task, priority high, notify owner (push / in-app / optional Slack).
  - `needs_info` → create `follow_up` task with suggested answer draft.
  - `not_a_fit` → auto-move lead to `not_a_fit`, archive thread.
  - `unsubscribe` → set `doNotContact=true`, log reason, auto-archive drafts.
  - `unclear` → surface in a "triage queue" for manual review.
- Human can override every classification; override feeds back as training evidence for later tuning.

### 1.2 Follow-up cadences
- Per-campaign cadence config: `[+3d gentle nudge, +7d case study, +14d final]`.
- When a draft becomes `contacted` with no reply, cron schedules the next follow-up draft (status `needs_review`) at the configured offset.
- Follow-ups reuse the thread's `gmailThreadId` so the reply chain stays coherent.
- Max cadence length capped by tier (Freelancer: 3 steps; Teams: unlimited).

### 1.3 Hot-lead alerts
- When score > owner-configured threshold OR a `priority_review` lead appears, fire a notification:
  - In-app toast + bell icon.
  - Optional: email digest to the owner.
  - Optional (Teams): Slack webhook, Discord webhook.
- Dedup window: don't re-alert on the same lead within 24h.

### 1.4 Auto-enrichment
- On lead creation OR nightly for leads older than 7d with low-confidence evidence:
  - Re-run `validateUrlForFetch` + audit if website found.
  - Attempt to resolve social handles (Instagram, LinkedIn Company) from the website HTML (no scraping of IG/LI — just reading `<a href="…">` tags on the brand's own site).
  - Classify industry via Claude using website meta + h1 (helps users whose field has no fixed taxonomy).
- All findings persist to `lead_sources` with evidence + `observedAt` so provenance stays auditable.

### 1.5 Digest emails
- Daily or weekly (user-selectable) summary email: new leads, hot leads, overdue tasks, replies awaiting triage, audit regressions.
- Fully user-opt-in in Settings → Notifications.

### 1.6 Bounce + spam handling
- When Gmail returns a `delivery-status-notification` or `permanent-failure`, auto-mark the lead `public_email` invalid, flag `doNotContact` reason=`bounced`, move drafts to `archived`.
- Reduces repeated outreach to dead inboxes.

### 1.7 Smart queueing
- Rebuild the Overview page's "What to work on now" with a scoring stack:
  - Replies awaiting triage (highest)
  - Overdue tasks
  - Priority-review leads not yet reviewed
  - Approved drafts awaiting send
  - Follow-ups due today
  - Audit regressions needing re-outreach
- Already partially shipped. The automation is: this queue updates in real time without a page refresh (via server actions + React Server Component re-render).

### 1.8 Snooze + wake
- Snooze any lead/task until `+Nd` or a specific date. Cron un-snoozes at due time and re-surfaces it.
- Avoids clutter without losing anything.

### 1.9 Auto-decay (dormant lead pruning)
- Leads untouched for 180d with no reply drop out of the active queue into an "archive" bucket. Not deleted — just hidden from default filters.
- User can set the decay window per workspace.

### 1.10 Re-score on config change
- When a user edits scoring weights or ICP, enqueue a full owner-scoped re-score (bounded, chunked). Already partially possible via existing `scoreLead` engine; needs a background runner.

### 1.11 Calendar integration (Teams tier)
- When a reply is classified `interested`, offer a one-click "Send booking link" that uses the owner's Cal.com / Calendly link stored in Settings.
- Later: direct Google Calendar OAuth to create the event + invite.

### 1.12 Variant A/B automation
- Already scaffolded: `outreachDrafts.variantGroup / variantLabel`.
- Automation: after N sends per variant, compute reply-rate per variant and surface the winner. Suggest archiving losers. Human still clicks "apply."

### 1.13 CSV export of enriched contacts (Teams tier)
- Scheduled weekly CSV export of all leads matching a saved filter, dropped into R2, link emailed to the user. Useful for sharing with other tools.

### 1.14 Webhooks (Teams tier)
- Outbound webhook on events: `lead.created`, `lead.scored`, `draft.approved`, `reply.received`, `pipeline.changed`. Lets users wire into Zapier, Make, n8n, their own stack.

### 1.15 Integrations roadmap (phased)
| Tier available | Integration | Notes |
|---|---|---|
| Both | Gmail | Already scaffolded |
| Both | Google Places discovery | Already shipped |
| Both | PageSpeed | Already supported |
| Both | Anthropic Claude | Already shipped |
| Teams | Outlook / Microsoft 365 | OAuth, send + reply polling |
| Teams | Slack notifications | Incoming webhook |
| Teams | Discord notifications | Incoming webhook |
| Teams | Zapier / n8n webhooks | Outbound events |
| Teams | Cal.com / Calendly | Deep-link + API |
| Teams | HubSpot / Pipedrive export | One-way sync |
| Later | LinkedIn Sales Nav | **Only** if a safe, ToS-compliant path exists. Default: no. |

---

## 2. Productization — turning this into a sellable DWN product

### 2.1 Positioning
- **Name candidates:** DWN Reach, LeadForge by DWN, Prospector, Signal, Fieldwork. (Pick before launch.)
- **One-liner:** "Find businesses that need what you sell, qualify them with evidence, and send outreach you'd actually want to receive — in one tool, without becoming a spammer."
- **Target users:** Solo founders, agencies, freelancers, B2B sales teams, service businesses doing outbound. The CRM is deliberately simple so it fits teams who find HubSpot bloated.
- **Differentiator (and this is key):** Evidence-based scoring + human-approval gates built-in. Not another "AI sends 10,000 emails" tool — a tool for people who care about reply rates and reputation.

### 2.2 Multi-tenant architecture
The current schema is single-owner. The migration:

#### 2.2.1 New top-level entity: `workspaces`
```ts
workspaces {
  id: text pk,
  name: text,
  slug: text unique,
  plan: 'freelancer' | 'teams',
  stripeCustomerId: text,
  stripeSubscriptionId: text,
  trialEndsAt: text,
  createdAt, updatedAt
}
```

#### 2.2.2 New: `workspace_members`
```ts
workspace_members {
  workspaceId: text fk,
  profileId: text fk,
  role: 'owner' | 'admin' | 'member' | 'viewer',
  invitedAt, acceptedAt
}
```

#### 2.2.3 Rename `owner_id` → `workspace_id` across all tables
- Every leads/campaign/task/draft/activity/service_offerings/app_settings row carries `workspace_id` instead of `owner_id`.
- Add `created_by: profileId` where human attribution matters (leads, drafts, tasks, activities).
- Keep RLS discipline the same — every repo query filters by `workspaceId` server-side.

#### 2.2.4 Auth evolution
- Current prod uses Cloudflare Access JWT (DWN's single-owner setup). That doesn't scale to self-serve signup.
- Switch to **email + magic link** (via Resend or Postmark) with sessions in D1. Keep CF Access as an optional overlay for enterprise self-hosted deployments later.
- OAuth providers (Google, GitHub) as a Phase 2 convenience.

#### 2.2.5 Isolation guarantees
- Every API route and server action resolves `workspaceId` from the session and NEVER accepts it from the request body.
- Tests: cross-workspace read/write attempts must 404.
- Billing failure (payment lapsed) → workspace enters `read-only` state (can view, can't create/send/discover). Grace period 7 days.

### 2.3 Pricing & tiers

**Pricing stance:** Monthly + annual (annual gets ~20% off). Free trial for Teams (14 days, no card). Freelancer has a **generous free tier** (50 leads, 1 campaign) to drive top-of-funnel, then paid.

#### 2.3.1 Free (lead-magnet)
- 1 user, 50 leads total, 1 campaign, 10 audits/mo, no AI drafts, no Gmail send.
- Watermarked exports.
- Use case: product trial / solo starter.

#### 2.3.2 Freelancer — $29/mo (or $23/mo annual)
Target: solo consultants, freelancers, indie founders.
- 1 user
- Unlimited leads
- Up to 3 active campaigns
- 500 audits/mo
- 300 AI drafts/mo (BYO Anthropic key: unlimited)
- Gmail send + reply polling
- Email digests
- Standard templates + industry presets
- CSV import/export
- Google Places discovery (bring-your-own key for unlimited; 100/mo included if using DWN pooled key)
- Scoring weights fully editable
- Follow-up cadences (max 3 steps)
- Snooze, do-not-contact, auto-decay
- Hot lead alerts (in-app + email)
- 7-day activity history
- Community support

#### 2.3.3 Teams — $79/user/mo (or $63/user/mo annual), min 2 seats
Target: agencies, in-house SDR teams, consultancies, small B2B sales teams.
- Everything in Freelancer, plus:
- Up to 25 seats (contact for more)
- Role-based access (owner / admin / member / viewer)
- Unlimited active campaigns
- 2,500 audits/mo workspace-wide
- 2,000 AI drafts/mo workspace-wide (BYO Anthropic: unlimited)
- Multi-user assignment on leads/campaigns/tasks
- Shared inbox view (any member's Gmail reply surfaces to all admins)
- Follow-up cadences — unlimited steps + branching logic
- Variant A/B automation with winner surfacing
- Slack + Discord notifications
- Outbound webhooks (Zapier / n8n / Make)
- Outlook / Microsoft 365 integration
- Cal.com / Calendly integration
- Scheduled CSV exports to R2 (+ emailed link)
- 90-day activity history
- Audit log (who did what, when) — compliance-ready
- Custom scoring factor definitions (user-defined criteria, see §3.3)
- Priority email support + Slack-Connect channel

#### 2.3.4 Studio (future, hand-sold)
- $499+/mo, hand-sold to agencies managing multiple client accounts.
- Multi-workspace parent org.
- White-label (replace "DWN" brand, custom domain, custom email sender).
- SSO (SAML / OIDC).
- SLA + DPA.
- Dedicated success manager.

### 2.4 What's locked where (feature-flag matrix)

| Feature | Free | Freelancer | Teams |
|---|:-:|:-:|:-:|
| Lead count | 50 | unlimited | unlimited |
| Active campaigns | 1 | 3 | unlimited |
| Audits/mo | 10 | 500 | 2,500 |
| AI drafts/mo | — | 300 | 2,000 |
| BYO Anthropic key | — | ✓ | ✓ |
| Gmail send | — | ✓ | ✓ |
| Outlook / M365 | — | — | ✓ |
| Users | 1 | 1 | up to 25 |
| Role-based access | — | — | ✓ |
| Follow-up cadences | — | 3 steps | unlimited |
| A/B variants | — | basic | with winner analytics |
| Slack / Discord | — | — | ✓ |
| Webhooks | — | — | ✓ |
| Calendar integration | — | — | ✓ |
| Scheduled CSV exports | — | — | ✓ |
| Activity history | 1 day | 7 days | 90 days |
| Audit log | — | — | ✓ |
| Custom scoring factors | — | 2 custom | unlimited |
| Industry presets | ✓ | ✓ | ✓ |
| White-label | — | — | Studio only |
| SSO | — | — | Studio only |
| Watermarked exports | ✓ | — | — |

Enforcement: all limits are checked server-side in the mutation layer. Never UI-only. Expired/downgraded workspaces hit a `requireFeature('cadences')` guard that throws 402.

---

## 3. Making it niche-agnostic (the big product shift)

Right now, scoring factors like `no_website`, `missing_viewport`, `heavy_page`, and audit heuristics ([`src/lib/scoring/engine.ts:37-50`](src/lib/scoring/engine.ts#L37-L50)) assume the user is DWN (a web/design studio). A fitness coach or SaaS founder gets nothing from these.

### 3.1 Industry presets
At onboarding, the user picks their industry (or "other"). Each preset ships:
- A tuned scoring weight map
- A tuned audit factor set (what counts as a "bad website" for a fitness-studio owner's prospects differs from a B2B SaaS's)
- Pre-written service offerings
- Pre-written outreach templates
- Default niche + ICP suggestions
- Default discovery queries

**Initial preset catalogue:**
- Design/dev agency (= current DWN defaults)
- Fitness coach / personal trainer
- B2B SaaS founder
- Real estate agent
- Home services (plumbing, HVAC, landscaping)
- Consultant / coach
- E-commerce brand (DTC)
- Marketing agency
- Accountant / bookkeeper
- Attorney / legal services
- Dentist / medical practice
- "Other" (blank slate + guided questions)

Each preset is a single config object in `src/lib/presets/`. The onboarding wizard loads it, pre-fills, and the user tweaks.

### 3.2 Custom audit factors
Audit engine today runs 8 fixed checks. New model:
- Keep the 8 as "baseline web checks."
- Add **user-defined signals** that run during the same audit pass:
  - "Instagram link present" (regex on homepage)
  - "Google reviews > N" (manual field or Places API count)
  - "Mobile viewport present" (already there)
  - "Phone number listed" (regex)
  - "Prices listed" (keyword match: "$", "₹", "pricing", "plans")
  - "Services page present" (link detection)
- Each custom signal has: name, detection method (regex/presence/absence/count), weight, severity.
- Preset ships 5–10 signals relevant to that industry. User can edit, add, remove.

### 3.3 Custom scoring factors (Teams tier)
- Lets a user define arbitrary factor codes with points and evidence sources.
- Example: a fitness coach adds `has_social_proof: 10pts if instagram_followers > 10k`.
- Backed by a new table `custom_score_factors` scoped to workspace.
- Scoring engine already supports arbitrary codes via `WeightMap` — just needs runtime extensibility.

### 3.4 Rename UI labels
- The current UI says "DWN services," "studio name," etc. Those become workspace-level labels pulled from workspace settings.
- No hardcoded "Design with Nihar" strings in the user-facing shell.

### 3.5 Variable library
A central `variables.ts` module exposes substitutions for templates and drafts:
- `{{lead.business_name}}`, `{{lead.city}}`, `{{lead.recommended_service}}`
- `{{owner.studio_name}}`, `{{owner.pitch}}`, `{{owner.case_study_url}}`
- `{{audit.headline_finding}}`, `{{audit.page_weight_mb}}`
- User-definable custom variables per workspace (e.g., `{{calendar_link}}`, `{{portfolio_url}}`)

---

## 4. Onboarding wizard

5 steps, skippable at any point, resumable. Lives at `/onboarding` and runs on first workspace creation.

### Step 1 — Who are you? (1 min)
- Workspace name
- Your name + role
- Website (optional)
- Where you heard about us (attribution)

### Step 2 — What do you sell? (2 min)
- Industry preset selector (grid of 12 tiles)
- "I don't see mine" → "other" (loads blank preset)
- Short pitch (1 sentence, used as fallback value proposition)
- Primary offer (1 line)
- Case study / portfolio URL (optional)

### Step 3 — Who's your customer? (2 min)
- ICP description (free text, suggested starter based on preset)
- Target niches (multi-select, suggested by preset)
- Target geography (country / region / city)
- Deal size range (populates estimatedDealValue defaults)

### Step 4 — Services & evaluation (3 min)
- Services you offer (preset supplies 3–5 defaults, user edits)
- Review scoring weights (preset-tuned, user can tweak sliders)
- "Advanced" collapse hides custom factor editor until needed

### Step 5 — Setup integrations (2 min, mostly skippable)
- Connect Gmail (OAuth button, optional)
- BYO Anthropic key for AI drafts (optional)
- Google Places key for unlimited discovery (optional)
- Notification preferences (daily digest? Slack webhook?)

### Finish
- Create a demo campaign with 10 fictional leads tagged "Demo"
- Open Overview page with a lightweight product tour (coachmarks)
- First-run checklist (Overview sidebar card):
  - [ ] Import your first real leads
  - [ ] Approve your first outreach draft
  - [ ] Connect Gmail
  - [ ] Set up a follow-up cadence
- Dismiss when all done or user clicks "I'll figure it out"

Onboarding progress persists in `workspaces.onboardingState` so a user can leave and come back without losing position.

---

## 5. Billing architecture

### 5.1 Stripe setup
- Products: `Freelancer`, `Teams` (per-seat), `Studio` (hand-invoiced).
- Prices: monthly + annual for each.
- Checkout: `stripe.checkout.sessions.create` → redirect → webhook writes `subscriptionId` + `plan` to workspace.
- Customer portal: Stripe hosted portal for upgrade/downgrade/cancel/invoices.

### 5.2 Webhooks to handle
- `checkout.session.completed` — activate subscription, mark trial end.
- `customer.subscription.updated` — plan change, seat change.
- `customer.subscription.deleted` — downgrade to free + flag read-only.
- `invoice.payment_failed` — email the owner, start grace period.
- `invoice.paid` — reset grace flags.

### 5.3 Usage metering
- Audits/mo and AI drafts/mo meter per workspace per calendar month.
- `workspace_usage` table: `workspace_id, period_yyyymm, audits_used, drafts_used, discovery_runs_used, …`.
- Checked at the top of each limit-gated server action; soft-warn at 80%, hard-stop at 100%.

### 5.4 BYO keys
- If a user plugs in their own Anthropic key, that key is used for drafts and doesn't count against the pooled quota.
- Same for Google Places.
- Encourages power users without us paying their inference bill.

---

## 6. Admin / support surface

A hand-rolled `/admin` behind an env-flag email allowlist (`SUPER_ADMIN_EMAILS`). Not Stripe-grade admin — just enough:
- Workspace list + search
- Impersonate (view-only) for support
- Comp a plan upgrade for a specific workspace
- Toggle feature flags per workspace
- See usage counters
- Flagged / abuse reports

---

## 7. Legal + compliance

Must ship before paid users:
- Terms of Service (what's allowed, no-spam clause, acceptable use)
- Privacy Policy (what we store, where, how long, user rights)
- DPA template (for EU + Teams tier)
- Cookie banner only if we add analytics that need it (prefer server-side analytics to avoid)
- Clear statement that users are responsible for CAN-SPAM / GDPR / local outreach law compliance (already in Settings page, promote to signup)
- Opt-out link in every outreach template that goes through the system (automatic)

---

## 8. Implementation phases (ordered)

### Phase A — Multi-tenant foundation (~2 weeks)
- Add `workspaces` + `workspace_members` tables
- Rename `owner_id` → `workspace_id` across schema
- Session/auth rewrite (magic link via Resend)
- Role gates on every server action
- Workspace switcher in topbar
- Tests: cross-workspace isolation

### Phase B — Billing + limits (~1 week)
- Stripe products + webhooks
- `workspace_usage` + metering hooks
- Checkout + portal
- `requireFeature(workspace, feature)` guard across routes

### Phase C — Onboarding + presets (~1.5 weeks)
- Preset config files (12 presets)
- `/onboarding` wizard (5 steps)
- Industry preset loader (seeds scoring weights, services, templates)
- Demo campaign seeding on finish
- First-run checklist

### Phase D — Automations wave 2 (~2 weeks)
- Reply triage (AI classifier) + task creation
- Follow-up cadences
- Hot-lead alerts (in-app + email)
- Auto-enrichment pass
- Bounce handling
- Snooze + wake
- Re-score on config change

### Phase E — Teams features (~1.5 weeks)
- RBAC enforcement
- Lead assignment
- Audit log table
- Shared Gmail reply inbox
- Slack / Discord webhooks
- Outbound webhooks
- Scheduled CSV exports to R2
- Variant A/B winner analytics

### Phase F — Niche-agnostic customization (~1.5 weeks)
- Custom audit factors
- Custom scoring factors (Teams)
- Variable library + template editor
- Rename DWN-specific labels → workspace labels
- Theme customization (Teams: logo, accent color)

### Phase G — Marketing site + launch (~1 week)
- Pricing page
- Docs site (mdx-based, inside the repo or separate static site)
- Landing page copy (focused on evidence-based outreach differentiator)
- Help email inbox (help@…)
- Launch channels: ProductHunt, X/Twitter, LinkedIn, DWN newsletter

### Phase H — Hardening + Studio prep (ongoing)
- SOC2-lite checklist (encryption at rest, access logs, backup rotation)
- SSO / SAML (deferred until first Studio customer requests)
- White-label (deferred until first customer requests)
- Multi-region deploys (not needed for a while)

**Total build estimate:** ~10 weeks of focused work. Can ship Phase A → C as a closed beta (10 users) much earlier.

---

## 9. Open questions

1. **Name** — "DWN Reach" ties to DWN brand (good) but limits spin-off potential (bad). Decide early; renaming after launch is painful.
2. **Hosted vs BYO AI** — do we subsidize AI costs on paid tiers, or require BYO on Teams? Current plan says a pooled quota with BYO as upgrade escape hatch. Safer financially.
3. **Freemium cannibalization** — 50-lead free tier may be too generous for a solo freelancer who could run their whole book of business on it. Monitor; may tighten to 25.
4. **Compliance tooling** — do we build in-app opt-out link injection or require users to add their own? Opinionated default: inject, with override.
5. **Cloudflare bias** — current stack is deeply CF-locked. Fine for v1. Watch pricing as workspace count grows; Workers CPU can get expensive on large discovery runs.
6. **Data portability** — users must be able to export everything on cancel. Build full CSV export of all leads/activities/drafts into the Settings page before launch.
7. **Support load** — a sellable product generates tickets. Who answers? Draft a lightweight help center + canned responses before launch to deflect common questions.

---

## 10. What NOT to build (for discipline)

Easy to get sidetracked. Explicitly out of scope for v1:
- Mobile app
- Chrome extension
- LinkedIn automation (never, actually)
- Full CRM parity with HubSpot (deals, forecasting, custom pipelines beyond the fixed 10 stages)
- Marketing automation (nurture sequences for leads who became customers)
- Email editor WYSIWYG (plain text + markdown only; it's outbound, not newsletter)
- AI "write a whole campaign for me" button (goes against the evidence-based positioning)
- Mass CSV re-import that creates duplicates (hard dedup already in place; keep it)

---

## 11. Memory notes for future sessions

- Product name decision pending — DO NOT commit to a name in code until approved.
- Multi-tenant migration is the single most load-bearing change. Everything else depends on it.
- Keep the evidence-based + human-approval positioning. Resist pressure to add auto-send even on Teams tier. That's the moat.
- Pricing is a hypothesis — expect to A/B test after launch. Build the pricing page to swap values without code changes (fetch from Stripe at render time).
