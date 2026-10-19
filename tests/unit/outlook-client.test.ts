/**
 * Unit tests for the Outlook / Microsoft Graph client.
 *
 * Verifies:
 *   - sendMessage constructs the correct endpoint and body format
 *   - listUnreadReplies constructs the correct filter and select parameters
 *   - auth header shape (Bearer token)
 *   - listUnreadReplies response parsing maps to UnreadReply shape
 */

import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

const TOKENS = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresAt: Date.now() + 3600_000,
};

const ENV = {
  OUTLOOK_CLIENT_ID: "client-id",
  OUTLOOK_CLIENT_SECRET: "client-secret",
  OUTLOOK_REDIRECT_URI: "https://example.com/api/outlook/oauth/callback",
};

describe("Outlook client — sendMessage", () => {
  it("POSTs to the correct Graph sendMail endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        // sendMail response (202)
        new Response(null, { status: 202 })
      )
      .mockResolvedValueOnce(
        // SentItems fetch response
        new Response(
          JSON.stringify({
            value: [{ id: "msg-123", conversationId: "conv-456" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { sendMessage } = await import("@/lib/outlook/client");
    const result = await sendMessage({
      to: "recipient@example.com",
      from: "sender@example.com",
      subject: "Test subject",
      body: "Hello world",
      tokens: TOKENS,
      env: ENV,
    });

    // First call must be to sendMail
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(firstInit.method).toBe("POST");

    // Auth header
    const headers = new Headers(firstInit.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKENS.accessToken}`);

    // Body shape
    const body = JSON.parse(firstInit.body as string) as {
      message: { subject: string; toRecipients: Array<{ emailAddress: { address: string } }> };
    };
    expect(body.message.subject).toBe("Test subject");
    expect(body.message.toRecipients[0]?.emailAddress.address).toBe(
      "recipient@example.com"
    );

    // Result
    expect(result.messageId).toBe("msg-123");
    expect(result.threadId).toBe("conv-456");
  });

  it("throws when body is empty", async () => {
    const { sendMessage } = await import("@/lib/outlook/client");
    await expect(
      sendMessage({
        to: "r@example.com",
        from: "s@example.com",
        subject: "Test",
        body: "",
        tokens: TOKENS,
        env: ENV,
      })
    ).rejects.toThrow(/body.*required/i);
  });
});

describe("Outlook client — listUnreadReplies", () => {
  it("constructs correct filter and select parameters", async () => {
    const after = "2026-10-01T00:00:00.000Z";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "msg-1",
              conversationId: "conv-1",
              subject: "Re: Hello",
              from: { emailAddress: { address: "lead@example.com" } },
              receivedDateTime: "2026-10-02T10:00:00Z",
              body: { content: "Thanks for reaching out!" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { listUnreadReplies } = await import("@/lib/outlook/client");
    const result = await listUnreadReplies({ afterIso: after, tokens: TOKENS, env: ENV });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("https://graph.microsoft.com/v1.0/me/messages");
    // The URL is percent-encoded — check for the encoded filter content
    expect(url).toMatch(/isRead(%20|%2B|\+|%20)eq(%20|%2B|\+|%20)false/i);
    expect(url).toContain("$top=50");

    expect(result.replies).toHaveLength(1);
    const reply = result.replies[0]!;
    expect(reply.messageId).toBe("msg-1");
    expect(reply.threadId).toBe("conv-1");
    expect(reply.from).toBe("lead@example.com");
    expect(reply.subject).toBe("Re: Hello");
    expect(reply.snippet).toContain("Thanks for reaching out");
  });

  it("returns empty array when Graph returns no messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const { listUnreadReplies } = await import("@/lib/outlook/client");
    const result = await listUnreadReplies({
      afterIso: "2026-10-01T00:00:00Z",
      tokens: TOKENS,
      env: ENV,
    });
    expect(result.replies).toHaveLength(0);
  });

  it("throws on non-OK Graph response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "Forbidden" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const { listUnreadReplies } = await import("@/lib/outlook/client");
    await expect(
      listUnreadReplies({ afterIso: "2026-10-01T00:00:00Z", tokens: TOKENS, env: ENV })
    ).rejects.toThrow("403");
  });
});
