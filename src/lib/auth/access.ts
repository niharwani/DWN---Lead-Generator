/**
 * Cloudflare Access JWT verification.
 *
 * In production, Access gates the Worker at the edge and forwards an identity
 * assertion via `Cf-Access-Jwt-Assertion`. We verify the JWT against the
 * team's JWKS and extract the authenticated email.
 *
 * Required env (production only):
 *   - CF_ACCESS_TEAM_DOMAIN   e.g. "dwn.cloudflareaccess.com"
 *   - CF_ACCESS_AUD           application AUD tag from Access policy settings
 *
 * References: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AccessIdentity = {
  email: string;
  name?: string;
  identityNonce?: string;
};

type AccessPayload = JWTPayload & {
  email?: string;
  name?: string;
  identity_nonce?: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  const cached = jwksCache.get(teamDomain);
  if (cached) return cached;
  const url = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
  const jwks = createRemoteJWKSet(url);
  jwksCache.set(teamDomain, jwks);
  return jwks;
}

export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  audience: string
): Promise<AccessIdentity> {
  const jwks = getJwks(teamDomain);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://${teamDomain}`,
    audience,
  });
  const p = payload as AccessPayload;
  if (!p.email || typeof p.email !== "string") {
    throw new Error("Access JWT missing required `email` claim");
  }
  return {
    email: p.email,
    name: p.name,
    identityNonce: p.identity_nonce,
  };
}
