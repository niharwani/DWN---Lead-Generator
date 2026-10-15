import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPrivateIpv4,
  isPrivateIpv6,
  parseIpv6,
  validateUrlForFetch,
} from "@/lib/audit/ssrf";

/**
 * SSRF guard matrix. Every one of these inputs is a shape that has been used
 * in a real-world SSRF attack. If a change to the guard loosens any of these
 * rejections, the test here is the alarm.
 */

describe("validateUrlForFetch — scheme + shape", () => {
  it.each([
    ["", "invalid_url"],
    ["   ", "invalid_url"],
    ["not a url", "invalid_url"],
    ["javascript:alert(1)", "unsupported_scheme"],
    ["file:///etc/passwd", "unsupported_scheme"],
    ["ftp://example.com", "unsupported_scheme"],
    ["gopher://example.com/", "unsupported_scheme"],
    ["data:text/html,hello", "unsupported_scheme"],
    ["http://user:pass@example.com/", "userinfo_not_allowed"],
    ["http://user@example.com/", "userinfo_not_allowed"],
  ])("rejects %p with code %p", (input, code) => {
    const result = validateUrlForFetch(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });
});

describe("validateUrlForFetch — IPv4 literals", () => {
  it.each([
    "http://127.0.0.1/",
    "http://127.0.0.2/",
    "http://10.0.0.1/",
    "http://10.255.255.254/",
    "http://172.16.0.1/",
    "http://172.31.255.254/",
    "http://192.168.0.1/",
    "http://192.168.254.254/",
    "http://169.254.1.1/",
    "http://0.0.0.0/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://192.0.2.1/",
    "http://203.0.113.1/",
    "http://224.0.0.1/",
    "http://255.255.255.255/",
  ])("rejects private / reserved IPv4 %p", (input) => {
    const r = validateUrlForFetch(input);
    expect(r.ok).toBe(false);
  });

  it("rejects the cloud metadata IPv4 with the dedicated code", () => {
    const r = validateUrlForFetch("http://169.254.169.254/latest/meta-data/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("metadata_endpoint");
  });

  it.each(["http://1.1.1.1/", "http://8.8.8.8/", "http://93.184.216.34/"])(
    "accepts public IPv4 %p",
    (input) => {
      const r = validateUrlForFetch(input);
      expect(r.ok).toBe(true);
    }
  );

  it("isPrivateIpv4 covers the full private matrix", () => {
    expect(isPrivateIpv4(127, 0, 0, 1)).toBe(true);
    expect(isPrivateIpv4(10, 20, 30, 40)).toBe(true);
    expect(isPrivateIpv4(172, 20, 1, 1)).toBe(true);
    expect(isPrivateIpv4(172, 32, 1, 1)).toBe(false); // just outside RFC 1918
    expect(isPrivateIpv4(192, 168, 0, 1)).toBe(true);
    expect(isPrivateIpv4(169, 254, 1, 1)).toBe(true);
    expect(isPrivateIpv4(169, 254, 169, 254)).toBe(true); // metadata
    expect(isPrivateIpv4(8, 8, 8, 8)).toBe(false);
    expect(isPrivateIpv4(100, 64, 0, 1)).toBe(true); // CGNAT
    expect(isPrivateIpv4(100, 128, 0, 1)).toBe(false); // past CGNAT
    expect(isPrivateIpv4(224, 0, 0, 1)).toBe(true); // multicast
    expect(isPrivateIpv4(240, 0, 0, 1)).toBe(true); // reserved
  });
});

describe("validateUrlForFetch — IPv6 literals", () => {
  it.each([
    "http://[::1]/",
    "http://[::]/",
    "http://[fe80::1]/",
    "http://[fe80::abcd:1234]/",
    "http://[fc00::1]/",
    "http://[fdff::1]/",
    "http://[ff02::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:192.168.1.1]/",
    "http://[::ffff:8.8.8.8]/", // IPv4-mapped blocked outright
    "http://[64:ff9b::1]/",
    "http://[2001:db8::1]/",
  ])("rejects private / reserved IPv6 %p", (input) => {
    const r = validateUrlForFetch(input);
    expect(r.ok).toBe(false);
  });

  it.each(["http://[2606:4700:4700::1111]/", "http://[2001:4860:4860::8888]/"])(
    "accepts public IPv6 %p",
    (input) => {
      const r = validateUrlForFetch(input);
      expect(r.ok).toBe(true);
    }
  );

  it("parseIpv6 handles compression + IPv4-mapped forms", () => {
    expect(parseIpv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6("fe80::1")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6("2001:db8::1")).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1]);
    // IPv4-mapped
    expect(parseIpv6("::ffff:1.2.3.4")?.[5]).toBe(0xffff);
  });

  it("parseIpv6 returns null for non-IPv6 strings", () => {
    expect(parseIpv6("example.com")).toBeNull();
    expect(parseIpv6("127.0.0.1")).toBeNull();
    expect(parseIpv6("1::2::3")).toBeNull(); // multiple compression
  });

  it("isPrivateIpv6 classifies ULA, link-local, multicast", () => {
    expect(isPrivateIpv6(parseIpv6("::1")!)).toBe(true);
    expect(isPrivateIpv6(parseIpv6("fc00::1")!)).toBe(true);
    expect(isPrivateIpv6(parseIpv6("fe80::1")!)).toBe(true);
    expect(isPrivateIpv6(parseIpv6("ff02::1")!)).toBe(true);
    expect(isPrivateIpv6(parseIpv6("2606:4700:4700::1111")!)).toBe(false);
  });
});

describe("validateUrlForFetch — hostname blocklist + suffix", () => {
  it.each([
    "http://localhost/",
    "http://localhost:8080/",
    "http://LOCALHOST/", // case-insensitive
    "http://metadata.google.internal/",
    "http://metadata.azure.com/",
    "http://instance-data.ec2.internal/",
  ])("rejects well-known hostname %p", (input) => {
    const r = validateUrlForFetch(input);
    expect(r.ok).toBe(false);
  });

  it.each([
    "http://foo.local/",
    "http://my.service.internal/",
    "http://thing.localhost/",
    "http://darknet.onion/",
  ])("rejects reserved-suffix hostname %p", (input) => {
    const r = validateUrlForFetch(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("blocked_suffix");
  });

  it.each(["http://example.com/", "https://dwn-site.pages.dev/"])(
    "accepts normal public hostname %p",
    (input) => {
      expect(validateUrlForFetch(input).ok).toBe(true);
    }
  );
});

describe("validateUrlForFetch — dev-only bypass", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores AUDIT_ALLOW_PRIVATE in production", () => {
    vi.stubEnv("AUDIT_ALLOW_PRIVATE", "1");
    vi.stubEnv("NODE_ENV", "production");
    const r = validateUrlForFetch("http://127.0.0.1/");
    expect(r.ok).toBe(false);
  });

  it("honors AUDIT_ALLOW_PRIVATE=1 in non-production", () => {
    vi.stubEnv("AUDIT_ALLOW_PRIVATE", "1");
    vi.stubEnv("NODE_ENV", "development");
    const r = validateUrlForFetch("http://127.0.0.1:4000/");
    expect(r.ok).toBe(true);
  });
});
