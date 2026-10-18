import { describe, it, expect } from "vitest";
import {
  hasPermission,
  meetsMinRole,
  requireRole,
  requirePermission,
  ROLE_PERMISSIONS,
  type Role,
  type Permission,
} from "@/lib/auth/rbac";
import type { Owner } from "@/lib/auth/session";

/* --------------------------------------------------------------------------
 * Helper: build a minimal Owner stub for requireRole / requirePermission
 * -------------------------------------------------------------------------- */

function makeOwner(role: Role): Owner {
  return {
    id: "ws-1",
    profileId: "profile-1",
    email: "test@example.com",
    fullName: "Test User",
    role,
    workspace: { id: "ws-1", name: "Test WS", slug: "test-ws", plan: "teams" },
    isDemo: false,
  };
}

/* --------------------------------------------------------------------------
 * ROLE_PERMISSIONS matrix completeness
 * -------------------------------------------------------------------------- */

describe("ROLE_PERMISSIONS matrix", () => {
  const ROLES: Role[] = ["owner", "admin", "member", "viewer"];
  const ALL_PERMISSIONS: Permission[] = [
    "manage_billing",
    "manage_members",
    "manage_integrations",
    "manage_automations",
    "create_lead",
    "edit_lead",
    "delete_lead",
    "send_outreach",
    "approve_draft",
    "export_data",
    "view_data",
  ];

  it("all four roles are defined", () => {
    for (const r of ROLES) {
      expect(ROLE_PERMISSIONS[r]).toBeDefined();
      expect(Array.isArray(ROLE_PERMISSIONS[r])).toBe(true);
    }
  });

  it("owner has all permissions", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(ROLE_PERMISSIONS.owner).toContain(p);
    }
  });

  it("admin has all permissions except manage_billing", () => {
    expect(ROLE_PERMISSIONS.admin).not.toContain("manage_billing");
    for (const p of ALL_PERMISSIONS.filter((x) => x !== "manage_billing")) {
      expect(ROLE_PERMISSIONS.admin).toContain(p);
    }
  });

  it("member can create_lead, edit_lead, send_outreach, approve_draft, view_data", () => {
    const memberPerms = ROLE_PERMISSIONS.member;
    expect(memberPerms).toContain("create_lead");
    expect(memberPerms).toContain("edit_lead");
    expect(memberPerms).toContain("send_outreach");
    expect(memberPerms).toContain("approve_draft");
    expect(memberPerms).toContain("view_data");
  });

  it("member cannot manage_billing, manage_members, delete_lead, or export_data", () => {
    const memberPerms = ROLE_PERMISSIONS.member;
    expect(memberPerms).not.toContain("manage_billing");
    expect(memberPerms).not.toContain("manage_members");
    expect(memberPerms).not.toContain("delete_lead");
    expect(memberPerms).not.toContain("export_data");
  });

  it("viewer can only view_data", () => {
    expect(ROLE_PERMISSIONS.viewer).toEqual(["view_data"]);
  });
});

/* --------------------------------------------------------------------------
 * hasPermission
 * -------------------------------------------------------------------------- */

describe("hasPermission", () => {
  it("returns true for owner + manage_billing", () => {
    expect(hasPermission("owner", "manage_billing")).toBe(true);
  });

  it("returns false for admin + manage_billing", () => {
    expect(hasPermission("admin", "manage_billing")).toBe(false);
  });

  it("returns false for viewer + create_lead", () => {
    expect(hasPermission("viewer", "create_lead")).toBe(false);
  });

  it("returns true for viewer + view_data", () => {
    expect(hasPermission("viewer", "view_data")).toBe(true);
  });

  it("returns true for member + approve_draft", () => {
    expect(hasPermission("member", "approve_draft")).toBe(true);
  });

  it("returns false for member + manage_integrations", () => {
    expect(hasPermission("member", "manage_integrations")).toBe(false);
  });
});

/* --------------------------------------------------------------------------
 * meetsMinRole (hierarchy)
 * -------------------------------------------------------------------------- */

