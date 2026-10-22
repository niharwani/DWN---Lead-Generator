import { describe, it, expect } from "vitest";
import { parsePageHtml } from "@/lib/intel/extract";
import { runIntelFindings } from "@/lib/intel/findings";
import type { CompanyIntel } from "@/lib/intel/types";

function emptyIntel(domain = "example.com"): CompanyIntel {
  return {
    domain,
    services: [],
    categories: [],
    emails: [],
    phones: [],
    socialUrls: [],
    techIndicators: [],
  };
}

describe("runIntelFindings", () => {
  it("flags a page missing title / meta description / viewport / canonical", () => {
    const html = `<html><head></head><body><h1>Hi</h1></body></html>`;
    const doc = parsePageHtml(html);
    const findings = runIntelFindings(doc, {
      finalUrl: "https://example.com/",
      html,
      bytes: html.length,
      intel: emptyIntel(),
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("intel_missing_title");
    expect(codes).toContain("intel_missing_meta_description");
    expect(codes).toContain("intel_missing_viewport");
    expect(codes).toContain("intel_missing_canonical");
  });

  it("flags non-HTTPS pages as high severity", () => {
    const html = `<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>`;
    const doc = parsePageHtml(html);
    const findings = runIntelFindings(doc, {
      finalUrl: "http://example.com/",
      html,
      bytes: html.length,
      intel: emptyIntel(),
    });
    const noHttps = findings.find((f) => f.code === "intel_no_https");
    expect(noHttps).toBeDefined();
    expect(noHttps?.severity).toBe("high");
  });

  it("does not flag HTTPS pages for the HTTPS check", () => {
    const html = `
      <html><head>
        <title>Clean</title>
        <meta name="description" content="A good page">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="canonical" href="https://example.com/">
        <script type="application/ld+json">{"@type":"Organization","name":"Clean"}</script>
      </head><body>
        <h1>Clean</h1>
        <a href="/contact">Contact us</a>
      </body></html>`;
    const doc = parsePageHtml(html);
    const findings = runIntelFindings(doc, {
      finalUrl: "https://example.com/",
      html,
      bytes: html.length,
      intel: { ...emptyIntel(), emails: ["hi@example.com"] },
    });
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("intel_no_https");
    expect(codes).not.toContain("intel_missing_cta");
    expect(codes).not.toContain("intel_no_contact_info");
    expect(codes).not.toContain("intel_missing_structured_data");
  });

  it("flags pages with no public contact info", () => {
    const html = `<html><head><title>Site</title></head><body></body></html>`;
    const doc = parsePageHtml(html);
    const findings = runIntelFindings(doc, {
      finalUrl: "https://example.com/",
      html,
      bytes: html.length,
      intel: emptyIntel(),
    });
    expect(findings.some((f) => f.code === "intel_no_contact_info")).toBe(true);
  });

  it("records affected URL + evidence on every finding", () => {
    const html = `<html><head></head><body></body></html>`;
    const doc = parsePageHtml(html);
    const findings = runIntelFindings(doc, {
      finalUrl: "https://example.com/about",
      html,
      bytes: html.length,
      intel: emptyIntel(),
    });
    for (const f of findings) {
      expect(f.evidenceUrl).toBe("https://example.com/about");
      expect(f.evidence).toBeTruthy();
      expect(f.recommendation).toBeTruthy();
    }
  });
});
