import { describe, it, expect, beforeEach } from "vitest";
import {
  assertWithinRateLimit,
  BUCKETS,
  RateLimitError,
} from "@/lib/rate-limit";

describe("rate limiter", () => {
  const owner = "owner_rl_" + Math.random().toString(36).slice(2);

  beforeEach(() => {
    // Each test uses a fresh owner ID so the module-level map is effectively isolated.
  });

  it("allows up to the limit, then throws RateLimitError", () => {
    const uid = owner + "_a";
    const limit = BUCKETS.audit.limit;
    const now = 1_700_000_000_000;
    for (let i = 0; i < limit; i++) {
      expect(() => assertWithinRateLimit(uid, "audit", now + i)).not.toThrow();
    }
    expect(() => assertWithinRateLimit(uid, "audit", now + limit)).toThrow(
      RateLimitError
    );
  });

  it("re-admits after the sliding window expires", () => {
    const uid = owner + "_b";
    const limit = BUCKETS.discovery.limit;
    const base = 1_700_000_000_000;
    for (let i = 0; i < limit; i++) assertWithinRateLimit(uid, "discovery", base + i);
    expect(() => assertWithinRateLimit(uid, "discovery", base + limit)).toThrow(
      RateLimitError
    );
    const past = base + BUCKETS.discovery.windowMs + 1;
    expect(() => assertWithinRateLimit(uid, "discovery", past)).not.toThrow();
  });

  it("scopes limits per owner", () => {
    const uidA = owner + "_c1";
    const uidB = owner + "_c2";
    const limit = BUCKETS.ai_draft.limit;
    const now = 1_700_000_000_000;
    for (let i = 0; i < limit; i++) assertWithinRateLimit(uidA, "ai_draft", now + i);
    // Owner A is maxed...
    expect(() => assertWithinRateLimit(uidA, "ai_draft", now + limit)).toThrow();
    // ...but B starts fresh.
    expect(() => assertWithinRateLimit(uidB, "ai_draft", now + limit)).not.toThrow();
  });

  it("RateLimitError carries retryAfterSeconds >= 1", () => {
    const uid = owner + "_d";
    const limit = BUCKETS.audit.limit;
    const now = 1_700_000_000_000;
    for (let i = 0; i < limit; i++) assertWithinRateLimit(uid, "audit", now + i);
    try {
      assertWithinRateLimit(uid, "audit", now + limit);
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });
});
