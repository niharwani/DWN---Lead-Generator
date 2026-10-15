import { describe, it, expect } from "vitest";
import { base64url, buildRawMessage } from "@/lib/gmail/encode";

function decodeBase64url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

describe("base64url", () => {
  it("encodes without padding and swaps + and /", () => {
    const bytes = new Uint8Array([251, 255, 191]);
    const out = base64url(bytes);
    expect(out).toBe("-_-_");
  });
});

describe("buildRawMessage", () => {
  const base = {
    to: "owner@example.com",
    from: "studio@example.com",
    subject: "Quick note",
    body: "Hello there,\n\nJust a quick note.",
  };

  it("builds a well-formed message with ASCII subject", () => {
    const raw = buildRawMessage(base);
    const decoded = decodeBase64url(raw);
    expect(decoded).toContain("To: owner@example.com");
    expect(decoded).toContain("From: studio@example.com");
    expect(decoded).toContain("Subject: Quick note");
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toContain("Hello there,\r\n\r\nJust a quick note.");
    expect(decoded.includes("\r\n\r\n")).toBe(true);
  });

  it("MIME-encodes non-ASCII subjects", () => {
    const raw = buildRawMessage({
      ...base,
      subject: "Café ☕ Résumé",
    });
    const decoded = decodeBase64url(raw);
    const subjectLine = decoded.split("\r\n").find((l) => l.startsWith("Subject:"));
    expect(subjectLine).toBeDefined();
    expect(subjectLine!.startsWith("Subject: =?UTF-8?B?")).toBe(true);
    expect(subjectLine!.endsWith("?=")).toBe(true);
  });

  it("includes a Reply-To header when provided", () => {
    const raw = buildRawMessage({
      ...base,
      replyTo: "reply@example.com",
    });
    const decoded = decodeBase64url(raw);
    expect(decoded).toContain("Reply-To: reply@example.com");
  });

  it("normalizes body newlines to CRLF", () => {
    const raw = buildRawMessage({
      ...base,
      body: "line1\nline2\r\nline3\nline4",
    });
    const decoded = decodeBase64url(raw);
    const body = decoded.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    expect(body).toBe("line1\r\nline2\r\nline3\r\nline4");
  });

  it("throws when body is empty", () => {
    expect(() => buildRawMessage({ ...base, body: "" })).toThrow(/body/);
    expect(() => buildRawMessage({ ...base, body: "   \n  " })).toThrow(/body/);
  });
});
