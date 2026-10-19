/**
 * Tests for Razorpay webhook signature verification.
 *
 * Razorpay's signing is simpler than Stripe's:
 *   signature = HMAC-SHA256(secret, rawBody) as hex — no timestamp.
 *
 * Uses real HMAC-SHA256 computation (Web Crypto API via globalThis.crypto).
 * No mocking needed — pure function under test.
 */

import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a valid Razorpay-style signature for a given payload + secret.
 */
async function buildSignature(payload: string, secret: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payloadBytes = new TextEncoder().encode(payload);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    payloadBytes.buffer as ArrayBuffer
  );

  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const TEST_SECRET = "razorpay_webhook_test_secret_abc123";

// ---------------------------------------------------------------------------
// Valid signature tests
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature — valid signature", () => {
  it("accepts a correctly signed payload", async () => {
    const body = JSON.stringify({
      event: "subscription.activated",
      created_at: 1700000000,
    });
    const header = await buildSignature(body, TEST_SECRET);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(true);
  });

  it("accepts an empty JSON body with valid signature", async () => {
    const body = "{}";
    const header = await buildSignature(body, TEST_SECRET);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(true);
  });

  it("accepts a large body with valid signature", async () => {
    const body = JSON.stringify({
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_001", status: "failed" } } },
      created_at: 1700001000,
    });
    const header = await buildSignature(body, TEST_SECRET);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tampered body tests
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature — tampered body rejected", () => {
  it("rejects when the body is different from the signed payload", async () => {
    const body = JSON.stringify({ event: "subscription.activated" });
    const header = await buildSignature(body, TEST_SECRET);
    const tamperedBody = JSON.stringify({ event: "subscription.cancelled" });
    const result = await verifyWebhookSignature(tamperedBody, header, TEST_SECRET);
    expect(result).toBe(false);
  });

  it("rejects when a single character is changed in the body", async () => {
    const body = '{"event":"subscription.charged","amount":100}';
    const header = await buildSignature(body, TEST_SECRET);
    const tampered = '{"event":"subscription.charged","amount":101}';
    expect(await verifyWebhookSignature(tampered, header, TEST_SECRET)).toBe(false);
  });

  it("rejects when trailing whitespace is added to the body", async () => {
    const body = '{"event":"test"}';
    const header = await buildSignature(body, TEST_SECRET);
    expect(await verifyWebhookSignature(body + " ", header, TEST_SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing / empty header tests
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature — missing header rejected", () => {
  it("rejects an empty header string", async () => {
    const body = "{}";
    expect(await verifyWebhookSignature(body, "", TEST_SECRET)).toBe(false);
  });

  it("rejects a header that is all whitespace", async () => {
    const body = "{}";
    expect(await verifyWebhookSignature(body, "   ", TEST_SECRET)).toBe(false);
  });

  it("rejects a header with wrong hex value", async () => {
    const body = "{}";
    const wrongHeader =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(await verifyWebhookSignature(body, wrongHeader, TEST_SECRET)).toBe(false);
  });

  it("rejects a header that is completely garbage", async () => {
    const body = "{}";
    expect(await verifyWebhookSignature(body, "not-a-hex-digest!!", TEST_SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wrong secret tests
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature — wrong secret rejected", () => {
  it("rejects a signature computed with a different secret", async () => {
    const body = JSON.stringify({ event: "subscription.activated" });
    const header = await buildSignature(body, "wrong_secret_xyz");
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Constant-time safety (length mismatch)
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature — length mismatch", () => {
  it("rejects a header that is shorter than expected", async () => {
    const body = "{}";
    expect(await verifyWebhookSignature(body, "abc123", TEST_SECRET)).toBe(false);
  });

  it("rejects a header that is longer than expected", async () => {
    const body = "{}";
    const validSig = await buildSignature(body, TEST_SECRET);
    expect(await verifyWebhookSignature(body, validSig + "00", TEST_SECRET)).toBe(false);
  });
});
