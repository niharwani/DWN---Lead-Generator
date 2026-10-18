import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Resend email transport tests.
 *
 * Tests the request body shape and the missing-key behavior by mocking
 * the runtime environment and global fetch.
 */

// We need to intercept getRuntimeEnv and global fetch
const mockGetRuntimeEnv = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/env", () => ({
  getRuntimeEnv: mockGetRuntimeEnv,
}));

global.fetch = mockFetch as unknown as typeof fetch;

afterEach(() => {
  vi.clearAllMocks();
});

async function importSendEmail() {
  // Dynamic import forces module re-evaluation with fresh mocks each test.
  // Clear module cache via vi.resetModules() not needed here since mocks are
  // at the module boundary.
  const { sendEmail } = await import("@/lib/email/resend");
  return sendEmail;
}

describe("sendEmail — request body shape", () => {
  it("sends to the Resend API with correct headers and body", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      RESEND_API_KEY: "re_test_key",
      MAIL_FROM: "test@example.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    });

    const sendEmail = await importSendEmail();
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test subject",
      text: "Test body",
    });

    expect(result.id).toBe("email_123");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_test_key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("test@example.com");
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Test subject");
    expect(body.text).toBe("Test body");
  });

  it("includes html when provided", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      RESEND_API_KEY: "re_test_key",
      MAIL_FROM: "no-reply@example.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_456" }),
    });

    const sendEmail = await importSendEmail();
    await sendEmail({
      to: "u@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.html).toBe("<p>Hello</p>");
  });

  it("uses custom from address when provided", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      RESEND_API_KEY: "re_key",
      MAIL_FROM: "default@example.com",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "x" }),
    });

    const sendEmail = await importSendEmail();
    await sendEmail({
      to: "u@example.com",
      subject: "s",
      text: "t",
      from: "custom@example.com",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("custom@example.com");
  });

  it("throws on non-ok API response", async () => {
    mockGetRuntimeEnv.mockResolvedValue({
      RESEND_API_KEY: "re_key",
      MAIL_FROM: "no-reply@example.com",
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Unprocessable Entity",
    });

    const sendEmail = await importSendEmail();
    await expect(
      sendEmail({ to: "u@example.com", subject: "s", text: "t" })
    ).rejects.toThrow("Resend API error 422");
  });
});

describe("sendEmail — missing API key", () => {
  it("stubs in test/development mode (non-production) when key is absent", async () => {
    // vitest runs with NODE_ENV='test', which is non-production.
    // The resend module stubs the call when RESEND_API_KEY is absent and
    // NODE_ENV !== 'production'.
    mockGetRuntimeEnv.mockResolvedValue({
      RESEND_API_KEY: undefined,
      MAIL_FROM: undefined,
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const sendEmail = await importSendEmail();
    const result = await sendEmail({
      to: "u@example.com",
      subject: "s",
      text: "t",
    });

    expect(result.id).toMatch(/^dev_/);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Resend stub]"),
      expect.any(Object)
    );

    consoleSpy.mockRestore();
  });
});
