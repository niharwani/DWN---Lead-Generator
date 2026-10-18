import { describe, it, expect, vi, afterEach } from "vitest";
import { generateFollowUpDraft } from "@/lib/outreach/follow-up";
import type { BuildDraftInput } from "@/lib/outreach/draft";
import type { CadenceStep } from "@/lib/outreach/cadence";

afterEach(() => {
  vi.restoreAllMocks();
});

const MOCK_LEAD = {
  id: "lead_1",
  businessName: "Acme",
  normalizedName: "acme",
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
  updatedAt: "2026-10-10T00:00:00.000Z",
  currency: "INR",
};

const DRAFT_INPUT: BuildDraftInput = {
  lead: MOCK_LEAD as BuildDraftInput["lead"],
  services: [],
  channel: "email",
};

const CADENCE_STEP: CadenceStep = {
  stepNumber: 2,
  offsetDays: 7,
  template: "second_follow_up",
  channel: "email",
};

describe("generateFollowUpDraft", () => {
  it("inherits the parent gmailThreadId", async () => {
    const result = await generateFollowUpDraft({
      draftInput: DRAFT_INPUT,
      cadenceStep: CADENCE_STEP,
      parentDraftId: "draft_parent_1",
      parentGmailThreadId: "thread_abc123",
      env: {},
    });
    expect(result.gmailThreadId).toBe("thread_abc123");
  });

  it("sets cadenceStep to stepNumber", async () => {
    const result = await generateFollowUpDraft({
      draftInput: DRAFT_INPUT,
      cadenceStep: CADENCE_STEP,
      parentDraftId: "draft_parent_1",
      env: {},
    });
    expect(result.cadenceStep).toBe(2);
  });

  it("sets parentDraftId correctly", async () => {
    const result = await generateFollowUpDraft({
      draftInput: DRAFT_INPUT,
      cadenceStep: CADENCE_STEP,
      parentDraftId: "draft_parent_99",
      env: {},
    });
    expect(result.parentDraftId).toBe("draft_parent_99");
  });

  it("uses template fallback when no API key", async () => {
    const result = await generateFollowUpDraft({
      draftInput: DRAFT_INPUT,
      cadenceStep: CADENCE_STEP,
      parentDraftId: "d1",
      env: {},
    });
    expect(result.source).toBe("template");
    expect(result.body.length).toBeGreaterThan(0);
  });

  it("falls back to template when AI call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const result = await generateFollowUpDraft({
      draftInput: DRAFT_INPUT,
      cadenceStep: CADENCE_STEP,
      parentDraftId: "d1",
      env: { ANTHROPIC_API_KEY: "test-key" },
    });
    expect(result.source).toBe("template");
    expect(result.gmailThreadId).toBeUndefined();
  });

  it("inherits undefined gmailThreadId when parent has none", async () => {
    const result = await generateFollowUpDraft({
      draftInput: DRAFT_INPUT,
      cadenceStep: CADENCE_STEP,
      parentDraftId: "d1",
      // No parentGmailThreadId
      env: {},
    });
    expect(result.gmailThreadId).toBeUndefined();
  });
});
