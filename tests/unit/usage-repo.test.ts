/**
 * Tests for the usage repo: monthly period format, helper functions.
 *
 * D1 CRUD is covered by the billing integration test. These tests verify the
 * pure utility functions (period format, column mapping) independently.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { currentPeriod } from "@/lib/db/repos/usage";

// ---------------------------------------------------------------------------
// currentPeriod() — period format tests
// ---------------------------------------------------------------------------

describe("currentPeriod", () => {
  it("returns a string in YYYYMM format", () => {
    const period = currentPeriod();
    expect(/^\d{6}$/.test(period)).toBe(true);
  });

  it("matches the UTC year and month", () => {
    const now = new Date();
    const year = now.getUTCFullYear().toString();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    expect(currentPeriod()).toBe(`${year}${month}`);
  });

  it("produces '202601' for January 2026 UTC", () => {
    // Stub Date to return a fixed time in January 2026 UTC
    const realDate = globalThis.Date;
    const FixedDate = class extends realDate {
      constructor() {
        super("2026-01-15T10:00:00.000Z");
      }
    } as typeof Date;
    // Temporarily replace Date for a synchronous call
    (globalThis as Record<string, unknown>).Date = FixedDate;
    try {
      const period = currentPeriod();
      expect(period).toBe("202601");
    } finally {
      (globalThis as Record<string, unknown>).Date = realDate;
    }
  });

  it("produces '202612' for December 2026 UTC", () => {
    const realDate = globalThis.Date;
    const FixedDate = class extends realDate {
      constructor() {
        super("2026-12-31T23:59:59.000Z");
      }
    } as typeof Date;
    (globalThis as Record<string, unknown>).Date = FixedDate;
    try {
      expect(currentPeriod()).toBe("202612");
    } finally {
      (globalThis as Record<string, unknown>).Date = realDate;
    }
  });

  it("pads single-digit months with a leading zero", () => {
    const realDate = globalThis.Date;
    const FixedDate = class extends realDate {
      constructor() {
        super("2026-03-01T00:00:00.000Z");
      }
    } as typeof Date;
    (globalThis as Record<string, unknown>).Date = FixedDate;
    try {
      const period = currentPeriod();
      expect(period).toBe("202603");
    } finally {
      (globalThis as Record<string, unknown>).Date = realDate;
    }
  });
});

// ---------------------------------------------------------------------------
// incrementUsage — mocked DB coalescing tests
// ---------------------------------------------------------------------------

describe("incrementUsage (mocked DB)", () => {
  it("calls onConflictDoUpdate so concurrent increments coalesce", async () => {
    // We test this by verifying the insert call includes onConflictDoUpdate.
    // The actual SQL is tested via D1 in integration tests.
    // Here we verify the repo uses the right upsert pattern by mocking Drizzle.

    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const mockDb = {
      insert: vi.fn().mockReturnValue(mockInsert),
    };

    // Dynamically import to pick up module
    const { incrementUsage } = await import("@/lib/db/repos/usage");
    await incrementUsage(mockDb as unknown as Parameters<typeof incrementUsage>[0], "ws_1", "audits", 3);

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockInsert.values).toHaveBeenCalledTimes(1);
    // onConflictDoUpdate is called which means the upsert pattern is used
    expect(mockInsert.onConflictDoUpdate).toHaveBeenCalledTimes(1);

    // Verify the insert values include the expected resource column set to 3
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const insertCall = mockInsert.values.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertCall.auditsUsed).toBe(3);
    expect(insertCall.aiDraftsUsed).toBe(0);
    expect(insertCall.workspaceId).toBe("ws_1");
  });

  it("sets the correct period via currentPeriod()", async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const mockDb = { insert: vi.fn().mockReturnValue(mockInsert) };

    const { incrementUsage, currentPeriod } = await import("@/lib/db/repos/usage");
    await incrementUsage(
      mockDb as unknown as Parameters<typeof incrementUsage>[0],
      "ws_x",
      "ai_drafts",
      1
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const insertCall = mockInsert.values.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertCall.periodYyyyMm).toBe(currentPeriod());
  });
});
