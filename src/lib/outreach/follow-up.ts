/**
 * Follow-up draft generator.
 *
 * Wraps the existing `src/lib/outreach/draft.ts` builder with cadence-step
 * context. Sets parentDraftId, cadenceStep, and reuses the parent's
 * gmailThreadId so the follow-up is threaded correctly in Gmail.
 *
 * DO NOT modify draft.ts — Phase C may be refactoring it concurrently.
 */

import { buildTemplateDraft, buildAiDraft, type BuildDraftInput, type DraftOutput } from "./draft";
import type { CadenceStep } from "./cadence";

export type FollowUpInput = {
  /** Base input forwarded to the underlying draft builder */
  draftInput: BuildDraftInput;
  /** The cadence step that triggered this follow-up */
  cadenceStep: CadenceStep;
  /** ID of the parent (previously contacted) draft */
  parentDraftId: string;
  /** Gmail thread ID from the parent draft so the follow-up is threaded */
  parentGmailThreadId?: string;
  /** Env map for optional AI generation */
  env: Readonly<Record<string, string | undefined>>;
};

export type FollowUpDraftOutput = DraftOutput & {
  parentDraftId: string;
  cadenceStep: number;
  gmailThreadId?: string;
};

/**
 * Generate a follow-up draft for the next cadence step.
 *
 * Uses AI when ANTHROPIC_API_KEY is present, otherwise falls back to the
 * template builder — same pattern as the primary draft generation in actions.ts.
 */
export async function generateFollowUpDraft(
  input: FollowUpInput
): Promise<FollowUpDraftOutput> {
  let base: DraftOutput;

  if (input.env.ANTHROPIC_API_KEY) {
    try {
      base = await buildAiDraft(input.draftInput, input.env);
    } catch {
      base = buildTemplateDraft(input.draftInput);
    }
  } else {
    base = buildTemplateDraft(input.draftInput);
  }

  return {
    ...base,
    parentDraftId: input.parentDraftId,
    cadenceStep: input.cadenceStep.stepNumber,
    gmailThreadId: input.parentGmailThreadId,
  };
}
