/**
 * Server-side auth entry point.
 *
 * Resolves the current owner across both environments:
 *   - Production: Access JWT from `Cf-Access-Jwt-Assertion` → verified → email
 *   - Dev / local: `DEV_OWNER_EMAIL` env var acts as the identity (bypass is
 *     only honored when NODE_ENV !== 'production')
 *
 * `requireOwner()` is the primary surface — every API handler and every
 * server-rendered page that reads owner-scoped data should start with it.
 * It auto-creates a `profiles` row on first sight of an email so Phase 2
 * doesn't need a separate signup flow for the single-owner internal tool.
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema";
import { verifyAccessJwt } from "./access";

export type Owner = {
  id: string;
  email: string;
  fullName: string | null;
  isDemo: boolean;
};

export class UnauthenticatedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

function toOwner(p: Profile): Owner {
  return {
    id: p.id,
    email: p.email,
    fullName: p.fullName,
    isDemo: p.isDemo,
  };
}

/** Read identity from the current request. Returns `null` if unauthenticated. */
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
    } else {
      console.warn(
        "Access JWT present but CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are not configured; falling back to Access email header"
      );
    }

    // Fallback: Access always sets `Cf-Access-Authenticated-User-Email` at the
    // edge after a successful login, and strips any client-provided value, so
    // when we see this header alongside a JWT we can trust the request came
    // through Access even if we couldn't verify the JWT ourselves.
    if (accessEmail) return { email: accessEmail };
  }

  // Dev-only bypass. Production never honors this path even if DEV_OWNER_EMAIL
  // is set, so a leaked env var cannot unlock production.
  if (process.env.NODE_ENV !== "production") {
    const devEmail = process.env.DEV_OWNER_EMAIL;
    if (devEmail) return { email: devEmail, name: "Dev Owner" };
  }

  return null;
}

/**
 * Resolve or auto-create the owner profile for the authenticated identity.
 * Pure read-through: later identities with the same email reuse the row.
 */
export async function getOwner(): Promise<Owner | null> {
  const identity = await getIdentity();
  if (!identity) return null;

  const db = await getDb();
  const normalizedEmail = identity.email.trim().toLowerCase();

  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);
  if (existing[0]) return toOwner(existing[0]);

  // First login — provision a profile. Demo flag only set by the seed script,
  // never by auth, so real sign-ins can't elevate themselves into demo-space.
  const id = crypto.randomUUID();
  await db.insert(profiles).values({
    id,
    email: normalizedEmail,
    fullName: identity.name ?? null,
    isDemo: false,
  });
  const [row] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  if (!row) throw new Error("Failed to create profile for authenticated user");
  return toOwner(row);
}

/**
 * API-route variant. Throws a Response with 401 when unauthenticated. The
 * calling handler either lets the throw propagate (returned as the response)
 * or catches to log before rethrowing.
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
