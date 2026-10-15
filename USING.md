# Using the DWN Lead Engine

A plain-English guide to what each screen does, and what you can click on it. No code required.

---

## Getting in

Open **https://dwn-lead-engine.designwithnihar.workers.dev** in your browser.

- Cloudflare Access gates it — sign in with `designwithnihar@gmail.com`. Nobody else can get past this screen.
- Once in, you land on **Overview**.

If you ever get kicked out, close the tab, re-open the link, and sign in again.

---

## What's on the sidebar

The left sidebar has eight items. Each one is a screen. Click any item to jump there.

### 1. Overview

The dashboard. First screen you see after login.

- **Stat tiles** across the top — total leads, new this week, needing review, qualified, follow-ups due today, drafts awaiting approval, replies, meetings, proposals, deals won.
- **Pipeline funnel** — a bar chart showing how many leads are in each stage.
- **Due today** — tasks (follow-ups, reviews) that need attention. Click a task to jump to the lead.
- **Recent activity** — the last few things that happened across all leads.
- **Lead sources** — where current leads came from (CSV, discovery, manual, etc.).
- **Best-performing campaigns** — top 3 campaigns ranked by qualified leads.

**Top-right buttons:**
- **Find leads** — jumps to Discover.
- **Import CSV** — jumps to Leads with the CSV upload opened.
- **Add lead** — jumps to Leads with the "new lead" form opened.

### 2. Discover

Find new businesses to add as leads.

- Pick a **source** (Google Places, manual URL list, CSV).
- Give it inputs — e.g. "yoga studios in Mumbai with websites".
- It creates a **discovery job** that runs in the background. Progress shows up on the page.
- When it finishes, the found businesses show up as leads under **Leads**.

> In demo mode, all discovery runs return pre-canned fictional businesses tagged as fake. No real API is called.

### 3. Leads

The main workspace. One row per business.

- **Filter bar** at the top: stage, score band, source, tags, do-not-contact flag.
- **Sort**: by score, by last updated, by next action.
- Each row shows business name, score, stage, next action, and tags.
- Click a row to open **lead detail**:
  - Business info (name, website, address, category).
  - **Score breakdown** — explains WHY it got this score (per-factor). No black box.
  - **Website audit** — findings from scanning the business's public site (broken links, slow pages, missing meta, HTTPS issues, etc.).
  - **Opportunity brief** — a short write-up: what's wrong, what you could sell them, what to deliver.
  - **Outreach drafts** attached to this lead.
  - **Activity log** — every change to this lead, timestamped.
  - **Tasks** — anything scheduled for this lead.

**Top-right buttons on the Leads list:**
- **Import CSV** — upload a spreadsheet of leads. There's a template available.
- **Add lead** — manually add a single lead by name + URL.
- **Export** — download the current filtered list as CSV.

### 4. Campaigns

A campaign is a target audience + an offer, used to group leads.

- Each campaign has: name, niche, geography, ideal customer description, offer/value prop, minimum score.
- Click a campaign to open **campaign detail**:
  - Which leads are attached.
  - Metrics: discovered, qualified, drafted, contacted, replied, won.
  - Drafts in flight for this campaign.
- **New campaign** button (top-right) to create one.

### 5. Outreach

Where drafted messages live before you send them.

- Every draft has status: **needs review**, **approved**, **contacted**, **replied**, **won/lost**.
- Click a draft to see:
  - The lead it's for.
  - The subject + body of the message.
  - **Personalization evidence** — which audit findings / observations the draft was built from. This is how you know it's not generic.
  - Edit, approve, or discard.
- **Nothing auto-sends.** You approve, then paste the message into your own email / LinkedIn / wherever. "Mark as contacted" when you've actually sent it.

### 6. Tasks

Follow-ups, reviews, manual sends — anything you need to remember.

- Grouped as **Overdue**, **Today**, **Later**.
- Each row shows the task, the lead it's attached to, and the due time.
- Click to open the related lead.
- Mark complete when done.

### 7. Reports

Deeper view of the numbers.

- **Pipeline funnel** at a larger scale, with stage-to-stage conversion rates.
- **Source breakdown** — which lead sources produce the most qualified leads.
- **Campaign comparison** — stack campaigns side-by-side by any metric.
- Date range selector top-right.

### 8. Settings

Configuration.

- **Service offerings** — list of what DWN sells. Used by the brief generator and draft templates.
- **Scoring weights** — tune how much each factor contributes to lead score (website condition, niche match, geography fit, deal-size fit, evidence quality).
- **API integrations** — slots for Google Places, Anthropic, PageSpeed keys. All optional. Without them, the app runs in demo mode and uses fallback data.
- **Demo mode toggle** — forces fictional data even when real keys are set.

---

## What "Demo mode" means

Right now the Lead Engine is in **demo mode**:
- All 17 leads, campaigns, drafts, audits, and briefs are **fictional seed data**.
- The yellow banner on top of every screen reminds you of this.
- No external services are called, no emails are sent, no real businesses are being tracked.

Demo mode is useful for seeing the app end-to-end before pointing it at real data. To switch to real mode, you'd add API keys under **Settings** → **API integrations** and uncheck demo mode. Then start fresh with your own CSV import or a Discover run.

---

## If something breaks

### I get a 404 on every page
Means the login session didn't attach properly. Sign out of Cloudflare Access (visit `https://designwithnihar.cloudflareaccess.com/cdn-cgi/access/logout`), then open the app URL again and sign back in.

### The page is blank or spins forever
Hard refresh with **Ctrl+F5**. If still broken, Cloudflare might be deploying — wait 30 seconds and try again.

### I want to wipe demo data and start fresh
Run `pnpm db:seed:remote` from the project folder (`c:\Coding Files\Lead Generator`) to re-seed. Or ask me to do it.

### I want to redeploy after changing something
From the project folder: `pnpm deploy`. First time per machine you'll need `npx wrangler login` once.

---

## Where everything lives

- **Live app:** https://dwn-lead-engine.designwithnihar.workers.dev
- **Project folder on your laptop:** `c:\Coding Files\Lead Generator`
- **Cloudflare dashboard:** https://dash.cloudflare.com → Workers & Pages → `dwn-lead-engine`
- **Database (D1):** `dwn_lead_engine` in the same Cloudflare account.
- **Access policy:** `designwithnihar@gmail.com` is the only email allow-listed. Add more under Zero Trust → Access → Applications → DWN Lead Engine.
