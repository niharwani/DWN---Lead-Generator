/**
 * Integration test: Outlook replies cron (runOutlookReplySweep)
 *
 * Verifies:
 *   - Returns zero processed when no Outlook tokens
 *   - Matches reply by conversationId against draft's gmail_thread_id column
 *   - Updates replied_at when match found
 *   - Logs activity with provider: "outlook"
 *   - Handles Outlook list failure gracefully
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { runOutlookReplySweep } from "@/lib/cron/outlook-replies";
import type { Db } from "@/lib/db/client";

afterEach(() => {
  vi.restoreAllMocks();
});

const OWNER = "owner_outlook_replies_test";
const CONV_ID = "conv-abc-123";
const DRAFT_ID = "draft_contacted_outlook_1";

function makeDraftRow() {
  return {
    id: DRAFT_ID,
    ownerId: OWNER,
    leadId: "lead_outlook_reply_1",
    campaignId: null,
    channel: "email",
    subject: "Hello",
    body: "Body",
    personalizationEvidence: [],
    status: "contacted",
    source: "template",
    needsHumanReview: true,
    variantGroup: null,
    variantLabel: null,
    replySentiment: null,
    approvedAt: null,
    contactedAt: "2026-10-15T10:00:00Z",
    repliedAt: null,
    createdAt: "2026-10-14T10:00:00Z",
    updatedAt: "2026-10-15T10:00:00Z",
    // Phase A migration column — stored in raw row
    gmailThreadId: CONV_ID,
  };
}

function makeDb(draftRows: ReturnType<typeof makeDraftRow>[], runCalls: string[]) {
  return {
    select: () => ({
      from: () => {
        const p = Promise.resolve([]);
        return Object.assign(p, {
          where: () => {
            const q = Promise.resolve(draftRows);
            return Object.assign(q, {
              limit: () =>
                Promise.resolve([
                  {
                    value: {
                      accessToken: "access",
                      refreshToken: "refresh",
                      expiresAt: Date.now() + 3600_000,
                    },
                  },
                ]),
            });
          },
        });
      },
    }),
    run: (q: unknown) => {
      runCalls.push(JSON.stringify(q));
      return Promise.resolve();
    },
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  } as unknown as Db;
}

describe("runOutlookReplySweep", () => {
  it("returns zero processed when no Outlook tokens", async () => {
    const db: Db = {
      select: () => ({
        from: () => {
          const p = Promise.resolve([]);
          return Object.assign(p, {
            where: () => {
              const q = Promise.resolve([]);
              return Object.assign(q, { limit: () => Promise.resolve([]) });
            },
          });
        },
      }),
    } as unknown as Db;

    const result = await runOutlookReplySweep(db, OWNER, {});
    expect(result.processed).toBe(0);
    expect(result.matched).toHaveLength(0);
  });

  it("matches reply by conversationId and stamps replied_at", async () => {
    // Use spyOn so the mock applies to the already-imported module binding
    vi.spyOn(await import("@/lib/outlook/client"), "listUnreadReplies").mockResolvedValue({
      replies: [
        {
          messageId: "msg-out-1",
          threadId: CONV_ID,
          from: "lead@example.com",
          subject: "Re: Hello",
          snippet: "Thanks!",
          receivedAt: "2026-10-18T09:00:00Z",
        },
      ],
      tokens: { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 3600_000 },
    });

    vi.spyOn(await import("@/lib/db/repos/settings"), "setSetting").mockResolvedValue(undefined);

    const activities: Array<{ activityType: string; metadata?: unknown }> = [];
    vi.spyOn(await import("@/lib/db/repos"), "createActivity").mockImplementation(
      async (_, __, args: unknown) => {
        const a = args as { activityType: string; metadata?: unknown };
        activities.push({ activityType: a.activityType, metadata: a.metadata });
        return {} as never;
      }
    );

    const runCalls: string[] = [];
    const db = makeDb([makeDraftRow()], runCalls);

    const result = await runOutlookReplySweep(db, OWNER, {});

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.conversationId).toBe(CONV_ID);
    expect(result.matched[0]!.draftId).toBe(DRAFT_ID);

    // replied_at should have been stamped
    expect(runCalls.some((c) => c.includes("replied_at"))).toBe(true);

    // Activity should have provider: "outlook"
    const activity = activities.find((a) => a.activityType === "reply_logged");
    expect(activity).toBeDefined();
    expect((activity!.metadata as { provider: string }).provider).toBe("outlook");
  });

  it("handles Outlook list failure gracefully", async () => {
    vi.spyOn(await import("@/lib/outlook/client"), "listUnreadReplies").mockRejectedValue(
      new Error("Graph error")
    );

    vi.spyOn(await import("@/lib/db/repos/settings"), "setSetting").mockResolvedValue(undefined);

    const runCalls: string[] = [];
    const db = makeDb([], runCalls);

    const result = await runOutlookReplySweep(db, OWNER, {});
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.matched).toHaveLength(0);
  });
});
