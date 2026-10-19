/**
 * Microsoft OAuth 2.0 helpers for the Outlook / Microsoft Graph integration.
 *
 * Mirrors the Gmail oauth.ts shape so callers can swap providers uniformly.
 * Uses the multi-tenant "common" authority which accepts any Microsoft account.
 *
 * Scopes:
 *   Mail.Send     — send email as the signed-in user
 *   Mail.Read     — read inbox for reply polling
 *   offline_access — get refresh tokens
 *   User.Read     — read the signed-in user's email/display name
 */

import { z } from "zod";
import type { RuntimeEnv } from "@/lib/env";
import type { OutlookTokens } from "./client";

const MS_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MS_AUTH_URL = `${MS_AUTH_BASE}/authorize`;
const MS_TOKEN_URL = `${MS_AUTH_BASE}/token`;

const SCOPES = [
  "Mail.Send",
  "Mail.Read",
  "offline_access",
  "User.Read",
].join(" ");

function readOauthConfig(env: RuntimeEnv): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = env.OUTLOOK_CLIENT_ID;
  const clientSecret = env.OUTLOOK_CLIENT_SECRET;
  const redirectUri = env.OUTLOOK_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Outlook OAuth not configured: set OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Build the Microsoft consent URL. `state` is round-tripped back to the
 * callback and must be verified against the stored state cookie.
 */
export function getAuthorizationUrl(state: string, env: RuntimeEnv): string {
  const { clientId, redirectUri } = readOauthConfig(env);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    response_mode: "query",
    state,
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * Exchange the authorization code for a token pair.
 * Microsoft returns a refresh_token when `offline_access` scope is requested.
 */
export async function exchangeCodeForTokens(
  code: string,
  env: RuntimeEnv
): Promise<OutlookTokens> {
  const { clientId, clientSecret, redirectUri } = readOauthConfig(env);

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: SCOPES,
  });

  const resp = await fetch(MS_TOKEN_URL, {
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
    throw new Error(`Outlook token exchange failed: ${message}`);
  }

  const parsed = tokenResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Outlook token exchange returned unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`
    );
  }
  if (!parsed.data.refresh_token) {
    throw new Error(
      "Outlook token exchange did not return a refresh_token; ensure offline_access scope is included"
    );
  }

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
  };
}

const refreshResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * Exchange a refresh token for a fresh access token.
 */
export async function refreshAccessToken(
  tokens: OutlookTokens,
  env: RuntimeEnv
): Promise<OutlookTokens> {
  const { clientId, clientSecret } = readOauthConfig(env);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
    scope: SCOPES,
  });

  const resp = await fetch(MS_TOKEN_URL, {
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
    throw new Error(`Outlook token refresh failed: ${message}`);
  }

  const parsed = refreshResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Outlook refresh returned unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`
    );
  }

  return {
    accessToken: parsed.data.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
  };
}
