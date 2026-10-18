/**
 * Server-side auth entry point (Phase A rewrite).
 *
 * Resolution order for `getOwner()`:
 *   1. Session cookie `sl_sid` → sessions row → active_workspace_id (or first
 *      workspace from workspace_members).
 *   2. If no session cookie but `Cf-Access-Jwt-Assertion` is present (DWN prod
 *      shim), verify the JWT → resolve profile → first workspace. Auto-mints a
 *      session so subsequent requests use path (1).
 *   3. Dev bypass: `DEV_OWNER_EMAIL` in non-production environments. Resolves
 *      profile → first workspace. Does NOT auto-mint a session (stateless dev).
 *
 * The returned `Owner.id` equals the current workspace_id. Every repo call
 * that takes `ownerId` receives this value — existing repos stay untouched.
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { profiles, sessions } from "@/lib/db/schema";
import { verifyAccessJwt } from "./access";
import { readSessionCookie, setSessionCookie } from "./sessions";
import { createSession, updateSessionLastUsed } from "@/lib/db/repos/sessions";
import { getWorkspacesForProfile } from "@/lib/db/repos/workspaces";

export type Owner = {
  /** workspace_id — used as ownerId everywhere downstream */
  id: string;
  /** The authenticated human's profile id */
  profileId: string;
  email: string;
  fullName: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  workspace: {
    id: string;
    name: string;
    slug: string;
    plan: "free" | "freelancer" | "teams" | "studio";
  };
  isDemo: boolean;
  /** The session id if resolved via session cookie (for last-used updates). */
  _sessionId?: string;
};

export class UnauthenticatedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/* --------------------------------------------------------------------------
 * Internal: build Owner from a resolved profile + workspace list
 * -------------------------------------------------------------------------- */

async function ownerFromProfile(
  profileId: string,
  email: string,
  fullName: string | null,
  isDemo: boolean,
  preferredWorkspaceId?: string | null,
  sessionId?: string
): Promise<Owner | null> {
  const db = await getDb();

  const workspacesForProfile = await getWorkspacesForProfile(db, profileId);
  const firstWs = workspacesForProfile[0];
  if (!firstWs) return null;

  const ws = preferredWorkspaceId
    ? (workspacesForProfile.find((w) => w.id === preferredWorkspaceId) ?? firstWs)
    : firstWs;

  return {
    id: ws.id,
    profileId,
    email,
    fullName,
    role: ws.role,
    workspace: {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      plan: ws.plan,
    },
    isDemo,
    _sessionId: sessionId,
  };
}

async function resolveProfileToOwner(
  email: string,
  preferredWorkspaceId?: string | null,
  sessionId?: string
): Promise<Owner | null> {
  const db = await getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const [profileRow] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);

  if (!profileRow) return null;

  return ownerFromProfile(
    profileRow.id,
    profileRow.email,
    profileRow.fullName,
    profileRow.isDemo,
    preferredWorkspaceId,
    sessionId
  );
}

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

/**
 * Read identity from the current request (CF Access or dev bypass only).
 * Used internally and by legacy callers. For workspace-aware auth use `getOwner()`.
 */
export async function getIdentity(): Promise<{ email: string; name?: string } | null> {
  const h = await headers();
  const jwt = h.get("cf-access-jwt-assertion");
  const accessEmail = h.get("cf-access-authenticated-user-email");

  if (jwt) {
    const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
    const audience = process.env.CF_ACCESS_AUD;
    if (teamDomain && audience) {
      try {
        const identity = await verifyAccessJwt(jwt, teamDomain, audience);
        return { email: identity.email, name: identity.name };
      } catch (err) {
        console.warn("Access JWT verification failed; falling back to Access email header", {
          reason: (err as Error).message,
        });
      }
    }
    if (accessEmail) return { email: accessEmail };
  }

  if (process.env.NODE_ENV !== "production") {
    const devEmail = process.env.DEV_OWNER_EMAIL;
    if (devEmail) return { email: devEmail, name: "Dev Owner" };
  }

  return null;
}

/**
 * Resolve the current owner from the request.
 * Returns `null` if unauthenticated or if the profile has no workspace.
 */
export async function getOwner(): Promise<Owner | null> {
  const db = await getDb();
  const now = new Date().toISOString();

  // --- Path 1: Session cookie ---
  const sessionId = await readSessionCookie();
  if (sessionId) {
    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (sessionRow && sessionRow.expiresAt > now) {
      const [profileRow] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, sessionRow.profileId))
        .limit(1);

      if (profileRow) {
        const owner = await ownerFromProfile(
          profileRow.id,
          profileRow.email,
          profileRow.fullName,
          profileRow.isDemo,
          sessionRow.activeWorkspaceId,
          sessionId
        );
        if (owner) {
          // Fire-and-forget last-used update
          updateSessionLastUsed(db, sessionId).catch(() => {});
          return owner;
        }
      }
    }
  }

  // --- Path 2: CF Access JWT shim (DWN prod backwards compat) ---
  const h = await headers();
  const jwt = h.get("cf-access-jwt-assertion");
  const accessEmail = h.get("cf-access-authenticated-user-email");

  let cfEmail: string | null = null;

  if (jwt) {
    const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
    const audience = process.env.CF_ACCESS_AUD;
    if (teamDomain && audience) {
      try {
        const identity = await verifyAccessJwt(jwt, teamDomain, audience);
        cfEmail = identity.email;
      } catch {
        if (accessEmail) cfEmail = accessEmail;
      }
    } else if (accessEmail) {
      cfEmail = accessEmail;
    }
  }

  if (cfEmail) {
    const owner = await resolveProfileToOwner(cfEmail);
    if (owner) {
      // Auto-mint a session for the CF Access user so future requests use path 1
      try {
        const reqHeaders = h;
        const ipAddress =
          reqHeaders.get("cf-connecting-ip") ??
          reqHeaders.get("x-forwarded-for") ??
          undefined;
        const userAgent = reqHeaders.get("user-agent") ?? undefined;
        const newSession = await createSession(db, {
          profileId: owner.profileId,
          activeWorkspaceId: owner.workspace.id,
          ipAddress,
          userAgent,
        });
        await setSessionCookie(newSession.id);
      } catch {
        // Non-fatal: CF Access path still works without a session
      }
      return owner;
    }
  }

  // --- Path 3: Dev bypass ---
  if (process.env.NODE_ENV !== "production") {
    const devEmail = process.env.DEV_OWNER_EMAIL;
    if (devEmail) {
      return resolveProfileToOwner(devEmail);
    }
  }

  return null;
}

/**
 * API-route / server-action variant. Throws a 401 Response when unauthenticated.
 */
export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) {
    throw new Response(
      JSON.stringify({ error: { code: "unauthorized", message: "Not authenticated" } }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }
  return owner;
}
