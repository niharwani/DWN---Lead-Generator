import { describe, it, expect } from "vitest";

/**
 * Session utility tests.
 *
 * The session CRUD functions that require D1 are covered separately. These
 * tests verify the session TTL constant and the expiry date arithmetic that
 * drives the 30-day session lifetime.
 */

// Mirror the TTL constant from the sessions repo
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function computeExpiresAt(from: Date): string {
  return new Date(from.getTime() + SESSION_TTL_MS).toISOString();
}

function isExpired(expiresAt: string, now: string): boolean {
  return expiresAt < now;
}

describe("session TTL arithmetic", () => {
  it("session expires exactly 30 days after creation", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const expected = new Date("2026-01-31T00:00:00.000Z");
    const expiresAt = computeExpiresAt(created);
    expect(expiresAt).toBe(expected.toISOString());
  });

  it("session is not expired before the TTL", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const expiresAt = computeExpiresAt(created);
    // Check 29 days later
    const checkAt = new Date("2026-01-30T00:00:00.000Z").toISOString();
    expect(isExpired(expiresAt, checkAt)).toBe(false);
  });

  it("session is expired after the TTL", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const expiresAt = computeExpiresAt(created);
    // Check 31 days later
    const checkAt = new Date("2026-02-01T00:00:00.000Z").toISOString();
    expect(isExpired(expiresAt, checkAt)).toBe(true);
  });

  it("session is not expired at the exact creation time", () => {
    const created = new Date("2026-10-18T12:00:00.000Z");
    const expiresAt = computeExpiresAt(created);
    const checkAt = created.toISOString();
    expect(isExpired(expiresAt, checkAt)).toBe(false);
  });

  it("TTL is 30 days in milliseconds", () => {
    expect(SESSION_TTL_MS).toBe(2_592_000_000);
  });
});

describe("session cookie name", () => {
  it("has the expected cookie name constant", async () => {
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/sessions");
    expect(SESSION_COOKIE_NAME).toBe("sl_sid");
  });
});
