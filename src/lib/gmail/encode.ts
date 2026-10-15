/**
 * RFC 2822 message builder for Gmail's `users.messages.send` endpoint.
 *
 * The result is a base64url-encoded raw message with CRLF line endings and a
 * MIME-encoded subject so non-ASCII characters survive the transport. The
 * implementation uses only Workers-compatible primitives (`TextEncoder`,
 * `btoa`) so there is no Node `Buffer` dependency.
 */

const CRLF = "\r\n";

export type BuildRawMessageInput = {
  to: string;
  from: string;
  subject: string;
  body: string;
  replyTo?: string;
};

/**
 * Encode a byte array to base64url (RFC 4648 §5). Padding stripped, `+/`
 * replaced with `-_` so the string is safe to put in Gmail's `raw` field.
 */
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function containsNonAscii(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

/**
 * Encode a header value as MIME "encoded-word" using base64 (B) when the input
 * contains non-ASCII characters. ASCII values are returned unchanged so
 * ordinary subjects stay human-readable on the wire.
 */
function encodeHeaderValue(value: string): string {
  if (!containsNonAscii(value)) return value;
  const bytes = new TextEncoder().encode(value);
  const b64 = btoa(String.fromCharCode(...bytes));
  return `=?UTF-8?B?${b64}?=`;
}

function assertHeaderSafe(name: string, value: string): void {
  if (value.includes("\r") || value.includes("\n")) {
    throw new Error(`Header ${name} contains illegal CR/LF`);
  }
}

/**
 * Build a base64url-encoded RFC 2822 message suitable for Gmail's send API.
 * Throws when `to`, `from`, `subject`, or `body` are empty after trimming.
 */
export function buildRawMessage(input: BuildRawMessageInput): string {
  const to = input.to.trim();
  const from = input.from.trim();
  const subject = input.subject.trim();
  const body = input.body;

  if (!to) throw new Error("buildRawMessage: `to` is required");
  if (!from) throw new Error("buildRawMessage: `from` is required");
  if (!subject) throw new Error("buildRawMessage: `subject` is required");
  if (!body || body.trim().length === 0) {
    throw new Error("buildRawMessage: `body` is required");
  }

  assertHeaderSafe("to", to);
  assertHeaderSafe("from", from);
  if (input.replyTo) assertHeaderSafe("reply-to", input.replyTo);

  const headers: string[] = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.replyTo) {
    headers.splice(2, 0, `Reply-To: ${input.replyTo.trim()}`);
  }

  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\n/g, CRLF);
  const raw = headers.join(CRLF) + CRLF + CRLF + normalizedBody;
  const bytes = new TextEncoder().encode(raw);
  return base64url(bytes);
}
