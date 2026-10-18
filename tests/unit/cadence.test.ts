import { describe, it, expect } from "vitest";
import { evaluateCadenceStep, type CadenceConfig, type DraftState } from "@/lib/outreach/cadence";

const NOW = "2026-10-18T10:00:00.000Z";

function daysAgo(n: number): string {
  return new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();
}

const CADENCE: CadenceConfig = {
  id: "cad_1",
  name: "Standard 3-step",
  steps: [
    { stepNumber: 1, offsetDays: 3, template: "first_follow_up", channel: "email" },
    { stepNumber: 2, offsetDays: 7, template: "second_follow_up", channel: "email" },
    { stepNumber: 3, offsetDays: 14, template: "last_follow_up", channel: "email" },
  ],
};

describe("evaluateCadenceStep", () => {
  it("returns null when lead has replied", () => {
    const state: DraftState = {
      cadenceStep: 0,
      contactedAt: daysAgo(5),
      hasReply: true,
    };
    expect(evaluateCadenceStep(CADENCE, state, NOW)).toBeNull();
  });

  it("returns null when all steps exhausted", () => {
    const state: DraftState = {
      cadenceStep: 3, // beyond last step
      contactedAt: daysAgo(20),
      hasReply: false,
    };
    expect(evaluateCadenceStep(CADENCE, state, NOW)).toBeNull();
  });

  it("returns null when offset not elapsed yet", () => {
    const state: DraftState = {
      cadenceStep: 0,
      contactedAt: daysAgo(2), // step 1 requires 3 days
      hasReply: false,
    };
    expect(evaluateCadenceStep(CADENCE, state, NOW)).toBeNull();
  });

  it("returns step 1 when offset has elapsed", () => {
    const state: DraftState = {
      cadenceStep: 0,
      contactedAt: daysAgo(4), // 4 days > 3 day offset
      hasReply: false,
    };
    const result = evaluateCadenceStep(CADENCE, state, NOW);
    expect(result).not.toBeNull();
    expect(result!.stepNumber).toBe(1);
    expect(result!.channel).toBe("email");
    expect(result!.template).toBe("first_follow_up");
  });

  it("returns step 2 when cadenceStep is 1 and offset elapsed", () => {
    const state: DraftState = {
      cadenceStep: 1,
      contactedAt: daysAgo(8), // 8 days > 7 day offset
      hasReply: false,
    };
    const result = evaluateCadenceStep(CADENCE, state, NOW);
    expect(result).not.toBeNull();
    expect(result!.stepNumber).toBe(2);
  });

  it("returns null when cadenceStep is 1 but offset not elapsed", () => {
    const state: DraftState = {
      cadenceStep: 1,
      contactedAt: daysAgo(5), // 5 days < 7 day offset
      hasReply: false,
    };
    expect(evaluateCadenceStep(CADENCE, state, NOW)).toBeNull();
  });

  it("returns null when cadence has no steps", () => {
    const empty: CadenceConfig = { id: "c2", name: "Empty", steps: [] };
    const state: DraftState = { cadenceStep: 0, contactedAt: daysAgo(10), hasReply: false };
    expect(evaluateCadenceStep(empty, state, NOW)).toBeNull();
  });

  it("returns null on invalid contactedAt", () => {
    const state: DraftState = { cadenceStep: 0, contactedAt: "not-a-date", hasReply: false };
    expect(evaluateCadenceStep(CADENCE, state, NOW)).toBeNull();
  });
});
