/**
 * Unit tests for the super-admin gate (Phase H).
 *
 * Tests requireSuperAdmin / isSuperAdmin behavior:
 *   - throws 403 for emails not in SUPER_ADMIN_EMAILS
 *   - passes for listed emails (case-insensitive)
 *   - handles empty / missing env gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* --------------------------------------------------------------------------
 * We test isSuperAdmin logic in isolation by mocking getRuntimeEnv and
 * getOwner so we don't need a real D1 database.
 * -------------------------------------------------------------------------- */

vi.mock("@/lib/env", () => ({
  getRuntimeEnv: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOwner: vi.fn(),
}));

// Mock next/navigation redirect
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { getRuntimeEnv } from "@/lib/env";
import { getOwner } from "@/lib/auth/session";
import { isSuperAdmin, requireSuperAdmin } from "@/lib/auth/admin";

const mockGetRuntimeEnv = getRuntimeEnv as ReturnType<typeof vi.fn>;
const mockGetOwner = getOwner as ReturnType<typeof vi.fn>;

function makeOwner(email: string) {
  return {
    id: "ws-1",
    profileId: "p-1",
    email,
    fullName: "Admin User",
    role: "owner" as const,
    workspace: { id: "ws-1", name: "Test", slug: "test", plan: "studio" as const },
    isDemo: false,
  };
}

describe("isSuperAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when email is in SUPER_ADMIN_EMAILS", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: "admin@example.com,ops@example.com",
    });
    expect(await isSuperAdmin("admin@example.com")).toBe(true);
    expect(await isSuperAdmin("ops@example.com")).toBe(true);
  });

  it("is case-insensitive", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: "Admin@Example.COM",
    });
    expect(await isSuperAdmin("admin@example.com")).toBe(true);
    expect(await isSuperAdmin("ADMIN@EXAMPLE.COM")).toBe(true);
  });

  it("returns false when email is NOT in the list", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: "admin@example.com",
    });
    expect(await isSuperAdmin("attacker@evil.com")).toBe(false);
  });

  it("returns false when SUPER_ADMIN_EMAILS is not set", async () => {
    mockGetRuntimeEnv.mockResolvedValue({});
    expect(await isSuperAdmin("anyone@example.com")).toBe(false);
  });

  it("handles whitespace around emails", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: " admin@example.com , ops@example.com ",
    });
    expect(await isSuperAdmin("admin@example.com")).toBe(true);
    expect(await isSuperAdmin("ops@example.com")).toBe(true);
  });

  it("returns false for empty string email", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: "admin@example.com",
    });
    expect(await isSuperAdmin("")).toBe(false);
  });
});

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 403 Response for authenticated non-admin email", async () => {
    mockGetOwner.mockResolvedValue(makeOwner("notadmin@example.com"));
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: "admin@example.com",
    });

    await expect(requireSuperAdmin()).rejects.toSatisfy((e: unknown) => {
      if (e instanceof Response) {
        return e.status === 403;
      }
      return false;
    });
  });

  it("returns owner for listed super-admin", async () => {
    const owner = makeOwner("admin@example.com");
    mockGetOwner.mockResolvedValue(owner);
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: "admin@example.com",
    });

    const result = await requireSuperAdmin();
    expect(result).toEqual(owner);
  });

  it("redirects to /login when unauthenticated", async () => {
    mockGetOwner.mockResolvedValue(null);
    mockGetRuntimeEnv.mockResolvedValue({
      SUPER_ADMIN_EMAILS: "admin@example.com",
    });

    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("throws 403 when SUPER_ADMIN_EMAILS is not configured", async () => {
    mockGetOwner.mockResolvedValue(makeOwner("anyone@example.com"));
    mockGetRuntimeEnv.mockResolvedValue({});

    await expect(requireSuperAdmin()).rejects.toSatisfy((e: unknown) => {
      if (e instanceof Response) {
        return e.status === 403;
      }
      return false;
    });
  });
});
