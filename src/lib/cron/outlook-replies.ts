/**
 * Outlook reply sweep.
 *
 * Mirrors the Gmail reply-triage cron but uses the Outlook (Microsoft Graph)
 * client. Scans all non-demo owners who have `outlook_tokens/v1` stored,
 * fetches unread messages from the last 48h, and matches each message to an
 * outreach draft by `conversationId` stored in the draft's `gmail_thread_id`
 * column (the column is provider-agnostic — it stores the thread/conversation
 * ID regardless of which email provider was used to send).
 *
 * When a match is found:
 *   - `repliedAt` and `replySentiment` are NOT set here (that's the triage
 *     cron's job). This cron only stamps that a reply arrived so the triage
 *     sweep has the latest data.
 *   - An `outreach_reply` activity is logged with the conversation ID.
 *   - Rotated tokens are persisted back to `outlook_tokens/v1`.
 */

import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { outreachDrafts, profiles } from "@/lib/db/schema";
import { createActivity } from "@/lib/db/repos";
import { listUnreadReplies } from "@/lib/outlook/client";
import type { RuntimeEnv } from "@/lib/env";
import type { OutlookTokens } from "@/lib/outlook/client";
import { getSetting, setSetting } from "@/lib/db/repos/settings";
import { sql } from "drizzle-orm";

export const OUTLOOK_TOKENS_KEY = "outlook_tokens/v1";

export type OutlookReplySweepResult = {
  processed: number;
  matched: Array<{ draftId: string; conversationId: string; leadId: string }>;
  errors: Array<{ reason: string }>;
};

async function getOutlookTokens(
  db: Db,
  ownerId: string
): Promise<OutlookTokens | undefined> {
  const raw = await getSetting<Partial<OutlookTokens>>(
    db,
    ownerId,
    OUTLOOK_TOKENS_KEY
  );
  if (!raw) return undefined;
  if (!raw.accessToken || !raw.refreshToken || !raw.expiresAt) return undefined;
  return raw as OutlookTokens;
}

export async function runOutlookReplySweep(
  db: Db,
  ownerId: string,
  env: RuntimeEnv
): Promise<OutlookReplySweepResult> {
  const result: OutlookReplySweepResult = {
    processed: 0,
    matched: [],
    errors: [],
  };

  const tokens = await getOutlookTokens(db, ownerId);
  if (!tokens) return result;

  const afterIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  let replies;
  let finalTokens: OutlookTokens;
  try {
    const res = await listUnreadReplies({ afterIso, tokens, env });
    replies = res.replies;
    finalTokens = res.tokens;
  } catch (err) {
    result.errors.push({
      reason: `Outlook list failed: ${(err as Error).message}`,
    });
    return result;
  }

  // Persist any rotated tokens immediately
  if (finalTokens !== tokens) {
    await setSetting(db, ownerId, OUTLOOK_TOKENS_KEY, {
      accessToken: finalTokens.accessToken,
      refreshToken: finalTokens.refreshToken,
      expiresAt: finalTokens.expiresAt,
    });
  }

  if (replies.length === 0) return result;

  // Load contacted drafts. We look for conversationId in gmail_thread_id
  // (the column is provider-agnostic).
  const draftRows = await db
    .select()
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.ownerId, ownerId),
        eq(outreachDrafts.status, "contacted")
      )
    );

  for (const reply of replies) {
    try {
      result.processed += 1;

      // Match by conversationId stored in gmail_thread_id column (raw SQL
      // because Drizzle schema doesn't include the Phase A migration column)
      const matchingDraft = draftRows.find((d) => {
        // Check the column via the raw row object
        const threadId = (d as Record<string, unknown>)["gmailThreadId"] as string | undefined;
        return threadId === reply.threadId;
      });

      if (!matchingDraft) continue;
      if (matchingDraft.repliedAt) continue; // already recorded

      const now = new Date().toISOString();
      await db.run(
        sql`UPDATE outreach_drafts SET replied_at = ${now}, updated_at = ${now} WHERE owner_id = ${ownerId} AND id = ${matchingDraft.id}`
      );

      result.matched.push({
        draftId: matchingDraft.id,
        conversationId: reply.threadId,
        leadId: matchingDraft.leadId,
      });

      await createActivity(db, ownerId, {
        leadId: matchingDraft.leadId,
        activityType: "reply_logged",
        title: "Outlook reply received",
        description: `From ${reply.from} · subject: ${reply.subject}`,
        metadata: {
          auto: true,
          provider: "outlook",
          draftId: matchingDraft.id,
          conversationId: reply.threadId,
          messageId: reply.messageId,
        },
      });
    } catch (err) {
      result.errors.push({ reason: (err as Error).message });
    }
  }

  return result;
}

export async function runAllOwnerOutlookReplySweeps(
  db: Db,
  env: RuntimeEnv
): Promise<Record<string, OutlookReplySweepResult>> {
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  const results: Record<string, OutlookReplySweepResult> = {};
  for (const owner of owners) {
    results[owner.id] = await runOutlookReplySweep(db, owner.id, env);
  }
  return results;
}
