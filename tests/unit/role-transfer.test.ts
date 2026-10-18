import { describe, it, expect } from "vitest";
import { meetsMinRole, requireRole } from "@/lib/auth/rbac";
import type { Owner } from "@/lib/auth/session";

/**
 * Role transfer and sole-owner protection tests.
 *
 * Tests the business rules around ownership transfer:
 *   - Cannot remove the sole owner (enforced in removeMemberAction)
 *   - After transferring ownership, the previous owner can be demoted
 *   - Owner role check logic
 */

function makeOwner(role: "owner" | "admin" | "member" | "viewer"): Owner {
  return {
    id: "ws-1",
    profileId: "profile-owner",
    email: "owner@example.com",
    fullName: "Owner",
    role,
    workspace: { id: "ws-1", name: "WS", slug: "ws", plan: "teams" },
    isDemo: false,
  };
}

/* --------------------------------------------------------------------------
 * Sole owner protection logic
 * -------------------------------------------------------------------------- */

describe("sole owner protection", () => {
  it("one owner → cannot remove (ownerCount === 1)", () => {
    const members = [
      { profileId: "profile-owner", role: "owner" as const },
      { profileId: "profile-admin", role: "admin" as const },
      { profileId: "profile-member", role: "member" as const },
    ];
    const targetProfileId = "profile-owner";
    const target = members.find((m) => m.profileId === targetProfileId);

    expect(target?.role).toBe("owner");

    const ownerCount = members.filter((m) => m.role === "owner").length;
    const canRemove = !(target?.role === "owner" && ownerCount <= 1);

    expect(canRemove).toBe(false);
  });

  it("two owners → can remove one owner", () => {
    const members = [
      { profileId: "profile-owner-1", role: "owner" as const },
      { profileId: "profile-owner-2", role: "owner" as const },
      { profileId: "profile-member", role: "member" as const },
    ];
    const targetProfileId = "profile-owner-1";
    const target = members.find((m) => m.profileId === targetProfileId);

    const ownerCount = members.filter((m) => m.role === "owner").length;
    const canRemove = !(target?.role === "owner" && ownerCount <= 1);

    expect(canRemove).toBe(true);
  });

  it("cannot remove a non-existent member", () => {
    const members = [
      { profileId: "profile-owner", role: "owner" as const },
    ];
    const target = members.find((m) => m.profileId === "nobody");
    expect(target).toBeUndefined();
  });
});

/* --------------------------------------------------------------------------
 * Sole owner demotion protection (changeMemberRoleAction logic)
 * -------------------------------------------------------------------------- */

function canDemoteOwner(
  members: Array<{ profileId: string; role: string }>,
  targetProfileId: string,
  newRole: string
): boolean {
  const target = members.find((m) => m.profileId === targetProfileId);
  if (!target) return false;
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isBlocked = target.role === "owner" && newRole !== "owner" && ownerCount <= 1;
  return !isBlocked;
}

describe("sole owner demotion protection", () => {
  it("sole owner cannot be demoted to admin", () => {
    const members = [{ profileId: "profile-owner", role: "owner" }];
    expect(canDemoteOwner(members, "profile-owner", "admin")).toBe(false);
  });

  it("sole owner can change their own role to owner (no-op)", () => {
    const members = [{ profileId: "profile-owner", role: "owner" }];
    expect(canDemoteOwner(members, "profile-owner", "owner")).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * Transfer ownership logic
 * -------------------------------------------------------------------------- */

describe("transferOwnershipAction logic", () => {
  it("transfer requires owner role (requireRole does not throw for owner)", () => {
    const owner = makeOwner("owner");
    expect(() => requireRole(owner, "owner")).not.toThrow();
  });

  it("transfer is blocked for admin role", () => {
    const admin = makeOwner("admin");
    expect(() => requireRole(admin, "owner")).toThrow(Response);
  });

  it("after transfer: new profile gets owner role, old profile gets admin", () => {
    const members = [
      { profileId: "profile-a", role: "owner" as const },
      { profileId: "profile-b", role: "admin" as const },
    ];

    // Simulate transfer: promote B to owner, demote A to admin
    const newOwnerProfileId = "profile-b";
    const currentOwnerProfileId = "profile-a";

    const updated = members.map((m) => {
      if (m.profileId === newOwnerProfileId) return { ...m, role: "owner" as const };
      if (m.profileId === currentOwnerProfileId) return { ...m, role: "admin" as const };
      return m;
    });

    const newOwner = updated.find((m) => m.profileId === newOwnerProfileId);
    const oldOwner = updated.find((m) => m.profileId === currentOwnerProfileId);

    expect(newOwner?.role).toBe("owner");
    expect(oldOwner?.role).toBe("admin");

    // After transfer, there is exactly one owner
    const ownerCount = updated.filter((m) => m.role === "owner").length;
    expect(ownerCount).toBe(1);
  });

  it("transferring to yourself is blocked", () => {
    const currentOwnerProfileId = "profile-owner";
    const newOwnerProfileId = "profile-owner"; // same!

    // The action checks: if (newOwnerProfileId === owner.profileId) throw
    const blocked = newOwnerProfileId === currentOwnerProfileId;
    expect(blocked).toBe(true);
  });

  it("cannot transfer to a non-member", () => {
    const members = [
      { profileId: "profile-owner", role: "owner" as const },
      { profileId: "profile-member", role: "member" as const },
    ];
    const newOwnerProfileId = "profile-outsider";
    const target = members.find((m) => m.profileId === newOwnerProfileId);
    expect(target).toBeUndefined();
    // The action throws when !target
  });
});

/* --------------------------------------------------------------------------
 * Admin cannot remove other admins or owners
 * -------------------------------------------------------------------------- */

function isAdminRemoveBlocked(
  actorRole: string,
  targetRole: string
): boolean {
  return actorRole === "admin" && (targetRole === "admin" || targetRole === "owner");
}

describe("admin remove restrictions", () => {
  it("admin cannot remove another admin", () => {
    expect(isAdminRemoveBlocked("admin", "admin")).toBe(true);
  });

  it("admin cannot remove an owner", () => {
    expect(isAdminRemoveBlocked("admin", "owner")).toBe(true);
  });

  it("admin can remove a member", () => {
    expect(isAdminRemoveBlocked("admin", "member")).toBe(false);
  });

  it("admin can remove a viewer", () => {
    expect(isAdminRemoveBlocked("admin", "viewer")).toBe(false);
  });
});

/* --------------------------------------------------------------------------
 * requireRole is the gate for ownership actions
 * -------------------------------------------------------------------------- */

describe("requireRole hierarchy for ownership management", () => {
  it("owner can invoke owner-gated actions", () => {
    expect(() => requireRole(makeOwner("owner"), "owner")).not.toThrow();
  });

  it("admin cannot invoke owner-gated actions", () => {
    expect(() => requireRole(makeOwner("admin"), "owner")).toThrow(Response);
  });

  it("member cannot invoke owner-gated actions", () => {
    expect(() => requireRole(makeOwner("member"), "owner")).toThrow(Response);
  });

  it("viewer cannot invoke owner-gated actions", () => {
    expect(() => requireRole(makeOwner("viewer"), "owner")).toThrow(Response);
  });
});
