/**
 * Tests for Stripe webhook signature verification.
 *
 * Uses real HMAC-SHA256 computation (Web Crypto API via globalThis.crypto).
 * No mocking needed — pure function under test.
 */

import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "@/lib/billing/stripe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a valid Stripe-style signature header for a given payload + secret.
 * Returns { header, timestamp } so tests can modify the timestamp.
 */
async function buildSignatureHeader(
  payload: string,
  secret: string,
  timestampOverride?: number
): Promise<{ header: string; timestamp: number }> {
  const timestamp = timestampOverride ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;

  // The secret format mirrors Stripe's whsec_ prefix (base64 key)
  let keyBytes: Uint8Array;
  if (secret.startsWith("whsec_")) {
    const b64 = secret.slice(6);
    const binaryStr = atob(b64);
    keyBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      keyBytes[i] = binaryStr.charCodeAt(i);
    }
  } else {
    keyBytes = new TextEncoder().encode(secret);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payloadBytes = new TextEncoder().encode(signedPayload);
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, payloadBytes.buffer as ArrayBuffer);
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const header = `t=${timestamp},v1=${signatureHex}`;
  return { header, timestamp };
}

// A deterministic test secret (base64 of 32 random bytes, in whsec_ format)
// We use a pre-computed one so tests are reproducible without actual Stripe credentials
const TEST_SECRET = "whsec_dGVzdHNlY3JldGtleWZvcnVuaXR0ZXN0aW5nMTIzNA==";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature — valid signature", () => {
  it("accepts a correctly signed payload", async () => {
    const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
    const { header } = await buildSignatureHeader(body, TEST_SECRET);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(true);
  });

  it("accepts an empty JSON body with valid signature", async () => {
    const body = "{}";
    const { header } = await buildSignatureHeader(body, TEST_SECRET);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(true);
  });

  it("accepts a header with multiple v1 signatures (Stripe rotation pattern)", async () => {
    const body = JSON.stringify({ type: "invoice.paid" });
    const ts = Math.floor(Date.now() / 1000);
    const { header: header1 } = await buildSignatureHeader(body, TEST_SECRET, ts);
    // Add a second (fake) v1 entry — only the real one needs to match
    const multiHeader = header1 + ",v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const result = await verifyWebhookSignature(body, multiHeader, TEST_SECRET);
    expect(result).toBe(true);
  });
});

describe("verifyWebhookSignature — tampered body rejected", () => {
  it("rejects when the body is different from signed payload", async () => {
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const { header } = await buildSignatureHeader(body, TEST_SECRET);
    const tamperedBody = JSON.stringify({ type: "invoice.payment_failed" });
    const result = await verifyWebhookSignature(tamperedBody, header, TEST_SECRET);
    expect(result).toBe(false);
  });

  it("rejects when a single character is changed in the body", async () => {
    const body = '{"type":"test","amount":100}';
    const { header } = await buildSignatureHeader(body, TEST_SECRET);
    const tampered = '{"type":"test","amount":101}';
    expect(await verifyWebhookSignature(tampered, header, TEST_SECRET)).toBe(false);
  });
});

describe("verifyWebhookSignature — stale timestamp rejected", () => {
  it("rejects a timestamp older than 5 minutes", async () => {
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301; // 5 min 1 sec ago
    const { header } = await buildSignatureHeader(body, TEST_SECRET, staleTimestamp);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(false);
  });

  it("accepts a timestamp within 5 minutes", async () => {
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
    const { header } = await buildSignatureHeader(body, TEST_SECRET, recentTimestamp);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(true);
  });

  it("rejects a future timestamp beyond tolerance (possible clock skew attack)", async () => {
    const body = '{"type":"test"}';
    const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 6+ minutes in the future
    const { header } = await buildSignatureHeader(body, TEST_SECRET, futureTimestamp);
    const result = await verifyWebhookSignature(body, header, TEST_SECRET);
    expect(result).toBe(false);
  });
});

describe("verifyWebhookSignature — malformed header rejected", () => {
  it("rejects an empty header", async () => {
    const body = "{}";
    expect(await verifyWebhookSignature(body, "", TEST_SECRET)).toBe(false);
  });

  it("rejects a header with no t= field", async () => {
    const body = "{}";
    expect(
      await verifyWebhookSignature(body, "v1=deadbeef", TEST_SECRET)
    ).toBe(false);
  });

  it("rejects a header with no v1= field", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = "{}";
    expect(
      await verifyWebhookSignature(body, `t=${ts}`, TEST_SECRET)
    ).toBe(false);
  });

  it("rejects a header with non-numeric timestamp", async () => {
    const body = "{}";
    expect(
      await verifyWebhookSignature(
        body,
        "t=notanumber,v1=deadbeef",
        TEST_SECRET
      )
    ).toBe(false);
  });

  it("rejects a header with wrong signature hex", async () => {
    const body = "{}";
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
    expect(await verifyWebhookSignature(body, header, TEST_SECRET)).toBe(false);
  });

  it("rejects a header that is completely garbage", async () => {
    const body = "{}";
    expect(await verifyWebhookSignature(body, "garbage", TEST_SECRET)).toBe(false);
  });
});
