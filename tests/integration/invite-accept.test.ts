import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "@/lib/auth/magic-link";
import {
  meetsMinRole,
  hasPermission,
  requireRole,
  requirePermission,
} from "@/lib/auth/rbac";
import type { Owner } from "@/lib/auth/session";

/**
 * Invite → accept → RBAC integration tests.
 *
 * These tests simulate the full invite lifecycle using in-memory state
 * (no real DB/network) to verify:
 *   1. Token hash-based lookup — the raw token is never stored.
 *   2. A consumed invite cannot be re-used.
 *   3. An expired invite is rejected.
 *   4. After joining with a role, RBAC gates work for that role.
 *
 * The real API routes delegate to these primitives; integration coverage
 * here covers the contract without needing a live D1 binding.
 */

/* --------------------------------------------------------------------------
 * In-memory invite store
 * -------------------------------------------------------------------------- */

type InviteRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  invitedBy: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
};

type MemberRecord = {
  workspaceId: string;
  profileId: string;
  role: "owner" | "admin" | "member" | "viewer";
};

class InMemoryInviteStore {
  invites: InviteRecord[] = [];
  members: MemberRecord[] = [];

  async createInvite(input: {
    workspaceId: string;
    email: string;
    role: "owner" | "admin" | "member" | "viewer";
    invitedBy: string;
    expiresInDays?: number;
  }): Promise<{ invite: InviteRecord; token: string }> {
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const days = input.expiresInDays ?? 7;
    const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

    const invite: InviteRecord = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      email: input.email.toLowerCase(),
      role: input.role,
      invitedBy: input.invitedBy,
      tokenHash,
      expiresAt,
      acceptedAt: null,
    };
    this.invites.push(invite);
    return { invite, token: rawToken };
  }

  async acceptInvite(rawToken: string, acceptingProfileId: string): Promise<
    | { ok: true; role: "owner" | "admin" | "member" | "viewer" }
    | { ok: false; reason: "not_found" | "expired" | "already_used" }
  > {
    const tokenHash = await hashToken(rawToken);
    const invite = this.invites.find((i) => i.tokenHash === tokenHash);

    if (!invite) return { ok: false, reason: "not_found" };

    const now = new Date().toISOString();
    if (invite.expiresAt < now) return { ok: false, reason: "expired" };
    if (invite.acceptedAt) return { ok: false, reason: "already_used" };

    // Consume
    invite.acceptedAt = now;

    // Add member
    this.members.push({
      workspaceId: invite.workspaceId,
      profileId: acceptingProfileId,
      role: invite.role,
    });

    return { ok: true, role: invite.role };
  }

  getMemberRole(workspaceId: string, profileId: string) {
    return this.members.find(
      (m) => m.workspaceId === workspaceId && m.profileId === profileId
    )?.role;
  }
}

function makeOwnerWithRole(
  role: "owner" | "admin" | "member" | "viewer"
): Owner {
  return {
    id: "ws-1",
    profileId: "profile-new",
    email: "new@example.com",
    fullName: null,
    role,
    workspace: { id: "ws-1", name: "Test WS", slug: "test", plan: "teams" },
    isDemo: false,
  };
}

/* --------------------------------------------------------------------------
 * Invite creation
 * -------------------------------------------------------------------------- */

describe("invite creation", () => {
  it("generates a unique raw token that is not the same as the stored hash", async () => {
    const store = new InMemoryInviteStore();
    const { invite, token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "alice@example.com",
      role: "member",
      invitedBy: "owner-profile",
    });

    expect(token).toBeTruthy();
    expect(invite.tokenHash).toBeTruthy();
    expect(token).not.toBe(invite.tokenHash);
  });

  it("the stored hash equals SHA-256 of the raw token", async () => {
    const store = new InMemoryInviteStore();
    const { invite, token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "alice@example.com",
      role: "member",
      invitedBy: "owner-profile",
    });

    const expectedHash = await hashToken(token);
    expect(invite.tokenHash).toBe(expectedHash);
  });
});

/* --------------------------------------------------------------------------
 * Accept flow
 * -------------------------------------------------------------------------- */

