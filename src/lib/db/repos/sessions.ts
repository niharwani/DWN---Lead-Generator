/**
 * Session repository.
 *
 * Sessions are the primary auth mechanism for web users. A session row is
 * created on magic-link callback and destroyed on logout. The `active_workspace_id`
 * column tracks which workspace the user is currently operating in.
 */

import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../client";
import { sessions, type NewSession, type Session } from "../schema";

/* --------------------------------------------------------------------------
 * Session TTL: 30 days
 * -------------------------------------------------------------------------- */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function expiresAt(from: Date = new Date()): string {
  return new Date(from.getTime() + SESSION_TTL_MS).toISOString();
}

/* --------------------------------------------------------------------------
 * CRUD
 * -------------------------------------------------------------------------- */

export async function createSession(
  db: Db,
  input: {
    profileId: string;
    activeWorkspaceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<Session> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const row: NewSession = {
    id,
    profileId: input.profileId,
    activeWorkspaceId: input.activeWorkspaceId ?? null,
    expiresAt: expiresAt(),
    createdAt: now,
    lastUsedAt: now,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  };

  await db.insert(sessions).values(row);
  const session = await getSessionById(db, id);
  if (!session) throw new Error("Failed to read back created session");
  return session;
}

export async function getSessionById(
  db: Db,
  id: string
): Promise<Session | undefined> {
  const now = new Date().toISOString();
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.expiresAt, sessions.expiresAt)))
    .limit(1);
  // Manually check expiry since drizzle doesn't have a gte-string helper here
  if (!row) return undefined;
  if (row.expiresAt < now) return undefined;
  return row;
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function updateSessionLastUsed(
  db: Db,
  id: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(sessions)
    .set({ lastUsedAt: now })
    .where(eq(sessions.id, id));
}

export async function setActiveWorkspace(
  db: Db,
  sessionId: string,
  workspaceId: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(sessions)
    .set({ activeWorkspaceId: workspaceId, lastUsedAt: now })
    .where(eq(sessions.id, sessionId));
}

/** Delete all sessions whose `expires_at` is in the past. */
export async function purgeExpiredSessions(db: Db): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now));
  return (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;
}
