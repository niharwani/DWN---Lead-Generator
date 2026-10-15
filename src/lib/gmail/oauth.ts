/**
 * Google OAuth 2.0 helpers for the Gmail integration.
 *
 * These wrap the two half-flows the owner needs to connect their mailbox:
 *   1. Building the consent URL (`getAuthorizationUrl`)
 *   2. Exchanging the resulting `?code` for refresh + access tokens
 *      (`exchangeCodeForTokens`)
 *
 * Everything else — refresh, send, read — lives in `./client.ts`.
 */

import { z } from "zod";
import type { RuntimeEnv } from "@/lib/env";
import type { GmailTokens } from "./client";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

function readOauthConfig(env: RuntimeEnv): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  const redirectUri = env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Gmail OAuth not configured: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Build the Google consent URL. `state` is round-tripped back to the callback
 * and must be verified against the stored state cookie there.
 */
export function getAuthorizationUrl(state: string, env: RuntimeEnv): string {
  const { clientId, redirectUri } = readOauthConfig(env);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * Exchange the authorization code from Google's redirect for a token pair.
 * Google only returns a `refresh_token` on the first consent (and when
 * `access_type=offline` + `prompt=consent` are set, which `getAuthorizationUrl`
 * does). The caller should treat its absence as a configuration bug.
 */
export async function exchangeCodeForTokens(
  code: string,
  env: RuntimeEnv
): Promise<GmailTokens> {
  const { clientId, clientSecret, redirectUri } = readOauthConfig(env);

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const raw: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message =
      typeof raw === "object" && raw !== null && "error" in raw
        ? String((raw as { error?: unknown }).error)
        : `HTTP ${resp.status}`;
    throw new Error(`Google token exchange failed: ${message}`);
  }

  const parsed = tokenResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Google token exchange returned unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`
    );
  }
  if (!parsed.data.refresh_token) {
    throw new Error(
      "Google token exchange did not return a refresh_token; revoke access and retry"
    );
  }

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
  };
}
