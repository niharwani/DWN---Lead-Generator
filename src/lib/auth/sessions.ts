/**
 * Session cookie helpers.
 *
 * Cookie name: `sl_sid`
 * Flags: HttpOnly, Secure (in production), SameSite=Lax, 30-day max-age.
 *
 * The cookie value is the raw session ID (UUID). It is HttpOnly so JS cannot
 * read it; Secure so it only travels over HTTPS in production; SameSite=Lax
 * to allow GET navigations from external links while blocking CSRF on POSTs.
 */

import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "sl_sid";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export type CookieOptions = {
  secure?: boolean;
};

/**
 * Write the session cookie into the response.
 * Must be called from a Server Action or Route Handler (not a Server Component).
 */
export async function setSessionCookie(
  sessionId: string,
  options: CookieOptions = {}
): Promise<void> {
  const jar = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: options.secure ?? isProduction,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/** Clear the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/** Read the session ID from the request cookie. Returns `null` if absent. */
export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE_NAME)?.value;
  return value && value.length > 0 ? value : null;
}
