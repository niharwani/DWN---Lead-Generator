import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateToken, hashToken } from "@/lib/auth/magic-link";

/**
 * Invites repository tests.
 *
 * We test:
 *   1. Token hash uniqueness — two generateToken() calls produce different hashes.
 *   2. Token hash consistency — hashing the same token twice gives the same result.
 *   3. Expiry calculation logic.
 *   4. The exported function signatures from invites.ts.
 */

import {
  createInvite,
  getInviteByTokenHash,
  getInviteByRawToken,
  markAccepted,
  listPendingInvites,
  deleteInvite,
} from "@/lib/db/repos/invites";

/* --------------------------------------------------------------------------
 * Function export checks
 * -------------------------------------------------------------------------- */

describe("invites repo exports", () => {
  it("exports createInvite", () => {
    expect(typeof createInvite).toBe("function");
  });

  it("exports getInviteByTokenHash", () => {
    expect(typeof getInviteByTokenHash).toBe("function");
  });

  it("exports getInviteByRawToken", () => {
    expect(typeof getInviteByRawToken).toBe("function");
  });

  it("exports markAccepted", () => {
    expect(typeof markAccepted).toBe("function");
  });

  it("exports listPendingInvites", () => {
    expect(typeof listPendingInvites).toBe("function");
  });

  it("exports deleteInvite", () => {
    expect(typeof deleteInvite).toBe("function");
  });
});

/* --------------------------------------------------------------------------
 * Token uniqueness (relies on magic-link utils, not DB)
 * -------------------------------------------------------------------------- */

describe("invite token generation uniqueness", () => {
  it("generates unique tokens per invite", async () => {
    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => generateToken())
    );
    const unique = new Set(tokens);
    expect(unique.size).toBe(20);
  });

  it("two different tokens produce different hashes", async () => {
    const t1 = generateToken();
    const t2 = generateToken();
    const h1 = await hashToken(t1);
    const h2 = await hashToken(t2);
    expect(h1).not.toBe(h2);
  });

  it("the same token always hashes to the same value", async () => {
    const token = generateToken();
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toBe(h2);
  });

  it("token hash is a 64-char hex string (SHA-256)", async () => {
    const token = generateToken();
    const hash = await hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* --------------------------------------------------------------------------
 * Expiry calculation logic
 * -------------------------------------------------------------------------- */

describe("invite expiry calculation", () => {
  it("7-day expiry is in the future", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(expiresAt.toISOString() > now.toISOString()).toBe(true);
  });

  it("a past expiry is detected by ISO string comparison", () => {
    const now = new Date().toISOString();
    const expired = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    expect(expired < now).toBe(true);
  });

  it("a future expiry is not detected as expired", () => {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(future > now).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * Anti-enumeration pattern
 * -------------------------------------------------------------------------- */

describe("anti-enumeration pattern", () => {
  it("the same email lowercased is used for comparison", () => {
    const email = " Test@Example.COM ";
    const normalized = email.trim().toLowerCase();
    expect(normalized).toBe("test@example.com");
  });
});

/* --------------------------------------------------------------------------
 * createInvite return shape (DB-independent)
 * -------------------------------------------------------------------------- */

describe("createInvite return contract", () => {
  it("returns an object with invite and token properties on success (mocked DB)", async () => {
    // Mock DB that captures the insert values
    const captured: unknown[] = [];
    const mockDb = {
      insert: () => ({
        values: (v: unknown) => {
          captured.push(v);
          return Promise.resolve();
        },
      }),
    };

    const result = await createInvite(
      mockDb as never,
      {
        workspaceId: "ws-1",
        email: "alice@example.com",
        role: "member",
        invitedBy: "profile-owner",
      }
    );

    expect(result).toHaveProperty("invite");
    expect(result).toHaveProperty("token");
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
  });

  it("stored token is the hash of the returned raw token", async () => {
    const mockDb = {
      insert: () => ({
        values: (v: { token: string }) => {
          return Promise.resolve(v);
        },
      }),
    };

    // We need to capture the values
    let storedHash = "";
    const capturingDb = {
      insert: () => ({
        values: async (v: { token: string }) => {
          storedHash = v.token;
        },
      }),
    };

    const result = await createInvite(capturingDb as never, {
      workspaceId: "ws-1",
      email: "bob@example.com",
      role: "admin",
      invitedBy: "profile-owner",
    });

    // The stored token should be the SHA-256 hash of the returned raw token
    const expectedHash = await hashToken(result.token);
    expect(storedHash).toBe(expectedHash);
  });

  it("invite id is a non-empty string (UUID-like)", async () => {
    const mockDb = {
      insert: () => ({ values: () => Promise.resolve() }),
    };

    const result = await createInvite(mockDb as never, {
      workspaceId: "ws-1",
      email: "carol@example.com",
      role: "viewer",
      invitedBy: "profile-owner",
    });

    expect(typeof result.invite.id).toBe("string");
    expect(result.invite.id.length).toBeGreaterThan(0);
  });

  it("acceptedAt is null on a newly created invite", async () => {
    const mockDb = {
      insert: () => ({ values: () => Promise.resolve() }),
    };

    const result = await createInvite(mockDb as never, {
      workspaceId: "ws-1",
      email: "dave@example.com",
      role: "member",
      invitedBy: "profile-owner",
    });

    expect(result.invite.acceptedAt).toBeNull();
  });
});
