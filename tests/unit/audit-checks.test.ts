import { describe, it, expect } from "vitest";
import { parseAuditHtml, runAllChecks } from "@/lib/audit/checks";
import { deriveWebsiteCondition } from "@/lib/audit/engine";

const BASE_CTX = {
  finalUrl: "https://example.com/",
  requestedUrl: "https://example.com/",
  bodyBytes: 50_000,
  elapsedMs: 400,
};

function run(html: string, overrides: Partial<typeof BASE_CTX> = {}) {
  const doc = parseAuditHtml(html);
  return runAllChecks(doc, {
    ...BASE_CTX,
    html,
    ...overrides,
  });
}

describe("audit checks — HTTPS", () => {
  it("does not flag HTTPS pages", () => {
    const findings = run("<html><head><title>Ok Site</title></head><body><h1>Hi</h1></body></html>");
    expect(findings.find((f) => f.code === "no_https")).toBeUndefined();
  });

  it("flags HTTP pages with high severity", () => {
    const findings = run(
      "<html><head><title>Ok Site</title></head><body><h1>Hi</h1></body></html>",
      { finalUrl: "http://example.com/" }
    );
    const https = findings.find((f) => f.code === "no_https");
    expect(https).toBeDefined();
    expect(https?.severity).toBe("high");
  });
});

describe("audit checks — title + meta description + viewport", () => {
  it("flags missing title / description / viewport", () => {
    const findings = run("<html><head></head><body><h1>Hi</h1></body></html>");
    expect(findings.find((f) => f.code === "no_title")).toBeDefined();
    expect(findings.find((f) => f.code === "no_meta_description")).toBeDefined();
    expect(findings.find((f) => f.code === "missing_viewport")).toBeDefined();
  });

  it("accepts a well-formed head", () => {
    const findings = run(
      `<html><head>
        <title>Haveli Fine Jewels</title>
        <meta name="description" content="Mumbai-based heritage jewellery studio.">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head><body><h1>Haveli Fine Jewels</h1><a href="mailto:hi@example.com">Email</a></body></html>`
    );
    expect(findings.find((f) => f.code === "no_title")).toBeUndefined();
    expect(findings.find((f) => f.code === "no_meta_description")).toBeUndefined();
    expect(findings.find((f) => f.code === "missing_viewport")).toBeUndefined();
  });

  it("warns on suspiciously short titles", () => {
    const findings = run("<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>");
    expect(findings.find((f) => f.code === "title_too_short")).toBeDefined();
  });

  it("warns on unusually long titles", () => {
    const long = "a".repeat(140);
    const findings = run(
      `<html><head><title>${long}</title></head><body><h1>Hi</h1></body></html>`
    );
    expect(findings.find((f) => f.code === "title_too_long")).toBeDefined();
  });
});

describe("audit checks — headings", () => {
  it("flags a page with no h1", () => {
    const findings = run(
      "<html><head><title>Ok</title></head><body><h2>Sub</h2></body></html>"
    );
    expect(findings.find((f) => f.code === "no_h1")).toBeDefined();
  });

  it("notes multiple h1s", () => {
    const findings = run(
      "<html><head><title>Ok</title></head><body><h1>A</h1><h1>B</h1></body></html>"
    );
    expect(findings.find((f) => f.code === "multiple_h1")).toBeDefined();
  });
});

