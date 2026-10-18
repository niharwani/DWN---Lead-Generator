/**
 * POST /api/auth/logout
 *
 * Deletes the current session row, clears the session cookie, and redirects
 * to /login.
 */

import { readSessionCookie, clearSessionCookie } from "@/lib/auth/sessions";
import { deleteSession } from "@/lib/db/repos/sessions";
import { getDb } from "@/lib/db/client";

export async function POST(req: Request): Promise<Response> {
  const sessionId = await readSessionCookie();
  if (sessionId) {
    try {
      const db = await getDb();
      await deleteSession(db, sessionId);
    } catch {
      // Non-fatal — still clear the cookie
    }
  }

  await clearSessionCookie();

  return Response.redirect(new URL("/login", req.url));
}
