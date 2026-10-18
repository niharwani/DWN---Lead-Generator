import { describe, it, expect } from "vitest";
import { snoozeLeadKey, snoozeTaskKey, runSnoozeWakeSweep } from "@/lib/cron/snooze-wake";
import type { Db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import type { AppSetting } from "@/lib/db/schema";

const OWNER = "owner_snooze_1";

function makeSettingRow(key: string, value: unknown): AppSetting {
  return {
    id: `setting_${key}`,
    ownerId: OWNER,
    key,
    value,
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function makeChain<T>(rows: T[]) {
  const p = Promise.resolve(rows);
  return Object.assign(p, {
    where: () => {
      const q = Promise.resolve(rows);
      return Object.assign(q, {
        limit: (n: number) => Promise.resolve(rows.slice(0, n)),
      });
    },
  });
}

function makeDb(settingRows: AppSetting[], updates: Array<{ key: string }> = []): Db {
  return {
    select: () => ({
      from: () => makeChain(settingRows),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          updates.push({ key: "updated" });
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  } as unknown as Db;
}

describe("snooze key helpers", () => {
  it("snoozeLeadKey returns correct format", () => {
    expect(snoozeLeadKey("lead_1")).toBe("snooze/lead/lead_1");
  });

  it("snoozeTaskKey returns correct format", () => {
    expect(snoozeTaskKey("task_1")).toBe("snooze/task/task_1");
  });
});

describe("runSnoozeWakeSweep", () => {
  it("wakes a lead whose snoozedUntil has passed", async () => {
    const pastDate = "2026-10-01T00:00:00.000Z"; // in the past relative to now
    const rows = [makeSettingRow("snooze/lead/lead_abc", pastDate)];
    const db = makeDb(rows);
    const result = await runSnoozeWakeSweep(db, OWNER);
    expect(result.leadsWoken).toBe(1);
  });

  it("does not wake a lead whose snoozedUntil is in the future", async () => {
    const futureDate = "2030-01-01T00:00:00.000Z";
    const rows = [makeSettingRow("snooze/lead/lead_abc", futureDate)];
    const db = makeDb(rows);
    const result = await runSnoozeWakeSweep(db, OWNER);
    expect(result.leadsWoken).toBe(0);
  });

  it("wakes a task whose snoozedUntil has passed", async () => {
    const pastDate = "2026-09-01T00:00:00.000Z";
    const rows = [makeSettingRow("snooze/task/task_xyz", pastDate)];
    const db = makeDb(rows);
    const result = await runSnoozeWakeSweep(db, OWNER);
    expect(result.tasksWoken).toBe(1);
  });

  it("ignores non-snooze settings", async () => {
    const rows = [makeSettingRow("other_setting/key", "2026-10-01T00:00:00.000Z")];
    const db = makeDb(rows);
    const result = await runSnoozeWakeSweep(db, OWNER);
    expect(result.leadsWoken).toBe(0);
    expect(result.tasksWoken).toBe(0);
  });

  it("returns zero counts when no snooze settings exist", async () => {
    const db = makeDb([]);
    const result = await runSnoozeWakeSweep(db, OWNER);
    expect(result.leadsWoken).toBe(0);
    expect(result.tasksWoken).toBe(0);
  });
});