describe("audit checks — image alt text", () => {
  it("flags when most images are missing alt", () => {
    const imgs = Array.from(
      { length: 10 },
      (_, i) => `<img src="/img${i}.jpg"${i < 2 ? ` alt="described"` : ""}>`
    ).join("");
    const findings = run(
      `<html><head><title>Ok</title></head><body><h1>Hi</h1>${imgs}</body></html>`
    );
    const missing = findings.find((f) => f.code === "missing_alt_text");
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("medium");
  });

  it("passes when every sampled image has alt", () => {
    const imgs = Array.from(
      { length: 5 },
      (_, i) => `<img src="/img${i}.jpg" alt="described">`
    ).join("");
    const findings = run(
      `<html><head><title>Ok</title></head><body><h1>Hi</h1>${imgs}</body></html>`
    );
    expect(findings.find((f) => f.code === "missing_alt_text")).toBeUndefined();
  });

  it("accepts an empty alt attribute as a valid decorative marker", () => {
    const findings = run(
      `<html><head><title>Ok</title></head><body><h1>Hi</h1>
       <img src="/a.jpg" alt="">
       <img src="/b.jpg" alt="">
      </body></html>`
    );
    expect(findings.find((f) => f.code === "missing_alt_text")).toBeUndefined();
  });
});

describe("audit checks — contact path", () => {
  it("flags a page with no email / phone / contact-link", () => {
    const findings = run(
      `<html><head><title>Ok</title></head><body><h1>Hi</h1><a href="/about">About</a></body></html>`
    );
    expect(findings.find((f) => f.code === "weak_contact_path")).toBeDefined();
  });

  it("accepts a mailto link", () => {
    const findings = run(
      `<html><head><title>Ok</title></head><body><h1>Hi</h1><a href="mailto:hi@example.com">Say hi</a></body></html>`
    );
    expect(findings.find((f) => f.code === "weak_contact_path")).toBeUndefined();
  });

  it("accepts a tel: link", () => {
    const findings = run(
      `<html><head><title>Ok</title></head><body><h1>Hi</h1><a href="tel:+919820012345">Call</a></body></html>`
    );
    expect(findings.find((f) => f.code === "weak_contact_path")).toBeUndefined();
  });

  it("accepts a /contact-style page link", () => {
    const findings = run(
      `<html><head><title>Ok</title></head><body><h1>Hi</h1><a href="/contact">Contact us</a></body></html>`
    );
    expect(findings.find((f) => f.code === "weak_contact_path")).toBeUndefined();
  });
});

describe("audit checks — page weight", () => {
  it("flags heavy pages above the threshold", () => {
    const findings = run("<html><head><title>Ok</title></head><body><h1>Hi</h1></body></html>", {
      bodyBytes: 1_800_000,
    });
    expect(findings.find((f) => f.code === "heavy_page")).toBeDefined();
  });
  it("ignores pages at or below 1.2 MB", () => {
    const findings = run("<html><head><title>Ok</title></head><body><h1>Hi</h1></body></html>", {
      bodyBytes: 400_000,
    });
    expect(findings.find((f) => f.code === "heavy_page")).toBeUndefined();
  });
});

describe("deriveWebsiteCondition", () => {
  it('returns "strong" when there are no findings', () => {
    expect(deriveWebsiteCondition([])).toBe("strong");
  });

  it('maps >=2 high-severity findings to "weak"', () => {
    expect(
      deriveWebsiteCondition([
        makeFinding("high"),
        makeFinding("high"),
        makeFinding("low"),
      ])
    ).toBe("weak");
  });

  it('maps a single high-severity finding to "outdated"', () => {
    expect(deriveWebsiteCondition([makeFinding("high")])).toBe("outdated");
  });

  it('maps a cluster of medium findings to "outdated"', () => {
    expect(
      deriveWebsiteCondition([
        makeFinding("medium"),
        makeFinding("medium"),
        makeFinding("medium"),
      ])
    ).toBe("outdated");
  });

  it('maps a single medium finding to "acceptable"', () => {
    expect(deriveWebsiteCondition([makeFinding("medium")])).toBe("acceptable");
  });

  it('maps info-only findings to "strong"', () => {
    expect(
      deriveWebsiteCondition([makeFinding("info"), makeFinding("info")])
    ).toBe("strong");
  });
});

function makeFinding(severity: "info" | "low" | "medium" | "high") {
  return {
    code: "x",
    title: "x",
    severity,
    description: "x",
    confidence: "high" as const,
    recommendation: "x",
  };
}