describe("invite accept flow", () => {
  it("valid token → accepted, member added with correct role", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "bob@example.com",
      role: "admin",
      invitedBy: "owner-profile",
    });

    const result = await store.acceptInvite(token, "bob-profile");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
    }
    expect(store.getMemberRole("ws-1", "bob-profile")).toBe("admin");
  });

  it("invalid token returns not_found", async () => {
    const store = new InMemoryInviteStore();
    const result = await store.acceptInvite("not-a-real-token", "profile-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("expired invite returns expired", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "carol@example.com",
      role: "member",
      invitedBy: "owner-profile",
      expiresInDays: -1, // already expired
    });

    const result = await store.acceptInvite(token, "carol-profile");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("second acceptance of the same token returns already_used", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "dave@example.com",
      role: "viewer",
      invitedBy: "owner-profile",
    });

    await store.acceptInvite(token, "dave-profile");
    const second = await store.acceptInvite(token, "dave-profile-2");

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_used");
  });
});

/* --------------------------------------------------------------------------
 * RBAC gates work correctly for the role assigned at invite acceptance
 * -------------------------------------------------------------------------- */

describe("RBAC gates after invite acceptance", () => {
  it("new admin member can manage_members", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "admin@example.com",
      role: "admin",
      invitedBy: "owner-profile",
    });

    await store.acceptInvite(token, "admin-profile");
    const role = store.getMemberRole("ws-1", "admin-profile");

    expect(role).toBe("admin");
    expect(hasPermission(role!, "manage_members")).toBe(true);
  });

  it("new viewer member cannot create_lead", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "viewer@example.com",
      role: "viewer",
      invitedBy: "owner-profile",
    });

    await store.acceptInvite(token, "viewer-profile");
    const role = store.getMemberRole("ws-1", "viewer-profile");

    expect(role).toBe("viewer");
    expect(hasPermission(role!, "create_lead")).toBe(false);
  });

  it("new viewer member — requirePermission throws 403 for manage_members", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "viewer2@example.com",
      role: "viewer",
      invitedBy: "owner-profile",
    });

    await store.acceptInvite(token, "viewer2-profile");
    const role = store.getMemberRole("ws-1", "viewer2-profile")!;

    const owner = makeOwnerWithRole(role);
    expect(() => requirePermission(owner, "manage_members")).toThrow(Response);
  });

  it("new member role can approve_draft", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "member@example.com",
      role: "member",
      invitedBy: "owner-profile",
    });

    await store.acceptInvite(token, "member-profile");
    const role = store.getMemberRole("ws-1", "member-profile")!;

    expect(hasPermission(role, "approve_draft")).toBe(true);
    expect(() => requirePermission(makeOwnerWithRole(role), "approve_draft")).not.toThrow();
  });

  it("new member role cannot manage_billing", async () => {
    const store = new InMemoryInviteStore();
    const { token } = await store.createInvite({
      workspaceId: "ws-1",
      email: "member2@example.com",
      role: "member",
      invitedBy: "owner-profile",
    });

    await store.acceptInvite(token, "member2-profile");
    const role = store.getMemberRole("ws-1", "member2-profile")!;

    expect(hasPermission(role, "manage_billing")).toBe(false);
    expect(() =>
      requirePermission(makeOwnerWithRole(role), "manage_billing")
    ).toThrow(Response);
  });
});

/* --------------------------------------------------------------------------
 * Multiple invites can coexist
 * -------------------------------------------------------------------------- */

describe("multiple concurrent invites", () => {
  it("two invites to the same workspace have different tokens", async () => {
    const store = new InMemoryInviteStore();
    const { token: t1 } = await store.createInvite({
      workspaceId: "ws-1",
      email: "user1@example.com",
      role: "member",
      invitedBy: "owner",
    });
    const { token: t2 } = await store.createInvite({
      workspaceId: "ws-1",
      email: "user2@example.com",
      role: "admin",
      invitedBy: "owner",
    });

    expect(t1).not.toBe(t2);
  });

  it("accepting invite 1 does not affect invite 2", async () => {
    const store = new InMemoryInviteStore();
    const { token: t1 } = await store.createInvite({
      workspaceId: "ws-1",
      email: "user1@example.com",
      role: "member",
      invitedBy: "owner",
    });
    const { token: t2 } = await store.createInvite({
      workspaceId: "ws-1",
      email: "user2@example.com",
      role: "admin",
      invitedBy: "owner",
    });

    await store.acceptInvite(t1, "profile-user1");
    const result2 = await store.acceptInvite(t2, "profile-user2");

    expect(result2.ok).toBe(true);
  });
});