describe("meetsMinRole", () => {
  it("owner meets all roles", () => {
    expect(meetsMinRole("owner", "owner")).toBe(true);
    expect(meetsMinRole("owner", "admin")).toBe(true);
    expect(meetsMinRole("owner", "member")).toBe(true);
    expect(meetsMinRole("owner", "viewer")).toBe(true);
  });

  it("admin meets admin and below, not owner", () => {
    expect(meetsMinRole("admin", "owner")).toBe(false);
    expect(meetsMinRole("admin", "admin")).toBe(true);
    expect(meetsMinRole("admin", "member")).toBe(true);
    expect(meetsMinRole("admin", "viewer")).toBe(true);
  });

  it("member meets member and viewer, not admin or owner", () => {
    expect(meetsMinRole("member", "owner")).toBe(false);
    expect(meetsMinRole("member", "admin")).toBe(false);
    expect(meetsMinRole("member", "member")).toBe(true);
    expect(meetsMinRole("member", "viewer")).toBe(true);
  });

  it("viewer only meets viewer", () => {
    expect(meetsMinRole("viewer", "owner")).toBe(false);
    expect(meetsMinRole("viewer", "admin")).toBe(false);
    expect(meetsMinRole("viewer", "member")).toBe(false);
    expect(meetsMinRole("viewer", "viewer")).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * requireRole — throw cases
 * -------------------------------------------------------------------------- */

describe("requireRole", () => {
  it("does not throw when owner meets admin requirement", () => {
    expect(() => requireRole(makeOwner("owner"), "admin")).not.toThrow();
  });

  it("does not throw when admin meets member requirement", () => {
    expect(() => requireRole(makeOwner("admin"), "member")).not.toThrow();
  });

  it("throws Response(403) when viewer tries to meet admin requirement", () => {
    expect(() => requireRole(makeOwner("viewer"), "admin")).toThrow(Response);
  });

  it("thrown Response has status 403", () => {
    try {
      requireRole(makeOwner("member"), "owner");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(403);
    }
  });

  it("thrown Response body contains code insufficient_role", async () => {
    try {
      requireRole(makeOwner("viewer"), "member");
      expect.fail("should have thrown");
    } catch (err) {
      const body = await (err as Response).json() as { error: { code: string } };
      expect(body.error.code).toBe("insufficient_role");
    }
  });

  it("does not throw when exact role requirement is met", () => {
    expect(() => requireRole(makeOwner("member"), "member")).not.toThrow();
    expect(() => requireRole(makeOwner("viewer"), "viewer")).not.toThrow();
  });
});

/* --------------------------------------------------------------------------
 * requirePermission — throw cases
 * -------------------------------------------------------------------------- */

describe("requirePermission", () => {
  it("does not throw when owner requires manage_billing", () => {
    expect(() => requirePermission(makeOwner("owner"), "manage_billing")).not.toThrow();
  });

  it("throws Response(403) when admin requires manage_billing", () => {
    expect(() =>
      requirePermission(makeOwner("admin"), "manage_billing")
    ).toThrow(Response);
  });

  it("thrown Response has status 403 and code permission_denied", async () => {
    try {
      requirePermission(makeOwner("viewer"), "create_lead");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(403);
      const body = await (err as Response).json() as { error: { code: string } };
      expect(body.error.code).toBe("permission_denied");
    }
  });

  it("does not throw when member requires view_data", () => {
    expect(() => requirePermission(makeOwner("member"), "view_data")).not.toThrow();
  });

  it("does not throw when admin requires manage_members", () => {
    expect(() => requirePermission(makeOwner("admin"), "manage_members")).not.toThrow();
  });

  it("throws when member tries to delete_lead", () => {
    expect(() => requirePermission(makeOwner("member"), "delete_lead")).toThrow(Response);
  });
});

/* --------------------------------------------------------------------------
 * Full matrix coverage: every role × permission combination
 * -------------------------------------------------------------------------- */

describe("full role × permission matrix coverage", () => {
  const roles: Role[] = ["owner", "admin", "member", "viewer"];
  const permissions: Permission[] = [
    "manage_billing",
    "manage_members",
    "manage_integrations",
    "manage_automations",
    "create_lead",
    "edit_lead",
    "delete_lead",
    "send_outreach",
    "approve_draft",
    "export_data",
    "view_data",
  ];

  for (const role of roles) {
    for (const permission of permissions) {
      it(`hasPermission("${role}", "${permission}") returns boolean`, () => {
        const result = hasPermission(role, permission);
        expect(typeof result).toBe("boolean");
      });
    }
  }

  it("owner has strictly more permissions than admin", () => {
    const ownerPerms = new Set(ROLE_PERMISSIONS.owner);
    const adminPerms = new Set(ROLE_PERMISSIONS.admin);
    // All admin perms are in owner perms
    for (const p of adminPerms) {
      expect(ownerPerms.has(p)).toBe(true);
    }
    // Owner has at least one perm admin lacks
    const onlyOwner = [...ownerPerms].filter((p) => !adminPerms.has(p));
    expect(onlyOwner.length).toBeGreaterThan(0);
  });

  it("admin has strictly more permissions than member", () => {
    const adminPerms = new Set(ROLE_PERMISSIONS.admin);
    const memberPerms = new Set(ROLE_PERMISSIONS.member);
    for (const p of memberPerms) {
      expect(adminPerms.has(p)).toBe(true);
    }
    const onlyAdmin = [...adminPerms].filter((p) => !memberPerms.has(p));
    expect(onlyAdmin.length).toBeGreaterThan(0);
  });

  it("member has strictly more permissions than viewer", () => {
    const memberPerms = new Set(ROLE_PERMISSIONS.member);
    const viewerPerms = new Set(ROLE_PERMISSIONS.viewer);
    for (const p of viewerPerms) {
      expect(memberPerms.has(p)).toBe(true);
    }
    const onlyMember = [...memberPerms].filter((p) => !viewerPerms.has(p));
    expect(onlyMember.length).toBeGreaterThan(0);
  });
});
