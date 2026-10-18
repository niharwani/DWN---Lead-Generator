import { describe, it, expect } from "vitest";
import { isBounceMessage } from "@/lib/cron/bounces";

describe("isBounceMessage", () => {
  it("detects mailer-daemon from address", () => {
    expect(isBounceMessage("mailer-daemon@example.com", "Returned mail")).toBe(true);
  });

  it("detects postmaster from address", () => {
    expect(isBounceMessage("postmaster@example.com", "Status update")).toBe(true);
  });

  it("detects delivery status notification subject", () => {
    expect(isBounceMessage("noreply@server.com", "Delivery Status Notification")).toBe(true);
  });

  it("detects undeliverable subject", () => {
    expect(isBounceMessage("", "Undeliverable: Hello")).toBe(true);
  });

  it("detects mail delivery failed subject", () => {
    expect(isBounceMessage("", "Mail delivery failed: returning message")).toBe(true);
  });

  it("detects delivery failure subject", () => {
    expect(isBounceMessage("", "Delivery Failure")).toBe(true);
  });

  it("returns false for normal reply", () => {
    expect(isBounceMessage("john@example.com", "Re: Your outreach")).toBe(false);
  });

  it("returns false for auto-reply", () => {
    expect(isBounceMessage("noreply@company.com", "Out of office")).toBe(false);
  });

  it("detects returned mail subject", () => {
    expect(isBounceMessage("", "Returned mail: User unknown")).toBe(true);
  });

  it("is case-insensitive on subject", () => {
    expect(isBounceMessage("", "DELIVERY STATUS NOTIFICATION")).toBe(true);
  });

  it("is case-insensitive on from", () => {
    expect(isBounceMessage("MAILER-DAEMON@host.com", "")).toBe(true);
  });
});
