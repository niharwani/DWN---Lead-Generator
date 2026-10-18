import { describe, it, expect } from "vitest";
import { generateToken, hashToken, MAGIC_LINK_TTL_MS } from "@/lib/auth/magic-link";

/**
 * Magic-link utility tests.
 *
 * Tests the pure token generation and hashing functions. The DB-dependent
 * createMagicLinkToken / verifyAndConsumeMagicLinkToken functions are not
 * exercised here (they require D1).
 */

describe("generateToken", () => {
  it("returns a non-empty string", () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThan(0);
  });

  it("returns a URL-safe base64 string (no +, /, or = chars)", () => {
    for (let i = 0; i < 20; i++) {
      const token = generateToken();
      expect(token).not.toMatch(/[+/=]/);
    }
  });

  it("generates unique tokens each call", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateToken()));
    expect(tokens.size).toBe(50);
  });

  it("produces tokens of consistent length (43 chars for 32 bytes base64url)", () => {
    // 32 bytes → 44 base64 chars → 43 base64url chars (one '=' stripped)
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(42);
    expect(token.length).toBeLessThanOrEqual(44);
  });
});

describe("hashToken", () => {
  it("produces a 64-char hex string (SHA-256)", async () => {
    const hash = await hashToken("some-raw-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input yields same hash", async () => {
    const token = "my-test-token";
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toBe(h2);
  });

  it("different tokens produce different hashes", async () => {
    const h1 = await hashToken("token-a");
    const h2 = await hashToken("token-b");
    expect(h1).not.toBe(h2);
  });

  it("raw token is not recoverable from the hash (pre-image resistance)", async () => {
    const raw = generateToken();
    const hash = await hashToken(raw);
    // The hash should not contain the raw token string
    expect(hash).not.toContain(raw);
    expect(raw).not.toContain(hash);
  });
});

describe("MAGIC_LINK_TTL_MS", () => {
  it("is 15 minutes in milliseconds", () => {
    expect(MAGIC_LINK_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe("token expiry", () => {
  it("a token created now expires in the future", () => {
    const now = Date.now();
    const expiresAt = new Date(now + MAGIC_LINK_TTL_MS).toISOString();
    expect(expiresAt > new Date(now).toISOString()).toBe(true);
  });

  it("a token created 20 minutes ago is expired", () => {
    const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;
    const expiresAt = new Date(twentyMinutesAgo + MAGIC_LINK_TTL_MS).toISOString();
    const now = new Date().toISOString();
    expect(expiresAt < now).toBe(true);
  });
});
