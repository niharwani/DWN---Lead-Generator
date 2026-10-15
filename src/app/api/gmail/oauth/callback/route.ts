/**
 * GET /api/gmail/oauth/callback
 *
 * Google redirects here after consent. Verifies `state` matches the cookie we
 * set in `/api/gmail/oauth/start`, exchanges the code for a token pair, and
 * persists the pair under `gmail_tokens/v1` in `app_settings`.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePageOwner } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { setSetting } from "@/lib/db/repos/settings";
import { getRuntimeEnv } from "@/lib/env";
import { exchangeCodeForTokens } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

export const GMAIL_TOKENS_KEY = "gmail_tokens/v1";

function errorRedirect(req: Request, reason: string): Response {
  const url = new URL("/settings", req.url);
  url.searchParams.set("gmail", "error");
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: Request): Promise<Response> {
  const owner = await requirePageOwner();
  const env = await getRuntimeEnv();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");
  if (googleError) return errorRedirect(req, googleError);
  if (!code || !state) return errorRedirect(req, "missing_params");

  const jar = await cookies();
  const expected = jar.get("gmail_oauth_state")?.value;
  if (!expected || expected !== state) {
    return errorRedirect(req, "state_mismatch");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, env);
  } catch (err) {
    const reason = (err as Error).message.slice(0, 120).replace(/\s+/g, "_");
    return errorRedirect(req, reason || "token_exchange_failed");
  }

  const db = await getDb();
  await setSetting(db, owner.id, GMAIL_TOKENS_KEY, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    connectedAt: new Date().toISOString(),
  });

  const redirect = new URL("/settings?gmail=connected", req.url);
  const res = NextResponse.redirect(redirect);
  res.cookies.delete("gmail_oauth_state");
  return res;
}
