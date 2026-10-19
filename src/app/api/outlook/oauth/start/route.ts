/**
 * GET /api/outlook/oauth/start
 *
 * Owner-only. Mints a random `state`, stashes it in an httpOnly cookie, and
 * redirects to Microsoft's consent screen.
 */

import { NextResponse } from "next/server";
import { requirePageOwner } from "@/lib/data";
import { getRuntimeEnv } from "@/lib/env";
import { getAuthorizationUrl } from "@/lib/outlook/oauth";

export const runtime = "nodejs";

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < buf.length; i += 1) {
    out += buf[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export async function GET(): Promise<Response> {
  await requirePageOwner();
  const env = await getRuntimeEnv();

  const state = randomHex(32);
  const url = getAuthorizationUrl(state, env);

  const res = NextResponse.redirect(url);
  res.cookies.set("outlook_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
