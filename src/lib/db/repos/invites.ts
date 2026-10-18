/**
 * Workspace invites repository.
 *
 * Uses the real `workspace_invites` table (NOT app_settings).
 *
 * Token security:
 *   - A raw random token is generated and returned to the caller.
 *   - Only the SHA-256 hex digest is stored in `workspace_invites.token`.
 *   - On accept, the hash of the presented token is looked up.
 *   - A DB leak therefore cannot be used to accept invites.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { workspaceInvites } from "../schema";
import { generateToken, hashToken } from "@/lib/auth/magic-link";

/** Default invite validity in days. */
const DEFAULT_EXPIRES_DAYS = 7;

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type InviteRole = "owner" | "admin" | "member" | "viewer";

export type CreatedInvite = {
  invite: {
    id: string;
    workspaceId: string;
    email: string;
    role: InviteRole;
    invitedBy: string;
    expiresAt: string;
    createdAt: string;
    acceptedAt: string | null;
  };
  /** The raw (unhashed) token to embed in the invite URL. */
  token: string;
};

/* --------------------------------------------------------------------------
 * Create
 * -------------------------------------------------------------------------- */

export async function createInvite(
  db: Db,
  input: {
    workspaceId: string;
    email: string;
    role: InviteRole;
    invitedBy: string;
    expiresInDays?: number;
  }
): Promise<CreatedInvite> {
  const { workspaceId, email, role, invitedBy, expiresInDays = DEFAULT_EXPIRES_DAYS } = input;

  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);

  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  await db.insert(workspaceInvites).values({
    id,
    workspaceId,
    email: email.trim().toLowerCase(),
    role,
    invitedBy,
    token: tokenHash,
    expiresAt,
    createdAt,
  });

  return {
    invite: {
      id,
      workspaceId,
      email: email.trim().toLowerCase(),
      role,
      invitedBy,
      expiresAt,
      createdAt,
      acceptedAt: null,
    },
    token: rawToken,
  };
}

/* --------------------------------------------------------------------------
 * Lookup by token hash
 * -------------------------------------------------------------------------- */

export async function getInviteByTokenHash(
  db: Db,
  tokenHash: string
): Promise<typeof workspaceInvites.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, tokenHash))
    .limit(1);
  return row;
}

/**
 * Convenience: look up an invite by a raw token string.
 * Hashes the token internally before querying.
 */
export async function getInviteByRawToken(
  db: Db,
  rawToken: string
): Promise<typeof workspaceInvites.$inferSelect | undefined> {
  const tokenHash = await hashToken(rawToken);
  return getInviteByTokenHash(db, tokenHash);
}

/* --------------------------------------------------------------------------
 * Accept
 * -------------------------------------------------------------------------- */

export async function markAccepted(db: Db, inviteId: string): Promise<void> {
  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date().toISOString() })
    .where(and(eq(workspaceInvites.id, inviteId), isNull(workspaceInvites.acceptedAt)));
}

/* --------------------------------------------------------------------------
 * List pending
 * -------------------------------------------------------------------------- */

export async function listPendingInvites(
  db: Db,
  workspaceId: string
): Promise<typeof workspaceInvites.$inferSelect[]> {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.workspaceId, workspaceId), isNull(workspaceInvites.acceptedAt)));

  // Filter out expired in application layer (SQLite doesn't support > with strings in WHERE easily
  // without casting, though ISO strings compare correctly lexicographically)
  return rows.filter((r) => r.expiresAt > now);
}

/* --------------------------------------------------------------------------
 * Delete / revoke
 * -------------------------------------------------------------------------- */

export async function deleteInvite(db: Db, inviteId: string): Promise<void> {
  await db.delete(workspaceInvites).where(eq(workspaceInvites.id, inviteId));
}
