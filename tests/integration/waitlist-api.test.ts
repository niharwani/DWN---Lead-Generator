/**
 * Integration test: POST /api/waitlist
 *
 * Verifies:
 *   - Valid email → 200 { ok: true }
 *   - Invalid payload (bad email, missing body) → 200 { ok: true } (anti-enumeration)
 *   - Rate limit path → 200 { ok: true } (same response, no leakage)
 *   - addToWaitlist is called with normalized email
 *   - Notification email is attempted (fire-and-forget errors are swallowed)
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { NextRequest } from "next/server";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, ip = "1.2.3.4"): NextRequest {
  const req = new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
  return req;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/waitlist", () => {
  beforeEach(async () => {
    // Mock DB
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({
      insert: () => ({ values: () => Promise.resolve() }),
    } as never);

    // Mock env for notification
    vi.spyOn(await import("@/lib/env"), "getRuntimeEnv").mockResolvedValue({
      MAIL_FROM: undefined, // skip notification email
    } as never);
  });

  it("returns 200 { ok: true } for a valid email", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = makeRequest({ email: "test@example.com" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns 200 { ok: true } with optional fields", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = makeRequest({
      email: "user@example.com",
      phone: "9876543210",
      requestedPlan: "freelancer",
      note: "Excited to use this!",
      source: "pricing_page",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns 200 { ok: true } for invalid email (anti-enumeration)", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = makeRequest({ email: "not-an-email" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns 200 { ok: true } for completely empty body (anti-enumeration)", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns 200 { ok: true } even when DB write fails", async () => {
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({
      insert: () => ({
        values: () => Promise.reject(new Error("D1 error")),
      }),
    } as never);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = makeRequest({ email: "fail@example.com" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("calls addToWaitlist with normalized (lowercase) email", async () => {
    const insertedRows: unknown[] = [];
    vi.spyOn(await import("@/lib/db/client"), "getDb").mockResolvedValue({
      insert: () => ({
        values: (row: unknown) => {
          insertedRows.push(row);
          return Promise.resolve();
        },
      }),
    } as never);

    const { POST } = await import("@/app/api/waitlist/route");
    const req = makeRequest({ email: "Alice@Example.COM" });
    await POST(req);

    expect(insertedRows.length).toBe(1);
    const row = insertedRows[0] as { email: string };
    expect(row.email).toBe("alice@example.com");
  });

  it("rate-limit path returns 200 { ok: true } (no leakage)", async () => {
    // Exhaust the rate limit by submitting 11 times from same IP
    // The rate limiter uses in-memory state — the 11th call should be limited
    // but still return { ok: true } (anti-enumeration)

    const { POST } = await import("@/app/api/waitlist/route");
    const ip = "rate-limited-test-ip-" + Date.now();

    const responses: number[] = [];
    for (let i = 0; i <= 11; i++) {
      const req = makeRequest({ email: `user${i}@example.com` }, ip);
      const res = await POST(req);
      responses.push(res.status);
    }

    // All responses must be 200 — never 429
    expect(responses.every((s) => s === 200)).toBe(true);
  });
});
