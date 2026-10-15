import { describe, it, expect } from "vitest";
import {
  clampScore,
  normalizeDomain,
  normalizeName,
  normalizeUrl,
  scoreBandFor,
} from "@/lib/db/normalize";

describe("normalizeDomain", () => {
  it("strips scheme + www + lowercases", () => {
    expect(normalizeDomain("https://www.Example.COM/path")).toBe("example.com");
    expect(normalizeDomain("http://FOO.example.test")).toBe("foo.example.test");
  });

  it("accepts bare domains by prefixing https", () => {
    expect(normalizeDomain("www.example.com")).toBe("example.com");
    expect(normalizeDomain("example.co.in")).toBe("example.co.in");
  });

  it("returns null for empty / whitespace / unparseable input", () => {
    expect(normalizeDomain(undefined)).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("not a url")).toBeNull();
    expect(normalizeDomain("https://")).toBeNull();
  });

  it("rejects non-http(s) schemes (defense against javascript: / file: etc)", () => {
    expect(normalizeDomain("javascript:alert(1)")).toBeNull();
    expect(normalizeDomain("file:///etc/passwd")).toBeNull();
    expect(normalizeDomain("ftp://example.com")).toBeNull();
  });

  it("keeps subdomains intact (except www)", () => {
    expect(normalizeDomain("https://app.example.com")).toBe("app.example.com");
    expect(normalizeDomain("https://www.app.example.com")).toBe("app.example.com");
  });
});

describe("normalizeUrl", () => {
  it("returns a canonical URL string without the trailing root slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("lowercases the host but preserves path case", () => {
    expect(normalizeUrl("https://Example.COM/MixedCase")).toBe(
      "https://example.com/MixedCase"
    );
  });

  it("adds https scheme for bare domains", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
  });

  it("rejects non-http(s) + unparseable input", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
  });
});

describe("normalizeName", () => {
  it("lowercases + collapses whitespace", () => {
    expect(normalizeName("  Haveli   Fine  Jewels  ")).toBe("haveli fine jewels");
  });

  it("strips trailing punctuation but keeps internal punctuation", () => {
    expect(normalizeName("Studio Verda Interiors.")).toBe("studio verda interiors");
    expect(normalizeName("O'Reilly & Sons!")).toBe("o'reilly & sons");
  });
});

describe("clampScore", () => {
  it("clamps negative values to 0", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(-0.1)).toBe(0);
  });

  it("clamps values above 100 to 100", () => {
    expect(clampScore(100.4)).toBe(100);
    expect(clampScore(250)).toBe(100);
  });

  it("rounds to the nearest integer within range", () => {
    expect(clampScore(72.4)).toBe(72);
    expect(clampScore(72.6)).toBe(73);
    expect(clampScore(0)).toBe(0);
    expect(clampScore(100)).toBe(100);
  });

  it("collapses non-finite values to 0", () => {
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampScore(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("scoreBandFor", () => {
  it("classifies the four numeric bands", () => {
    expect(scoreBandFor(85, "high")).toBe("priority_review");
    expect(scoreBandFor(80, "high")).toBe("priority_review");
    expect(scoreBandFor(79, "high")).toBe("strong_candidate");
    expect(scoreBandFor(60, "medium")).toBe("strong_candidate");
    expect(scoreBandFor(59, "medium")).toBe("needs_manual_review");
    expect(scoreBandFor(40, "low")).toBe("needs_manual_review");
    expect(scoreBandFor(39, "low")).toBe("low_priority");
    expect(scoreBandFor(0, "low")).toBe("low_priority");
  });

  it('always returns "insufficient_evidence" when confidence is insufficient', () => {
    // Even a numerically high score is treated as insufficient when the
    // confidence inputs don't support it.
    expect(scoreBandFor(90, "insufficient")).toBe("insufficient_evidence");
    expect(scoreBandFor(0, "insufficient")).toBe("insufficient_evidence");
  });

  it("clamps the input before classifying", () => {
    expect(scoreBandFor(150, "high")).toBe("priority_review"); // clamps to 100
    expect(scoreBandFor(-5, "high")).toBe("low_priority"); // clamps to 0
  });
});
