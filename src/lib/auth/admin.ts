/**
 * Super-admin gate for the /admin route group.
 *
 * Reads SUPER_ADMIN_EMAILS (comma-separated) from the runtime env and checks
 * whether the current session's profile email is in the allowlist.
 *
 * This is a lightweight support/debugging surface — not a production-grade
 * access control system. It is appropriate for a small-team SaaS where the
 * operator is also the admin.
 */

import { redirect } from "next/navigation";
import { getOwner } from "./session";
import { getRuntimeEnv } from "@/lib/env";

function getSuperAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Check whether the given email is a configured super-admin.
 */
export async function isSuperAdmin(email: string): Promise<boolean> {
  const env = await getRuntimeEnv();
  const allowed = getSuperAdminEmails(env.SUPER_ADMIN_EMAILS);
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Gate helper for admin route handlers and layouts.
 *
 * - Unauthenticated → redirect to /login
 * - Authenticated but not super-admin → throws a 403 Response
 * - Authenticated super-admin → returns the Owner
 *
 * Usage:
 *   const owner = await requireSuperAdmin();
 */
export async function requireSuperAdmin() {
  const owner = await getOwner();

  if (!owner) {
    redirect("/login");
  }

  const allowed = await isSuperAdmin(owner.email);
  if (!allowed) {
    throw new Response(
      JSON.stringify({
        error: {
          code: "forbidden",
          message: "Super-admin access required.",
        },
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      }
    );
  }

  return owner;
}
