# Gmail Integration — Setup & Wiring

Scaffolding is in place for OAuth, send, and reply-polling. A follow-up pass
must wire the UI, server action, env typing, and cron. Steps below.

## 1. Google Cloud Console (owner, one-time)

- Create a project (or reuse an existing one) at https://console.cloud.google.com.
- `APIs & Services` → `Library` → enable **Gmail API**.
- `APIs & Services` → `OAuth consent screen`:
  - User type: **External**.
  - Add the owner email as a Test user.
  - Scopes to add:
    - `https://www.googleapis.com/auth/gmail.send`
    - `https://www.googleapis.com/auth/gmail.readonly`
- `APIs & Services` → `Credentials` → `Create Credentials` → `OAuth client ID`:
  - Application type: **Web application**.
  - Authorized redirect URIs:
    - `https://dwn-lead-engine.designwithnihar.workers.dev/api/gmail/oauth/callback`
    - `http://localhost:3000/api/gmail/oauth/callback` (for dev)
- Copy the **Client ID** and **Client Secret**.

## 2. Worker secrets

Run from the project root:

- `wrangler secret put GMAIL_CLIENT_ID`
- `wrangler secret put GMAIL_CLIENT_SECRET`
- `wrangler secret put GMAIL_REDIRECT_URI` (set to the prod callback URL above)

For local dev, add the same keys to `.dev.vars`.

## 3. Follow-up code wiring (DO NOT skip)

- `src/lib/env.ts` — add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` to `EXPOSED_KEYS`.
- `src/app/(app)/settings/page.tsx` — read `gmail_tokens/v1` via `getSetting(db, ownerId, "gmail_tokens/v1")`; show a **Connect Gmail** link pointing at `/api/gmail/oauth/start` when absent, or a **Disconnect** button (POST to `/api/gmail/disconnect`) when present. Surface the `?gmail=connected` / `?gmail=error&reason=...` query flash.
- `src/app/(app)/leads/[id]/page.tsx` — next to the existing **Mark contacted** button on each approved draft, add a **Send via Gmail** form that posts to a new server action `sendDraftViaGmailAction`. Disable the button when Gmail is not connected or when the draft channel is not `email`.
- `src/lib/actions.ts` — new server action `sendDraftViaGmailAction(draftId: string)`:
  - `requirePageOwner()` → `getSetting(db, ownerId, "gmail_tokens/v1")`; 400 if missing.
  - Load the draft + lead; refuse unless `draft.status === "approved"` and `draft.channel === "email"` and `lead.publicEmail` present.
  - Call `sendMessage({ to: lead.publicEmail, from: owner.email, subject: draft.subject!, body: draft.body, tokens, env })`.
  - Persist the returned `tokens` back to `gmail_tokens/v1` (handles refresh rotation).
  - Transition draft to `contacted` (reuse the existing contacted-transition helper) and log an `activity` of kind `outreach_sent` with `{ gmailMessageId, gmailThreadId }` in details.
- `src/lib/cron/` (new stream) — add a daily handler that:
  - Loads `gmail_tokens/v1` per owner.
  - Calls `listUnreadReplies({ afterIso: yesterday, tokens, env })`.
  - For each reply, matches by `threadId` against drafts with a stored `gmailThreadId`; when matched, stamps `repliedAt` on the draft and logs an `outreach_reply` activity.
  - Persists any rotated `tokens` back to `gmail_tokens/v1`.

## 4. Files created by this pass (no edits needed)

- `src/lib/gmail/encode.ts`
- `src/lib/gmail/oauth.ts`
- `src/lib/gmail/client.ts`
- `src/app/api/gmail/oauth/start/route.ts`
- `src/app/api/gmail/oauth/callback/route.ts`
- `src/app/api/gmail/disconnect/route.ts`
- `tests/unit/gmail-encode.test.ts`

## 5. Notes

- The token repo function the callback uses is `setSetting` (from `src/lib/db/repos/settings.ts`), not `saveAppSetting`. If the follow-up stream adds a `saveAppSetting` alias, swap the import.
- `refreshAccessToken` and `sendMessage` return the rotated token pair — always persist it.
- Scopes requested cover both send and inbox read; no additional consent is needed later for the reply poller.
