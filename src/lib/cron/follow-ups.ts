/**
 * Follow-up cadence runner.
 *
 * Iterates all non-demo owners' contacted drafts, evaluates each against its
 * campaign's attached cadence, and creates a new `needs_review` draft for any
 * step that has come due. The follow-up draft inherits the parent's
 * gmailThreadId (stored in personalizationEvidence) and increments cadenceStep.
 */

import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { outreachDrafts, profiles } from "@/lib/db/schema";
import {
  createActivity,
  createDraft,
  getLead,
  getLatestAudit,
  getLatestBrief,
  listServiceOfferings,
} from "@/lib/db/repos";
import { getCadenceForCampaign } from "@/lib/db/repos/cadences";
import { evaluateCadenceStep } from "@/lib/outreach/cadence";
import { generateFollowUpDraft } from "@/lib/outreach/follow-up";
import type { RuntimeEnv } from "@/lib/env";

export type FollowUpRunResult = {
  evaluated: number;
  created: number;
  errors: Array<{ draftId: string; reason: string }>;
};

function extractGmailThreadId(evidence: string[]): string | undefined {
  for (const e of evidence) {
    const m = e.match(/Gmail thread:\s*(\S+)/i);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function extractCadenceStep(evidence: string[]): number {
  for (const e of evidence) {
    const m = e.match(/Cadence step:\s*(\d+)/i);
    if (m?.[1]) return parseInt(m[1], 10);
  }
  return 0;
}

export async function runFollowUpCadences(
  db: Db,
  ownerId: string,
  env: RuntimeEnv
): Promise<FollowUpRunResult> {
  const result: FollowUpRunResult = { evaluated: 0, created: 0, errors: [] };

  const contactedDrafts = await db
    .select()
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.ownerId, ownerId),
        eq(outreachDrafts.status, "contacted")
      )
    );

  const nowIso = new Date().toISOString();

  for (const draftRow of contactedDrafts) {
    try {
      // Skip if already replied
      if (draftRow.replySentiment) continue;

      const campaignId = draftRow.campaignId;
      if (!campaignId) continue;

      const cadence = await getCadenceForCampaign(db, ownerId, campaignId);
      if (!cadence || cadence.steps.length === 0) continue;

      const evidence = (draftRow.personalizationEvidence as string[]) ?? [];
      const currentStep = extractCadenceStep(evidence);
      const gmailThreadId = extractGmailThreadId(evidence);
      const contactedAt = draftRow.contactedAt ?? draftRow.updatedAt;

      result.evaluated += 1;

      const nextStep = evaluateCadenceStep(
        cadence,
        {
          cadenceStep: currentStep,
          contactedAt,
          hasReply: !!draftRow.replySentiment,
        },
        nowIso
      );

      if (!nextStep) continue;

      const lead = await getLead(db, ownerId, draftRow.leadId);
      if (!lead || lead.doNotContact.flagged) continue;

      const [audit, brief, services] = await Promise.all([
        getLatestAudit(db, ownerId, lead.id),
        getLatestBrief(db, ownerId, lead.id),
        listServiceOfferings(db, ownerId),
      ]);

      const followUp = await generateFollowUpDraft({
        draftInput: { lead, brief, audit, services, channel: draftRow.channel as "email" | "contact_form" | "instagram_dm" | "linkedin_manual" | "other" },
        cadenceStep: {
          stepNumber: nextStep.stepNumber,
          offsetDays: nextStep.offsetDays,
          template: nextStep.template,
          channel: nextStep.channel,
        },
        parentDraftId: draftRow.id,
        parentGmailThreadId: gmailThreadId,
        env,
      });

      const newEvidence = [
        ...followUp.personalizationEvidence,
        `Cadence step: ${nextStep.stepNumber}`,
        `Parent draft: ${draftRow.id}`,
        ...(followUp.gmailThreadId ? [`Gmail thread: ${followUp.gmailThreadId}`] : []),
      ];

      await createDraft(db, ownerId, {
        leadId: draftRow.leadId,
        campaignId: campaignId,
        channel: followUp.channel,
        subject: followUp.subject ?? undefined,
        body: followUp.body,
        personalizationEvidence: newEvidence,
        source: followUp.source,
      });

      await createActivity(db, ownerId, {
        leadId: draftRow.leadId,
        campaignId: campaignId,
        activityType: "draft_created",
        title: `Follow-up step ${nextStep.stepNumber} queued`,
        description: `Cadence: ${cadence.name} · step ${nextStep.stepNumber}`,
        metadata: { auto: true, parentDraftId: draftRow.id, cadenceStep: nextStep.stepNumber },
      });

      result.created += 1;
    } catch (err) {
      result.errors.push({ draftId: draftRow.id, reason: (err as Error).message });
    }
  }

  return result;
}

export async function runAllOwnerFollowUpCadences(
  db: Db,
  env: RuntimeEnv
): Promise<Record<string, FollowUpRunResult>> {
  const owners = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isDemo, false))
    .orderBy(asc(profiles.createdAt));

  const results: Record<string, FollowUpRunResult> = {};
  for (const owner of owners) {
    results[owner.id] = await runFollowUpCadences(db, owner.id, env);
  }
  return results;
}
