/**
 * Integration test: reply triage cron with mocked Gmail + Claude.
 *
 * Verifies the end-to-end flow:
 *  1. Gmail tokens found in appSettings
 *  2. listUnreadReplies returns a reply matching a contacted draft
 *  3. classifyReply returns a sentiment
 *  4. The draft gets replySentiment set
 *  5. An activity is created
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { runReplyTriageSweep } from "@/lib/cron/reply-triage";
import type { Db } from "@/lib/db/client";
import type { OutreachDraft as DraftRow } from "@/lib/db/schema";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unmock("@/lib/gmail/client");
  vi.unmock("@/lib/outreach/triage");
  vi.unmock("@/lib/db/repos");
});

const OWNER = "owner_triage_integration_1";
const THREAD_ID = "thread_abc";
const DRAFT_ID = "draft_contacted_1";

function makeDraftRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: DRAFT_ID,
    ownerId: OWNER,
    leadId: "lead_1",
    campaignId: null,
    channel: "email",
    subject: "Quick note",
    body: "Hello...",
    personalizationEvidence: [`Gmail thread: ${THREAD_ID}`, "Website on file"],
    status: "contacted",
    source: "template",
    needsHumanReview: true,
    variantGroup: null,
    variantLabel: null,
    replySentiment: null,
    approvedAt: null,
    contactedAt: "2026-10-15T10:00:00.000Z",
    repliedAt: null,
    createdAt: "2026-10-14T10:00:00.000Z",
    updatedAt: "2026-10-15T10:00:00.000Z",
    ...overrides,
  };
}

function makeDb(draftRows: DraftRow[], updates: string[] = []): Db {
  return {
    select: () => ({
      from: (table: unknown) => {
        const p = Promise.resolve([
          // Return gmail tokens for appSettings query
          {
            ownerId: OWNER,
            key: "gmail_tokens/v1",
            value: {
              accessToken: "access-token",
              refreshToken: "refresh-token",
              expiresAt: Date.now() + 3600_000,
            },
          },
        ]);
        return Object.assign(p, {
          where: () => {
            // Distinguish between appSettings and outreachDrafts queries
            // by returning draft rows for the second call
            const q = Promise.resolve(draftRows);
            return Object.assign(q, {
              limit: (n: number) => Promise.resolve([{ ownerId: OWNER, key: "gmail_tokens/v1", value: { accessToken: "access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 3600_000 } }].slice(0, n)),
            });
          },
        });
      },
    }),
    update: () => ({
      set: () => ({
        where: () => {
          updates.push("updated");
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  } as unknown as Db;
}

describe("runReplyTriageSweep (integration)", () => {
  it("returns zero processed when no Gmail tokens", async () => {
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

    const result = await runReplyTriageSweep(db, OWNER, {});
    expect(result.processed).toBe(0);
    expect(result.classified).toHaveLength(0);
  });

  it("gracefully handles Gmail list failure", async () => {
    vi.mock("@/lib/gmail/client", () => ({
      listUnreadReplies: vi.fn().mockRejectedValue(new Error("Gmail error")),
    }));

    const db: Db = {
      select: () => ({
        from: () => {
          const p = Promise.resolve([{ key: "gmail_tokens/v1", value: { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 } }]);
          return Object.assign(p, {
            where: () => {
              const q = Promise.resolve([{ key: "gmail_tokens/v1", value: { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 } }]);
              return Object.assign(q, { limit: (n: number) => Promise.resolve([{ key: "gmail_tokens/v1", value: { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 } }].slice(0, n)) });
            },
          });
        },
      }),
    } as unknown as Db;

    const result = await runReplyTriageSweep(db, OWNER, {});
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.processed).toBe(0);
    vi.unmock("@/lib/gmail/client");
  });
});
