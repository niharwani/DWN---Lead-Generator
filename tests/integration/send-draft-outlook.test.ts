/**
 * Integration test: sendDraftViaOutlookAction
 *
 * Mirrors the Gmail integration test but for the Outlook provider.
 * Verifies that conversationId is stored in the same gmail_thread_id column.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// next/cache is not available in the vitest node environment — stub it out so
// that the revalidateAll() helper inside actions.ts doesn't throw.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const OWNER_ID = "owner_outlook_send_test";
const DRAFT_ID = "draft_outlook_approved_1";
const LEAD_ID = "lead_outlook_1";

const MOCK_OWNER = {
  id: OWNER_ID,
  email: "owner@example.com",
  fullName: "Owner",
  profileId: OWNER_ID,
  role: "owner" as const,
  workspace: { id: OWNER_ID, name: "Test", slug: "test", plan: "studio" as const },
  isDemo: false,
};

const MOCK_ENV = {
  OUTLOOK_CLIENT_ID: "oid",
  OUTLOOK_CLIENT_SECRET: "osec",
  OUTLOOK_REDIRECT_URI: "https://example.com/api/outlook/oauth/callback",
};

function makeApprovedEmailDraft() {
  return {
    id: DRAFT_ID,
    ownerId: OWNER_ID,
    leadId: LEAD_ID,
    channel: "email" as const,
    subject: "Hello from Outlook",
    body: "Hi there...",
    status: "approved" as const,
    personalizationEvidence: [],
    source: "template" as const,
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

function makeEmailLead() {
  return {
    id: LEAD_ID,
    ownerId: OWNER_ID,
    businessName: "Test Business",
    publicEmail: "contact@testbusiness.com",
    city: "Delhi",
    niche: "SaaS",
    doNotContact: { flagged: false },
    pipelineStage: "qualified",
  };
}

describe("sendDraftViaOutlookAction", () => {
  it("throws when Outlook tokens are not stored", async () => {
    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(MOCK_OWNER as never);
    vi.spyOn(await import("@/lib/env"), "getRuntimeEnv").mockResolvedValue(MOCK_ENV as never);
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos/settings"), "getSetting").mockResolvedValue(undefined);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(makeApprovedEmailDraft() as never);

    const { sendDraftViaOutlookAction } = await import("@/lib/actions");
    await expect(sendDraftViaOutlookAction(DRAFT_ID)).rejects.toThrow(
      "Outlook is not connected"
    );
  });

  it("throws when draft status is not approved", async () => {
    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(MOCK_OWNER as never);
    vi.spyOn(await import("@/lib/env"), "getRuntimeEnv").mockResolvedValue(MOCK_ENV as never);
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos/settings"), "getSetting").mockResolvedValue({
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600_000,
    });
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue({
      ...makeApprovedEmailDraft(),
      status: "needs_review" as never,
    } as never);

    const { sendDraftViaOutlookAction } = await import("@/lib/actions");
    await expect(sendDraftViaOutlookAction(DRAFT_ID)).rejects.toThrow(
      /approved drafts/i
    );
  });

  it("sends via Outlook and stores conversationId in gmail_thread_id column", async () => {
    const runCalls: string[] = [];
    const transitioned: string[] = [];
    const activities: string[] = [];

    const mockDb = {
      run: (q: unknown) => { runCalls.push(JSON.stringify(q)); return Promise.resolve(); },
    };

    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(MOCK_OWNER as never);
    vi.spyOn(await import("@/lib/env"), "getRuntimeEnv").mockResolvedValue(MOCK_ENV as never);
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue(mockDb as never);
    vi.spyOn(await import("@/lib/db/repos/settings"), "getSetting").mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600_000,
    });
    vi.spyOn(await import("@/lib/db/repos/settings"), "setSetting").mockResolvedValue(undefined);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(makeApprovedEmailDraft() as never);
    vi.spyOn(await import("@/lib/db/repos"), "getLead").mockResolvedValue(makeEmailLead() as never);
    vi.spyOn(await import("@/lib/db/repos"), "createActivity").mockImplementation(
      async (_, __, args: unknown) => {
        activities.push((args as { activityType: string }).activityType);
        return {} as never;
      }
    );
    vi.spyOn(await import("@/lib/db/repos"), "transitionDraft").mockImplementation(
      async (_, __, id: string) => {
        transitioned.push(id);
        return makeApprovedEmailDraft() as never;
      }
    );
    vi.spyOn(await import("@/lib/db/repos"), "updateLead").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/outlook/client"), "sendMessage").mockResolvedValue({
      messageId: "outlook-msg-1",
      threadId: "outlook-conv-1",
      tokens: { accessToken: "new-access", refreshToken: "refresh", expiresAt: Date.now() + 3600_000 },
    });

    const { sendDraftViaOutlookAction } = await import("@/lib/actions");
    await sendDraftViaOutlookAction(DRAFT_ID);

    expect(activities).toContain("contact_logged");
    expect(transitioned).toContain(DRAFT_ID);
    // conversationId stored in gmail_thread_id column via raw SQL
    expect(runCalls.some((c) => c.includes("outlook-conv-1"))).toBe(true);
  });
});
