/**
 * Magic-link token utilities.
 *
 * Tokens are 32 bytes of URL-safe random data. Only the SHA-256 hash is stored
 * in the database so that a DB leak does not expose usable tokens. Tokens are
 * single-use: consuming a token sets `consumed_at`, subsequent verification
 * attempts fail.
 *
 * Token lifetime: 15 minutes.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { magicLinkTokens } from "@/lib/db/schema";

/** Lifetime of a magic-link token in milliseconds. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/* --------------------------------------------------------------------------
 * Token generation
 * -------------------------------------------------------------------------- */

/** Generate a secure 32-byte URL-safe base64 token. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Base64url encode
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Hash a raw token with SHA-256 and return the hex digest for storage. */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* --------------------------------------------------------------------------
 * Persistence
 * -------------------------------------------------------------------------- */

export type StoredMagicLink = {
  id: string;
  email: string;
  expiresAt: string;
};

/** Create a new magic-link token record. Returns the raw (unhashed) token. */
export async function createMagicLinkToken(
  db: Db,
  email: string
): Promise<string> {
  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS).toISOString();

  await db.insert(magicLinkTokens).values({
    id,
    email: email.trim().toLowerCase(),
    tokenHash,
    expiresAt,
    createdAt: now.toISOString(),
  });

  return rawToken;
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: "not_found" | "expired" | "consumed" };

/**
 * Verify and consume a raw magic-link token.
 *
 * - Hashes the token and looks up the record.
 * - Checks expiry.
 * - Sets `consumed_at` atomically if valid.
 * - Returns the email on success.
 */
export async function verifyAndConsumeMagicLinkToken(
  db: Db,
  rawToken: string
): Promise<VerifyResult> {
  const tokenHash = await hashToken(rawToken);
  const now = new Date().toISOString();

  const [row] = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt < now) return { ok: false, reason: "expired" };
  if (row.consumedAt) return { ok: false, reason: "consumed" };

  // Mark as consumed
  await db
    .update(magicLinkTokens)
    .set({ consumedAt: now })
    .where(and(eq(magicLinkTokens.id, row.id), isNull(magicLinkTokens.consumedAt)));

  return { ok: true, email: row.email };
}
