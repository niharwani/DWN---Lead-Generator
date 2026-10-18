/**
 * Bounce / DSN detection sweep.
 *
 * Scans the Gmail inbox for delivery status notifications (DSNs) and permanent
 * failure replies. When a bounce is detected, marks the lead do-not-contact
 * with reason "bounced" and archives any pending drafts targeting that address.
 */

import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { leads, outreachDrafts, profiles } from "@/lib/db/schema";
import { createActivity, updateLead } from "@/lib/db/repos";
import { listUnreadReplies } from "@/lib/gmail/client";
import type { RuntimeEnv } from "@/lib/env";
import type { GmailTokens } from "@/lib/gmail/client";

export type BounceSweepResult = {
  scanned: number;
  bouncesDetected: number;
  leadsFlagged: number;
  draftsArchived: number;
  errors: Array<{ reason: string }>;
};

const BOUNCE_SUBJECT_PATTERNS = [
  /delivery status notification/i,
  /undeliverable/i,
  /mail delivery failed/i,
  /delivery failure/i,
  /returned mail/i,
  /mail delivery subsystem/i,
  /postmaster/i,
];

const BOUNCE_FROM_PATTERNS = [
  /mailer-daemon/i,
  /postmaster/i,
  /noreply.*bounce/i,
  /bounce.*noreply/i,
];

export function isBounceMessage(from: string, subject: string): boolean {
  return (
    BOUNCE_FROM_PATTERNS.some((p) => p.test(from)) ||
    BOUNCE_SUBJECT_PATTERNS.some((p) => p.test(subject))
  );
}

async function getGmailTokens(db: Db, ownerId: string): Promise<GmailTokens | undefined> {
  const { appSettings } = await import("@/lib/db/schema");
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, "gmail_tokens/v1")))
    .limit(1);
  if (!row?.value) return undefined;
  const v = row.value as Partial<GmailTokens>;
  if (!v.accessToken || !v.refreshToken || !v.expiresAt) return undefined;
  return v as GmailTokens;
}

export async function runBounceSweep(
  db: Db,
  ownerId: string,
  env: RuntimeEnv
): Promise<BounceSweepResult> {
  const result: BounceSweepResult = {
    scanned: 0,
    bouncesDetected: 0,
    leadsFlagged: 0,
    draftsArchived: 0,
    errors: [],
  };

  const tokens = await getGmailTokens(db, ownerId);
  if (!tokens) return result;

  const afterIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let replies;
  try {
    const res = await listUnreadReplies({ afterIso, tokens, env });
    replies = res.replies;
  } catch (err) {
    result.errors.push({ reason: `Gmail list failed: ${(err as Error).message}` });
    return result;
  }

  result.scanned = replies.length;

  for (const reply of replies) {
    try {
      if (!isBounceMessage(reply.from, reply.subject)) continue;

      result.bouncesDetected += 1;

      // Find leads whose publicEmail appears in the snippet or from field
      const allLeads = await db
        .select({ id: leads.id, publicEmail: leads.publicEmail, doNotContact: leads.doNotContact })
        .from(leads)
        .where(and(eq(leads.ownerId, ownerId), eq(leads.doNotContact, false)));

      for (const lead of allLeads) {
        if (!lead.publicEmail) continue;
        if (!reply.snippet.includes(lead.publicEmail) && !reply.from.includes(lead.publicEmail)) {
          continue;
        }

        await updateLead(db, ownerId, lead.id, {
          flagDoNotContact: true,
          doNotContactReason: "Email bounced (auto-detected from DSN).",
        });
        result.leadsFlagged += 1;

        // Archive pending drafts for this lead
        const draftRows = await db
          .select({ id: outreachDrafts.id })
          .from(outreachDrafts)
          .where(
            and(
              eq(outreachDrafts.ownerId, ownerId),
              eq(outreachDrafts.leadId, lead.id)
            )
          );

        for (const draft of draftRows) {
          await db
            .update(outreachDrafts)
            .set({ status: "archived", updatedAt: new Date().toISOString() })
            .where(and(eq(outreachDrafts.ownerId, ownerId), eq(outreachDrafts.id, draft.id)));
          result.draftsArchived += 1;
        }

        await createActivity(db, ownerId, {
          leadId: lead.id,
          activityType: "lead_updated",
          title: "Email bounce detected",
          description: `DSN from ${reply.from} — lead marked do-not-contact`,
          metadata: { auto: true, bounceSubject: reply.subject, gmailMessageId: reply.messageId },
        });
      }
    } catch (err) {
      result.errors.push({ reason: (err as Error).message });
    }
  }

  return result;
}

export async function runAllOwnerBounceSweeps(
  db: Db,
  env: RuntimeEnv
): Promise<Record<string, BounceSweepResult>> {
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  const results: Record<string, BounceSweepResult> = {};
  for (const owner of owners) {
    results[owner.id] = await runBounceSweep(db, owner.id, env);
  }
  return results;
}
