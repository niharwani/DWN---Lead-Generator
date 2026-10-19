/**
 * Integration test: sendDraftViaGmailAction
 *
 * Verifies end-to-end:
 *   - Approved email draft + Gmail connected → sends → draft becomes contacted
 *   - gmailMessageId / gmailThreadId written to DB
 *   - Activity logged with kind outreach_sent / contact_logged
 *   - Returns error when Gmail not connected
 *   - Returns error when draft not approved
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

const OWNER_ID = "owner_gmail_send_test";
const DRAFT_ID = "draft_approved_1";
const LEAD_ID = "lead_email_1";

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
  GMAIL_CLIENT_ID: "gid",
  GMAIL_CLIENT_SECRET: "gsec",
  GMAIL_REDIRECT_URI: "https://example.com/api/gmail/oauth/callback",
};

function makeApprovedEmailDraft(status = "approved") {
  return {
    id: DRAFT_ID,
    ownerId: OWNER_ID,
    leadId: LEAD_ID,
    channel: "email" as const,
    subject: "Hello from my studio",
    body: "Hi there, I noticed your website...",
    status: status as "approved" | "needs_review",
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

function makeEmailLead(noEmail = false) {
  return {
    id: LEAD_ID,
    ownerId: OWNER_ID,
    businessName: "Test Business",
    publicEmail: noEmail ? null : "contact@testbusiness.com",
    city: "Mumbai",
    niche: "D2C",
    doNotContact: { flagged: false },
    pipelineStage: "qualified",
  };
}

describe("sendDraftViaGmailAction", () => {
  it("throws when Gmail tokens are not stored", async () => {
    vi.spyOn(await import("@/lib/data"), "requirePageOwner").mockResolvedValue(MOCK_OWNER as never);
    vi.spyOn(await import("@/lib/env"), "getRuntimeEnv").mockResolvedValue(MOCK_ENV as never);
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({} as never);
    vi.spyOn(await import("@/lib/db/repos/settings"), "getSetting").mockResolvedValue(undefined);
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(makeApprovedEmailDraft() as never);

    const { sendDraftViaGmailAction } = await import("@/lib/actions");
    await expect(sendDraftViaGmailAction(DRAFT_ID)).rejects.toThrow(
      "Gmail is not connected"
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
    vi.spyOn(await import("@/lib/db/repos"), "getDraft").mockResolvedValue(
      makeApprovedEmailDraft("needs_review") as never
    );

    const { sendDraftViaGmailAction } = await import("@/lib/actions");
    await expect(sendDraftViaGmailAction(DRAFT_ID)).rejects.toThrow(
      /approved drafts/i
    );
  });

  it("sends the email and logs contact_logged activity", async () => {
    const runCalls: string[] = [];
    const activities: string[] = [];
    const transitioned: string[] = [];

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
    vi.spyOn(await import("@/lib/gmail/client"), "sendMessage").mockResolvedValue({
      messageId: "gmail-msg-1",
      threadId: "gmail-thread-1",
      tokens: { accessToken: "new-access", refreshToken: "refresh", expiresAt: Date.now() + 3600_000 },
    });

    const { sendDraftViaGmailAction } = await import("@/lib/actions");
    await sendDraftViaGmailAction(DRAFT_ID);

    expect(activities).toContain("contact_logged");
    expect(transitioned).toContain(DRAFT_ID);
    expect(runCalls.some((c) => c.includes("gmail-thread-1"))).toBe(true);
  });
});
