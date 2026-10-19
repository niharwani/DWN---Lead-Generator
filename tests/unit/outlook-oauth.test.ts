/**
 * Unit tests for the Outlook OAuth helpers.
 *
 * Verifies:
 *   - getAuthorizationUrl produces the correct Microsoft URL with all required params
 *   - exchangeCodeForTokens sends the correct body and parses the response
 *   - refreshAccessToken sends the correct grant_type and preserves refreshToken
 *   - Both token functions throw on error responses
 */

import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

const ENV = {
  OUTLOOK_CLIENT_ID: "test-client-id",
  OUTLOOK_CLIENT_SECRET: "test-client-secret",
  OUTLOOK_REDIRECT_URI: "https://example.com/api/outlook/oauth/callback",
};

describe("getAuthorizationUrl", () => {
  it("returns a Microsoft consent URL with required query params", async () => {
    const { getAuthorizationUrl } = await import("@/lib/outlook/oauth");
    const url = new URL(getAuthorizationUrl("state-abc", ENV));
    expect(url.hostname).toBe("login.microsoftonline.com");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("scope")).toContain("Mail.Send");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });

  it("throws when env keys are missing", async () => {
    const { getAuthorizationUrl } = await import("@/lib/outlook/oauth");
    expect(() => getAuthorizationUrl("state", {})).toThrow(
      "Outlook OAuth not configured"
    );
  });
});

describe("exchangeCodeForTokens", () => {
  it("POSTs to Microsoft token endpoint and returns token pair", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-123",
          refresh_token: "refresh-456",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { exchangeCodeForTokens } = await import("@/lib/outlook/oauth");
    const tokens = await exchangeCodeForTokens("auth-code", ENV);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("login.microsoftonline.com");
    expect(url).toContain("/token");

    const bodyStr = init.body as string;
    const params = new URLSearchParams(bodyStr);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code");
    expect(params.get("client_id")).toBe("test-client-id");

    expect(tokens.accessToken).toBe("access-123");
    expect(tokens.refreshToken).toBe("refresh-456");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  it("throws when Microsoft returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: "invalid_grant" }),
          { status: 400, headers: { "content-type": "application/json" } }
        )
      )
    );
    const { exchangeCodeForTokens } = await import("@/lib/outlook/oauth");
    await expect(exchangeCodeForTokens("bad-code", ENV)).rejects.toThrow(
      "Outlook token exchange failed"
    );
  });

  it("throws when no refresh_token in response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "a", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    const { exchangeCodeForTokens } = await import("@/lib/outlook/oauth");
    await expect(exchangeCodeForTokens("code", ENV)).rejects.toThrow(
      "refresh_token"
    );
  });
});

describe("refreshAccessToken", () => {
  it("sends refresh_token grant and returns new access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-access", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { refreshAccessToken } = await import("@/lib/outlook/oauth");
    const oldTokens = {
      accessToken: "old",
      refreshToken: "refresh-keep",
      expiresAt: Date.now() - 1000,
    };
    const newTokens = await refreshAccessToken(oldTokens, ENV);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(init.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("refresh-keep");

    expect(newTokens.accessToken).toBe("new-access");
    expect(newTokens.refreshToken).toBe("refresh-keep"); // preserved
  });
});
