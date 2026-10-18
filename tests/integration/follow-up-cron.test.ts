/**
 * Integration test: follow-up cadence runner creates next-step drafts.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { evaluateCadenceStep, type CadenceConfig, type DraftState } from "@/lib/outreach/cadence";
import { generateFollowUpDraft } from "@/lib/outreach/follow-up";
import type { BuildDraftInput } from "@/lib/outreach/draft";

afterEach(() => {
  vi.restoreAllMocks();
});

const MOCK_LEAD = {
  id: "lead_1",
  businessName: "Acme Corp",
  normalizedName: "acme corp",
  category: "",
  niche: "SaaS",
  city: "Mumbai",
  country: "India",
  sourceName: "manual",
  websiteCondition: "weak" as const,
  pipelineStage: "contacted" as const,
  evidenceConfidence: "insufficient" as const,
  doNotContact: { flagged: false },
  tags: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  currency: "INR",
};

const CADENCE: CadenceConfig = {
  id: "cad_1",
  name: "Test Cadence",
  steps: [
    { stepNumber: 1, offsetDays: 3, template: "first_follow_up", channel: "email" },
    { stepNumber: 2, offsetDays: 7, template: "second_follow_up", channel: "email" },
  ],
};

describe("runFollowUpCadences (integration — pure logic)", () => {
  it("evaluates cadence and generates follow-up when step is due", async () => {
    const contactedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const state: DraftState = { cadenceStep: 0, contactedAt, hasReply: false };
    const nowIso = new Date().toISOString();

    const nextStep = evaluateCadenceStep(CADENCE, state, nowIso);
    expect(nextStep).not.toBeNull();
    expect(nextStep!.stepNumber).toBe(1);

    const draftInput: BuildDraftInput = {
      lead: MOCK_LEAD as BuildDraftInput["lead"],
      services: [],
      channel: "email",
    };

    const result = await generateFollowUpDraft({
      draftInput,
      cadenceStep: nextStep!,
      parentDraftId: "parent_draft_1",
      parentGmailThreadId: "thread_xyz",
      env: {},
    });

    expect(result.cadenceStep).toBe(1);
    expect(result.parentDraftId).toBe("parent_draft_1");
    expect(result.gmailThreadId).toBe("thread_xyz");
    expect(result.body.length).toBeGreaterThan(0);
    expect(result.source).toBe("template");
  });

  it("creates draft with correct cadenceStep = parent.cadenceStep + 1", async () => {
    const contactedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const state: DraftState = { cadenceStep: 1, contactedAt, hasReply: false };
    const nowIso = new Date().toISOString();

    const nextStep = evaluateCadenceStep(CADENCE, state, nowIso);
    expect(nextStep).not.toBeNull();
    expect(nextStep!.stepNumber).toBe(2); // cadenceStep was 1, next is step at index 1 = stepNumber 2

    const draftInput: BuildDraftInput = {
      lead: MOCK_LEAD as BuildDraftInput["lead"],
      services: [],
    };

    const result = await generateFollowUpDraft({
      draftInput,
      cadenceStep: nextStep!,
      parentDraftId: "parent_draft_2",
      env: {},
    });

    // cadenceStep = stepNumber = 2 (which is parent's step 1 + 1)
    expect(result.cadenceStep).toBe(2);
  });

  it("does not create follow-up when cadence is exhausted", () => {
    const contactedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const state: DraftState = { cadenceStep: 2, contactedAt, hasReply: false }; // beyond last step
    const nowIso = new Date().toISOString();

    const nextStep = evaluateCadenceStep(CADENCE, state, nowIso);
    expect(nextStep).toBeNull();
  });

  it("stops cadence on reply", () => {
    const contactedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const state: DraftState = { cadenceStep: 0, contactedAt, hasReply: true };
    const nowIso = new Date().toISOString();

    const nextStep = evaluateCadenceStep(CADENCE, state, nowIso);
    expect(nextStep).toBeNull();
  });
});
