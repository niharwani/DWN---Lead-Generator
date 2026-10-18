/**
 * Pure cadence-step evaluator.
 *
 * Given a cadence definition and the current draft state, returns either
 * `null` (no follow-up due yet) or the parameters for the next step.
 * Nothing in this module touches the database.
 */

export type CadenceStep = {
  stepNumber: number;
  /** Days after the previous contact to send this step */
  offsetDays: number;
  template: string;
  channel: "email" | "contact_form" | "instagram_dm" | "linkedin_manual" | "other";
};

export type CadenceConfig = {
  id: string;
  name: string;
  steps: CadenceStep[];
};

export type DraftState = {
  /** Step index already sent (0 = initial contact, 1 = first follow-up, etc.) */
  cadenceStep: number;
  /** ISO timestamp of the most recent contact */
  contactedAt: string;
  /** Whether a reply has been received */
  hasReply: boolean;
};

export type NextStepResult = {
  stepNumber: number;
  offsetDays: number;
  template: string;
  channel: CadenceStep["channel"];
};

/**
 * Evaluate whether a follow-up is due for the given draft state against the
 * cadence config. Returns `null` when:
 *   - A reply has already been received (cadence ends on reply)
 *   - All cadence steps have been exhausted
 *   - The next step's offset hasn't elapsed yet
 */
export function evaluateCadenceStep(
  cadence: CadenceConfig,
  state: DraftState,
  nowIso: string
): NextStepResult | null {
  if (state.hasReply) return null;

  const nextStepIndex = state.cadenceStep; // 0-based index into cadence.steps
  const nextStep = cadence.steps[nextStepIndex];
  if (!nextStep) return null; // all steps exhausted

  const contactedMs = Date.parse(state.contactedAt);
  if (Number.isNaN(contactedMs)) return null;

  const nowMs = Date.parse(nowIso);
  const elapsedDays = (nowMs - contactedMs) / (24 * 60 * 60 * 1000);

  if (elapsedDays < nextStep.offsetDays) return null;

  return {
    stepNumber: nextStep.stepNumber,
    offsetDays: nextStep.offsetDays,
    template: nextStep.template,
    channel: nextStep.channel,
  };
}
