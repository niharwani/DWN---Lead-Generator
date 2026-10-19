/**
 * Reply triage sweep.
 *
 * Iterates all non-demo owners who have Gmail tokens stored, fetches unread
 * replies from the last 48h, matches each reply to an outreach draft by
 * gmailThreadId stored in the draft's personalizationEvidence JSON, classifies
 * via Claude Haiku, and persists the replySentiment.
 *
 * Side effects per class:
 *   - interested / needs_info → activity log entry + optional hot-lead alert
 *   - unsubscribe → marks lead do-not-contact
 *   - not_a_fit → marks draft archived
 */

import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { outreachDrafts, profiles } from "@/lib/db/schema";
import { createActivity, updateLead } from "@/lib/db/repos";
import { listUnreadReplies } from "@/lib/gmail/client";
import { classifyReply } from "@/lib/outreach/triage";
import { getNotificationPrefs } from "@/lib/db/repos/notification-prefs";
import { notify } from "@/lib/notifications/dispatcher";
import type { RuntimeEnv } from "@/lib/env";
import type { GmailTokens } from "@/lib/gmail/client";

export type TriageSweepResult = {
  processed: number;
  classified: Array<{
    draftId: string;
    sentiment: string;
    leadId: string;
  }>;
  errors: Array<{ reason: string }>;
};

/**
 * Retrieve Gmail tokens for the owner. We store them in app_settings under
 * "gmail_tokens/v1" (set by the Gmail OAuth flow in the settings page).
 */
async function getGmailTokens(
  db: Db,
  ownerId: string
): Promise<GmailTokens | undefined> {
  const { appSettings } = await import("@/lib/db/schema");
  const [row] = await db
    .select()
    .from(appSettings)
    .where(
      and(
        eq(appSettings.ownerId, ownerId),
        eq(appSettings.key, "gmail_tokens/v1")
      )
    )
    .limit(1);
  if (!row?.value) return undefined;
  const v = row.value as Partial<GmailTokens>;
  if (!v.accessToken || !v.refreshToken || !v.expiresAt) return undefined;
  return v as GmailTokens;
}

export async function runReplyTriageSweep(
  db: Db,
  ownerId: string,
  env: RuntimeEnv
): Promise<TriageSweepResult> {
  const result: TriageSweepResult = {
    processed: 0,
    classified: [],
    errors: [],
  };

  const tokens = await getGmailTokens(db, ownerId);
  if (!tokens) {
    // No Gmail connected — nothing to triage
    return result;
  }

  const afterIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  let replies;
  try {
    const res = await listUnreadReplies({ afterIso, tokens, env });
    replies = res.replies;
  } catch (err) {
    result.errors.push({ reason: `Gmail list failed: ${(err as Error).message}` });
    return result;
  }

  if (replies.length === 0) return result;

  // Find contacted drafts that have a gmailThreadId in their evidence
  // We store gmailThreadId in personalizationEvidence as "Gmail thread: <id>"
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
      // Match reply to draft by threadId.
      // Phase G: first check the gmail_thread_id column (set by sendDraftViaGmailAction).
      // Fall back to searching personalizationEvidence strings for backwards compat
      // with drafts sent before the column was populated.
      const matchingDraft = draftRows.find((d) => {
        const colThreadId = (d as Record<string, unknown>)["gmailThreadId"] as string | undefined;
        if (colThreadId && colThreadId === reply.threadId) return true;
        const evidence = (d.personalizationEvidence as string[]) ?? [];
        return evidence.some((e) => e.includes(reply.threadId));
      });

      if (!matchingDraft) continue;

      // Skip already-classified drafts
      if (matchingDraft.replySentiment) continue;

      result.processed += 1;

      const sentiment = await classifyReply(reply.snippet, env);

      const now = new Date().toISOString();
      await db
        .update(outreachDrafts)
        .set({
          replySentiment: sentiment.class,
          repliedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(outreachDrafts.ownerId, ownerId),
            eq(outreachDrafts.id, matchingDraft.id)
          )
        );

      result.classified.push({
        draftId: matchingDraft.id,
        sentiment: sentiment.class,
        leadId: matchingDraft.leadId,
      });

      await createActivity(db, ownerId, {
        leadId: matchingDraft.leadId,
        activityType: "reply_logged",
        title: `Reply triage: ${sentiment.class.replace("_", " ")}`,
        description: sentiment.reason,
        metadata: {
          auto: true,
          draftId: matchingDraft.id,
          gmailThreadId: reply.threadId,
          sentiment: sentiment.class,
          suggestedNextAction: sentiment.suggested_next_action,
        },
      });

      // Side effects
      if (sentiment.class === "unsubscribe") {
        await updateLead(db, ownerId, matchingDraft.leadId, {
          flagDoNotContact: true,
          doNotContactReason: "Replied asking to unsubscribe (auto-detected).",
        });
      }

      // Hot-lead alert
      if (sentiment.class === "interested") {
        try {
          const prefs = await getNotificationPrefs(db, ownerId);
          if (prefs.hotLeadAlerts) {
            await notify(prefs, {
              event: "hot_lead_alert",
              title: "Hot lead — reply received!",
              body: `A lead replied with interest. ${sentiment.reason}${sentiment.suggested_next_action ? "\nSuggested: " + sentiment.suggested_next_action : ""}`,
              leadId: matchingDraft.leadId,
            }, env);
          }
        } catch {
          // Notification failure is non-fatal
        }
      }
    } catch (err) {
      result.errors.push({ reason: (err as Error).message });
    }
  }

  return result;
}

/**
 * Run triage for all non-demo owners.
 */
export async function runAllOwnerTriageSweeps(
  db: Db,
  env: RuntimeEnv
): Promise<Record<string, TriageSweepResult>> {
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  const results: Record<string, TriageSweepResult> = {};
  for (const owner of owners) {
    results[owner.id] = await runReplyTriageSweep(db, owner.id, env);
  }
  return results;
}
