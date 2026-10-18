import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Audit log writer tests.
 *
 * The DB is mocked because the writer uses `getDb()` from the Cloudflare
 * binding layer. We focus on:
 *   1. Fail-silent behavior — a DB error must NOT throw to the caller.
 *   2. The record format — correct fields are passed to the insert.
 */

// Mock getDb so we can inject a controllable db stub
vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/lib/db/client";
import { recordAuditLog } from "@/lib/audit-log/writer";

type InsertValues = {
  id: string;
  workspaceId: string;
  actorProfileId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

function makeMockDb(insertImpl?: (values: InsertValues) => void) {
  const capturedValues: InsertValues[] = [];

  const valuesChain = {
    values: (v: InsertValues) => {
      capturedValues.push(v);
      if (insertImpl) insertImpl(v);
      return Promise.resolve();
    },
  };

  const db = {
    insert: () => valuesChain,
    _captured: capturedValues,
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAuditLog", () => {
  it("does NOT throw when the DB insert fails", async () => {
    const mockDb = {
      insert: () => ({
        values: () => Promise.reject(new Error("D1 is down")),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    // Should resolve without throwing
    await expect(
      recordAuditLog("ws-1", "profile-1", "created", "lead", "lead-abc")
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when getDb itself rejects", async () => {
    vi.mocked(getDb).mockRejectedValue(new Error("Cannot connect to D1"));

    await expect(
      recordAuditLog("ws-1", "profile-1", "updated", "draft", "draft-xyz")
    ).resolves.toBeUndefined();
  });

  it("writes the correct workspaceId and actorProfileId", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await recordAuditLog("workspace-123", "actor-456", "deleted", "task", "task-789");

    expect(captured).toHaveLength(1);
    expect(captured[0]?.workspaceId).toBe("workspace-123");
    expect(captured[0]?.actorProfileId).toBe("actor-456");
  });

  it("writes the correct action and entityType", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await recordAuditLog("ws", "p", "approved", "draft", "d1");

    expect(captured[0]?.action).toBe("approved");
    expect(captured[0]?.entityType).toBe("draft");
    expect(captured[0]?.entityId).toBe("d1");
  });

  it("stores metadata correctly", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    const meta = { role: "admin", email: "user@test.com" };
    await recordAuditLog("ws", "p", "invited", "member", "m1", meta);

    expect(captured[0]?.metadata).toEqual(meta);
  });

  it("sets metadata to null when not provided", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await recordAuditLog("ws", "p", "login", "session");

    expect(captured[0]?.metadata).toBeNull();
  });

  it("sets actorProfileId to null when passed null", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await recordAuditLog("ws", null, "created", "lead");

    expect(captured[0]?.actorProfileId).toBeNull();
  });

  it("generates a unique id for each record", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await recordAuditLog("ws", "p", "created", "lead", "l1");
    await recordAuditLog("ws", "p", "updated", "lead", "l1");

    expect(captured).toHaveLength(2);
    expect(captured[0]?.id).toBeTruthy();
    expect(captured[1]?.id).toBeTruthy();
    expect(captured[0]?.id).not.toBe(captured[1]?.id);
  });

  it("sets createdAt to a valid ISO timestamp", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await recordAuditLog("ws", "p", "exported", "lead");

    const ts = captured[0]?.createdAt;
    expect(ts).toBeTruthy();
    expect(new Date(ts as string).toString()).not.toBe("Invalid Date");
  });

  it("passes ip address and user agent when provided", async () => {
    const captured: InsertValues[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: InsertValues) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await recordAuditLog("ws", "p", "login", "session", "s1", null, "1.2.3.4", "Mozilla/5.0");

    expect(captured[0]?.ipAddress).toBe("1.2.3.4");
    expect(captured[0]?.userAgent).toBe("Mozilla/5.0");
  });
});
