import { describe, it, expect } from "vitest";
import { signPayload, verifySignature } from "@/lib/db/repos/webhooks";

describe("webhook signing", () => {
  it("signPayload returns sha256= prefix", async () => {
    const sig = await signPayload("secret", "body");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("same body + secret produces same signature", async () => {
    const a = await signPayload("mysecret", "hello world");
    const b = await signPayload("mysecret", "hello world");
    expect(a).toBe(b);
  });

  it("different body produces different signature", async () => {
    const a = await signPayload("mysecret", "payload A");
    const b = await signPayload("mysecret", "payload B");
    expect(a).not.toBe(b);
  });

  it("different secret produces different signature", async () => {
    const a = await signPayload("secret1", "payload");
    const b = await signPayload("secret2", "payload");
    expect(a).not.toBe(b);
  });

  it("verifySignature returns true for matching signature", async () => {
    const body = JSON.stringify({ event: "test" });
    const sig = await signPayload("mysecret", body);
    expect(await verifySignature("mysecret", body, sig)).toBe(true);
  });

  it("verifySignature returns false for wrong signature", async () => {
    const body = JSON.stringify({ event: "test" });
    const wrong = "sha256=" + "a".repeat(64);
    expect(await verifySignature("mysecret", body, wrong)).toBe(false);
  });

  it("verifySignature returns false for tampered body", async () => {
    const body = JSON.stringify({ event: "test" });
    const sig = await signPayload("mysecret", body);
    const tampered = JSON.stringify({ event: "malicious" });
    expect(await verifySignature("mysecret", tampered, sig)).toBe(false);
  });

  it("verifySignature returns false for length mismatch", async () => {
    expect(await verifySignature("mysecret", "body", "sha256=short")).toBe(false);
  });
});
