/**
 * Integration test: markDraftSentManuallyAction
 *
 * Verifies:
 *   - Approved email draft → transitions to "contacted" + logs activity
 *   - Bumps lead pipelineStage to "contacted" and lastContactedAt
 *   - Throws when draft status is not approved
 *   - Throws when draft channel is not email
 *   - Throws when lead is marked do-not-contact
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// next/cache is not available in the vitest node environment
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const OWNER_ID = "owner_manual_send_test";
const DRAFT_ID = "draft_approved_email_1";
const LEAD_ID = "lead_email_manual_1";

const MOCK_OWNER = {
  id: OWNER_ID,
  email: "owner@example.com",
  fullName: "Owner",
  profileId: OWNER_ID,
  role: "owner" as const,
  workspace: { id: OWNER_ID, name: "Test", slug: "test", plan: "studio" as const },
  isDemo: false,
};

function makeApprovedEmailDraft(overrides: { status?: string; channel?: string } = {}) {
  return {
    id: DRAFT_ID,
    ownerId: OWNER_ID,
    leadId: LEAD_ID,
    channel: overrides.channel ?? "email",
    subject: "Hello from my studio",
    body: "Hi there, I noticed your website...",
    status: overrides.status ?? "approved",
    personalizationEvidence: [],
    source: "template",
    needsHumanReview: false,
    variantGroup: null,
    variantLabel: null,
    replySentiment: null,
    approvedAt: "2026-10-17T10:00:00Z",
    contactedAt: null,
    repliedAt: null,
    createdAt: "2026-10-16T10:00:00Z",
    updatedAt: "2026-10-17T10:00:00Z",
    campaignId: null,
  };
}

function makeLead(overrides: { doNotContact?: boolean } = {}) {
  return {
    id: LEAD_ID,
    ownerId: OWNER_ID,
    businessName: "Test Business",
    publicEmail: "contact@testbusiness.com",
    city: "Mumbai",
    niche: "D2C",
    doNotContact: { flagged: overrides.doNotContact ?? false },
    pipelineStage: "qualified",
  };
}

describe("markDraftSentManuallyAction", () => {
  it("transitions draft to contacted and logs outreach_sent_manual activity", async () => {
    const activities: string[] = [];
    const transitioned: string[] = [];
    const leadUpdates: unknown[] = [];

    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(
      MOCK_OWNER as never
    );
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(
      makeApprovedEmailDraft() as never
    );
    vi.spyOn(await import("@/lib/db/repos"), "getLead").mockResolvedValue(
      makeLead() as never
    );
    vi.spyOn(await import("@/lib/db/repos"), "transitionDraft").mockImplementation(
      async (_, __, id: string) => {
        transitioned.push(id);
        return makeApprovedEmailDraft() as never;
      }
    );
    vi.spyOn(await import("@/lib/db/repos"), "updateLead").mockImplementation(
      async (_, __, id: string, updates: unknown) => {
        leadUpdates.push({ id, updates });
        return makeLead() as never;
      }
    );
    vi.spyOn(await import("@/lib/db/repos"), "createActivity").mockImplementation(
      async (_, __, args: unknown) => {
        activities.push((args as { activityType: string }).activityType);
        return {} as never;
      }
    );

    const { markDraftSentManuallyAction } = await import("@/lib/actions");
    await markDraftSentManuallyAction(DRAFT_ID);

    expect(transitioned).toContain(DRAFT_ID);
    expect(activities).toContain("outreach_sent_manual");
    expect(leadUpdates.length).toBeGreaterThan(0);
    const upd = leadUpdates[0] as { id: string; updates: Record<string, unknown> };
    expect(upd.updates.pipelineStage).toBe("contacted");
    expect(upd.updates.lastContactedAt).toBeTruthy();
  });

  it("accepts a FormData argument with draftId field", async () => {
    const transitioned: string[] = [];

    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(
      MOCK_OWNER as never
    );
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(
      makeApprovedEmailDraft() as never
    );
    vi.spyOn(await import("@/lib/db/repos"), "getLead").mockResolvedValue(
      makeLead() as never
    );
    vi.spyOn(await import("@/lib/db/repos"), "transitionDraft").mockImplementation(
      async (_, __, id: string) => {
        transitioned.push(id);
        return makeApprovedEmailDraft() as never;
      }
    );
    vi.spyOn(await import("@/lib/db/repos"), "updateLead").mockResolvedValue(
      makeLead() as never
    );
    vi.spyOn(await import("@/lib/db/repos"), "createActivity").mockResolvedValue({} as never);

    const fd = new FormData();
    fd.set("draftId", DRAFT_ID);

    const { markDraftSentManuallyAction } = await import("@/lib/actions");
    await markDraftSentManuallyAction(fd);

    expect(transitioned).toContain(DRAFT_ID);
  });

  it("throws when draft status is not approved", async () => {
    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(
      MOCK_OWNER as never
    );
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(
      makeApprovedEmailDraft({ status: "needs_review" }) as never
    );

    const { markDraftSentManuallyAction } = await import("@/lib/actions");
    await expect(markDraftSentManuallyAction(DRAFT_ID)).rejects.toThrow(
      /approved drafts/i
    );
  });

  it("throws when draft channel is not email", async () => {
    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(
      MOCK_OWNER as never
    );
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(
      makeApprovedEmailDraft({ channel: "linkedin" }) as never
    );

    const { markDraftSentManuallyAction } = await import("@/lib/actions");
    await expect(markDraftSentManuallyAction(DRAFT_ID)).rejects.toThrow(
      /email channel/i
    );
  });

  it("throws when lead is marked do-not-contact", async () => {
    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(
      MOCK_OWNER as never
    );
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(
      makeApprovedEmailDraft() as never
    );
    vi.spyOn(await import("@/lib/db/repos"), "getLead").mockResolvedValue(
      makeLead({ doNotContact: true }) as never
    );

    const { markDraftSentManuallyAction } = await import("@/lib/actions");
    await expect(markDraftSentManuallyAction(DRAFT_ID)).rejects.toThrow(
      /do-not-contact/i
    );
  });

  it("throws when draftId is empty string", async () => {
    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(
      MOCK_OWNER as never
    );
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);

    const { markDraftSentManuallyAction } = await import("@/lib/actions");
    await expect(markDraftSentManuallyAction("")).rejects.toThrow("draftId is required");
  });
});
