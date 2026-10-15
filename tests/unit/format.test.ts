import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatBytes,
  formatMs,
  formatRelative,
  scoreBandClass,
  stageDotClass,
  severityClass,
  sourceLabel,
} from "@/lib/demo/format";

describe("formatRelative", () => {
  const NOW = "2026-10-14T09:00:00.000Z";

  it('returns "just now" / "in a moment" for sub-minute differences', () => {
    expect(formatRelative(NOW, NOW)).toBe("just now");
    expect(formatRelative("2026-10-14T09:00:30.000Z", NOW)).toBe("in a moment");
  });

  it("returns minutes and hours for near-term differences", () => {
    expect(formatRelative("2026-10-14T08:30:00.000Z", NOW)).toBe("30m ago");
    expect(formatRelative("2026-10-14T11:00:00.000Z", NOW)).toBe("in 2h");
  });

  it("returns days for multi-day differences", () => {
    expect(formatRelative("2026-10-10T09:00:00.000Z", NOW)).toBe("4d ago");
    expect(formatRelative("2026-10-18T09:00:00.000Z", NOW)).toBe("in 4d");
  });

  it("returns month units for distant dates", () => {
    expect(formatRelative("2026-07-14T09:00:00.000Z", NOW)).toMatch(/mo ago$/);
  });

  it('returns "—" for undefined input', () => {
    expect(formatRelative(undefined)).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("returns INR by default with Indian grouping", () => {
    expect(formatCurrency(450000)).toContain("4,50,000");
  });

  it('returns "—" for undefined', () => {
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("respects an explicit currency arg", () => {
    const usd = formatCurrency(1500, "USD");
    expect(usd).toContain("1,500");
    expect(usd).toContain("$");
  });
});

describe("formatBytes", () => {
  it("formats bytes / KB / MB with precision", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1_840_000)).toBe("1.75 MB");
  });
});

describe("formatMs", () => {
  it("shows ms under 1s then seconds", () => {
    expect(formatMs(250)).toBe("250 ms");
    expect(formatMs(2600)).toBe("2.6 s");
  });
});

describe("sourceLabel", () => {
  it("maps known source ids", () => {
    expect(sourceLabel("google_places")).toBe("Google Places");
    expect(sourceLabel("manual")).toBe("Manual");
  });

  it("falls back to the raw id for unknown sources", () => {
    expect(sourceLabel("some_new_adapter")).toBe("some_new_adapter");
  });
});

describe("palette helpers return non-empty strings", () => {
  it("scoreBandClass covers every band", () => {
    for (const band of [
      "priority_review",
      "strong_candidate",
      "needs_manual_review",
      "low_priority",
      "insufficient_evidence",
    ] as const) {
      expect(scoreBandClass(band)).toBeTruthy();
    }
  });

  it("stageDotClass covers every stage", () => {
    for (const stage of [
      "new",
      "reviewing",
      "qualified",
      "contacted",
      "replied",
      "meeting_booked",
      "proposal_sent",
      "won",
      "lost",
      "not_a_fit",
    ] as const) {
      expect(stageDotClass(stage)).toBeTruthy();
    }
  });

  it("severityClass covers every severity", () => {
    for (const sev of ["info", "low", "medium", "high"] as const) {
      expect(severityClass(sev)).toBeTruthy();
    }
  });
});
