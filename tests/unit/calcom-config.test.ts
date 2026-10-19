/**
 * Unit tests for the Cal.com calendar config helpers.
 *
 * Verifies:
 *   - getCalendarConfig returns undefined when nothing is stored
 *   - setCalendarConfig + getCalendarConfig round-trip correctly
 *   - setCalendarConfig throws on invalid URL
 *   - buildBookingLinkSnippet includes the URL and duration
 */

import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

// Minimal in-memory mock for the DB
function makeDb(stored: Record<string, unknown> = {}) {
  const store = { ...stored };
  return {
    select: () => ({
      from: () => {
        const p = Promise.resolve([]);
        return Object.assign(p, {
          where: () => {
            const row = store["calendar/v1"];
            const q = Promise.resolve(
              row !== undefined ? [{ value: row }] : []
            );
            return Object.assign(q, { limit: (n: number) => Promise.resolve(row !== undefined ? [{ value: row }] : []).then((r) => r.slice(0, n)) });
          },
        });
      },
    }),
    insert: () => ({
      values: (vals: { id: string; ownerId: string; key: string; value: unknown }) => {
        store[vals.key] = vals.value;
        return { onConflictDoUpdate: () => Promise.resolve() };
      },
    }),
  };
}

describe("getCalendarConfig", () => {
  it("returns undefined when no config stored", async () => {
    const { getCalendarConfig } = await import("@/lib/calendar/calcom");
    const db = makeDb();
    const result = await getCalendarConfig(db as never, "owner-1");
    expect(result).toBeUndefined();
  });

  it("returns parsed config when stored", async () => {
    const { getCalendarConfig } = await import("@/lib/calendar/calcom");
    const db = makeDb({
      "calendar/v1": { calcomUrl: "https://cal.com/nihar/30min", defaultDuration: 30 },
    });
    const result = await getCalendarConfig(db as never, "owner-1");
    expect(result).not.toBeUndefined();
    expect(result!.calcomUrl).toBe("https://cal.com/nihar/30min");
    expect(result!.defaultDuration).toBe(30);
  });
});

describe("setCalendarConfig", () => {
  it("throws on invalid URL", async () => {
    const { setCalendarConfig } = await import("@/lib/calendar/calcom");
    const db = makeDb();
    await expect(
      setCalendarConfig(db as never, "owner-1", {
        calcomUrl: "not-a-url",
        defaultDuration: 30,
      })
    ).rejects.toThrow();
  });

  it("accepts a valid Cal.com URL", async () => {
    const { setCalendarConfig } = await import("@/lib/calendar/calcom");
    const db = makeDb();
    const config = await setCalendarConfig(db as never, "owner-1", {
      calcomUrl: "https://cal.com/jane/45min",
      defaultDuration: 45,
    });
    expect(config.calcomUrl).toBe("https://cal.com/jane/45min");
    expect(config.defaultDuration).toBe(45);
  });

  it("defaults duration to 30 when not supplied", async () => {
    const { setCalendarConfig } = await import("@/lib/calendar/calcom");
    const db = makeDb();
    const config = await setCalendarConfig(db as never, "owner-1", {
      calcomUrl: "https://cal.com/jane/meeting",
    });
    expect(config.defaultDuration).toBe(30);
  });
});

describe("buildBookingLinkSnippet", () => {
  it("contains the Cal.com URL", async () => {
    const { buildBookingLinkSnippet } = await import("@/lib/calendar/calcom");
    const snippet = buildBookingLinkSnippet({
      calcomUrl: "https://cal.com/nihar/30min",
      defaultDuration: 30,
    });
    expect(snippet).toContain("https://cal.com/nihar/30min");
    expect(snippet).toContain("30-minute");
  });

  it("reflects the configured duration", async () => {
    const { buildBookingLinkSnippet } = await import("@/lib/calendar/calcom");
    const snippet = buildBookingLinkSnippet({
      calcomUrl: "https://cal.com/nihar/60min",
      defaultDuration: 60,
    });
    expect(snippet).toContain("60-minute");
  });
});
