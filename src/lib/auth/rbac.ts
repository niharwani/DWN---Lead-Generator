/**
 * Role-Based Access Control primitives.
 *
 * Provides:
 *   - Role and Permission types
 *   - ROLE_PERMISSIONS matrix (owner > admin > member > viewer hierarchy)
 *   - hasPermission — pure predicate, safe to call anywhere
 *   - requireRole — throws 403 Response if the owner's role is below minRole
 *   - requirePermission — throws 403 Response if the permission is not granted
 *
 * Critical rule: do NOT call requireRole / requirePermission from any existing
 * server action in this phase — a follow-up integration pass wires those in.
 * These primitives exist so that pass has something concrete to import.
 */

import type { Owner } from "@/lib/auth/session";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type Role = "owner" | "admin" | "member" | "viewer";

export type Permission =
  | "manage_billing"
  | "manage_members"
  | "manage_integrations"
  | "manage_automations"
  | "create_lead"
  | "edit_lead"
  | "delete_lead"
  | "send_outreach"
  | "approve_draft"
  | "export_data"
  | "view_data";

/* --------------------------------------------------------------------------
 * Permission matrix
 * -------------------------------------------------------------------------- */

const OWNER_PERMISSIONS: Permission[] = [
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

const ADMIN_PERMISSIONS: Permission[] = [
  // Everything except manage_billing
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

const MEMBER_PERMISSIONS: Permission[] = [
  "create_lead",
  "edit_lead",
  "send_outreach",
  "approve_draft",
  "view_data",
];

const VIEWER_PERMISSIONS: Permission[] = ["view_data"];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
};

/* --------------------------------------------------------------------------
 * Role hierarchy (higher index = more privileged)
 * -------------------------------------------------------------------------- */

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/* --------------------------------------------------------------------------
 * Predicates
 * -------------------------------------------------------------------------- */

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Returns true if `role` is at least as privileged as `minRole`. */
export function meetsMinRole(role: Role, minRole: Role): boolean {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

/* --------------------------------------------------------------------------
 * Guards (throw on failure)
 * -------------------------------------------------------------------------- */

/**
 * Assert the owner holds at least `minRole` in the role hierarchy.
 *
 * Hierarchy (ascending privilege):  viewer < member < admin < owner
 *
 * Throws a `Response(403)` so Next.js route handlers and server actions
 * can propagate the status code to the client automatically.
 */
export function requireRole(owner: Owner, minRole: Role): void {
  if (!meetsMinRole(owner.role as Role, minRole)) {
    throw new Response(
      JSON.stringify({
        error: {
          code: "insufficient_role",
          message: `This action requires '${minRole}' role or higher. Your role is '${owner.role}'.`,
        },
      }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  }
}

/**
 * Assert the owner has the specified fine-grained permission.
 *
 * Throws a `Response(403)` if the permission is not granted.
 */
export function requirePermission(owner: Owner, permission: Permission): void {
  if (!hasPermission(owner.role as Role, permission)) {
    throw new Response(
      JSON.stringify({
        error: {
          code: "permission_denied",
          message: `This action requires the '${permission}' permission.`,
        },
      }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  }
}
