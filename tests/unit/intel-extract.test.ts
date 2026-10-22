import { describe, it, expect } from "vitest";
import {
  canonicalizeSocialUrl,
  extractCompanyIntel,
  extractLinks,
  extractPeople,
  isPlausibleName,
  isPlausiblePhone,
  normalizePhone,
  parseJsonLd,
  parsePageHtml,
} from "@/lib/intel/extract";

const FINAL_URL = "https://example.com/about";

describe("parseJsonLd", () => {
  it("extracts a single JSON-LD block", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type":"Organization","name":"Acme","email":"info@acme.com"}
        </script>
      </head></html>`;
    const doc = parsePageHtml(html);
    const items = parseJsonLd(doc);
    expect(items).toHaveLength(1);
    expect(items[0]!["@type"]).toBe("Organization");
    expect(items[0]!["name"]).toBe("Acme");
  });

  it("unwraps @graph arrays", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@graph":[{"@type":"Organization","name":"Acme"},{"@type":"Person","name":"Alice"}]}
        </script>
      </head></html>`;
    const doc = parsePageHtml(html);
    const items = parseJsonLd(doc);
    expect(items).toHaveLength(2);
    expect(items[0]!["name"]).toBe("Acme");
    expect(items[1]!["name"]).toBe("Alice");
  });

  it("tolerates malformed JSON", () => {
    const html = `<script type="application/ld+json">{broken</script>`;
    const doc = parsePageHtml(html);
    expect(parseJsonLd(doc)).toEqual([]);
  });
});

describe("extractCompanyIntel", () => {
  it("prefers JSON-LD Organization over meta tags", () => {
    const html = `
      <html><head>
        <title>Marketing fluff</title>
        <meta property="og:site_name" content="Fluffy OG Name" />
        <script type="application/ld+json">
          {"@type":"Organization","name":"Acme Pvt Ltd","description":"We make widgets",
           "email":"hello@acme.com","telephone":"+91 22 1234 5678",
           "address":{"addressLocality":"Mumbai","addressRegion":"MH","addressCountry":"IN"}}
        </script>
      </head><body></body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.domain).toBe("example.com");
    expect(intel.name).toBe("Acme Pvt Ltd");
    expect(intel.description).toBe("We make widgets");
    expect(intel.emails).toContain("hello@acme.com");
    expect(intel.phones.length).toBeGreaterThan(0);
    expect(intel.city).toBe("Mumbai");
    expect(intel.region).toBe("MH");
    expect(intel.country).toBe("IN");
  });

  it("picks up mailto / tel anchors even without JSON-LD", () => {
    const html = `
      <html><body>
        <a href="mailto:ceo@acme.com">Email us</a>
        <a href="tel:+91-9876543210">Call</a>
      </body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.emails).toContain("ceo@acme.com");
    expect(intel.phones.some((p) => p.includes("9876543210"))).toBe(true);
  });

  it("collects social URLs from the body", () => {
    const html = `
      <html><body>
        <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
        <a href="https://twitter.com/acme">Twitter</a>
        <a href="https://example.com/not-social">Internal</a>
      </body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.socialUrls).toHaveLength(2);
    expect(intel.socialUrls.some((u) => u.includes("linkedin.com"))).toBe(true);
    // twitter.com now canonicalized to x.com per Stream D's rules
    expect(intel.socialUrls.some((u) => u.includes("x.com"))).toBe(true);
  });

  it("detects common tech signatures", () => {
    const html = `
      <html><body>
        <script src="/_next/static/chunks/foo.js"></script>
        <link href="/cdn.shopify.com/foo.css" />
      </body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.techIndicators).toContain("Next.js");
    expect(intel.techIndicators).toContain("Shopify");
  });

  it("deduplicates emails + phones", () => {
    const html = `
      <html><body>
        hello@acme.com <a href="mailto:hello@acme.com">write</a>
        <p>+91 22 1234 5678</p><p>+91 22 1234 5678</p>
      </body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.emails.filter((e) => e === "hello@acme.com")).toHaveLength(1);
  });
});

describe("extractPeople", () => {
  it("extracts JSON-LD Person items", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          [{"@type":"Person","name":"Priya Sharma","jobTitle":"Founder & CEO"},
           {"@type":"Person","name":"Rohan Mehta","jobTitle":"CTO"}]
        </script>
      </head></html>`;
    const people = extractPeople(parsePageHtml(html), FINAL_URL);
    expect(people).toHaveLength(2);
    expect(people[0]!.fullName).toBe("Priya Sharma");
    expect(people[0]!.confidence).toBe("high");
    expect(people[1]!.jobTitle).toBe("CTO");
  });

  it("extracts 'Name — Title' heading patterns on team pages", () => {
    const html = `
      <html><body>
        <h3>Anita Rao — Head of Marketing</h3>
        <h3>Boring Heading</h3>
        <h2>Vikram Singh, Managing Director</h2>
      </body></html>`;
    const people = extractPeople(parsePageHtml(html), FINAL_URL);
    const names = people.map((p) => p.fullName).sort();
    expect(names).toContain("Anita Rao");
    expect(names).toContain("Vikram Singh");
    expect(names).not.toContain("Boring Heading");
  });

  it("records the sourceUrl on every extracted person", () => {
    const html = `<h3>Priya Sharma - Founder</h3>`;
    const people = extractPeople(parsePageHtml(html), FINAL_URL);
    expect(people[0]?.sourceUrl).toBe(FINAL_URL);
  });

  it("never invents a person — returns empty when no match", () => {
    const html = `<html><body><p>Welcome to our site.</p></body></html>`;
    const people = extractPeople(parsePageHtml(html), FINAL_URL);
    expect(people).toEqual([]);
  });
});

describe("extractLinks", () => {
  it("keeps same-domain priority paths with higher weight", () => {
    const html = `
      <html><body>
        <a href="/about">About</a>
        <a href="/team">Team</a>
        <a href="/blog/post-1">Random</a>
        <a href="https://external.example/other">External</a>
      </body></html>`;
    const links = extractLinks(parsePageHtml(html), FINAL_URL, "example.com");
    expect(links.find((l) => l.url.endsWith("/about"))?.priority).toBeGreaterThan(1);
    expect(links.find((l) => l.url.endsWith("/team"))?.priority).toBeGreaterThan(1);
    expect(links.find((l) => l.url.endsWith("/post-1"))?.priority).toBe(1);
    expect(links.some((l) => l.url.includes("external.example"))).toBe(false);
  });

  it("skips binary/asset extensions", () => {
    const html = `
      <html><body>
        <a href="/doc.pdf">PDF</a>
        <a href="/image.png">PNG</a>
        <a href="/clean-path">OK</a>
      </body></html>`;
    const links = extractLinks(parsePageHtml(html), FINAL_URL, "example.com");
    expect(links.some((l) => l.url.endsWith(".pdf"))).toBe(false);
    expect(links.some((l) => l.url.endsWith(".png"))).toBe(false);
    expect(links.some((l) => l.url.endsWith("/clean-path"))).toBe(true);
  });
});

/* ---------- Stream-D backports: strict phones, canonical social, people v2 */

describe("isPlausiblePhone (strict mode)", () => {
  it("accepts +prefixed international numbers from body text", () => {
    expect(isPlausiblePhone("+91 22 1234 5678")).toBe(true);
    expect(isPlausiblePhone("+1 (415) 555 0100")).toBe(true);
  });

  it("accepts digits-only strings only when originating from a tel: href", () => {
    expect(isPlausiblePhone("9876543210", { fromTel: true })).toBe(true);
    expect(isPlausiblePhone("9876543210")).toBe(false);
  });

  it("rejects FSSAI-shaped license fragments (the sumosta regression)", () => {
    // These were extracted as phones by the old body-text regex:
    expect(isPlausiblePhone("8241475")).toBe(false);
    expect(isPlausiblePhone("1840-93373")).toBe(false);
    expect(isPlausiblePhone("64 155 64 155")).toBe(false);
    expect(isPlausiblePhone("0473762")).toBe(false);
  });

  it("rejects strings outside the 8–15 digit range", () => {
    expect(isPlausiblePhone("+123")).toBe(false);
    expect(isPlausiblePhone("+1234567890123456")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("preserves leading + and strips formatting", () => {
    expect(normalizePhone("+91 22 1234-5678")).toBe("+912212345678");
    expect(normalizePhone("+1 (415) 555.0100")).toBe("+14155550100");
  });
  it("falls back to digits-only when no plus", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
  });
});

describe("tel: anchor phone extraction honors strict mode", () => {
  it("rejects a tel: anchor whose payload fails isPlausiblePhone", () => {
    const html = `<html><body><a href="tel:12">x</a></body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.phones).toEqual([]);
  });

  it("accepts a valid tel: anchor", () => {
    const html = `<html><body><a href="tel:+919876543210">call</a></body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.phones).toContain("+919876543210");
  });

  it("ignores free-text phone-shaped numbers in body (sumosta regression)", () => {
    const html = `<html><body>FSSAI License: 8241475. Lic 1840-93373.</body></html>`;
    const intel = extractCompanyIntel(parsePageHtml(html), FINAL_URL, html);
    expect(intel.phones).toEqual([]);
  });
});

describe("canonicalizeSocialUrl", () => {
  it("collapses Instagram variants to a single canonical form", () => {
    expect(canonicalizeSocialUrl("https://www.instagram.com/sumosta/"))
      .toBe("https://www.instagram.com/sumosta");
    expect(canonicalizeSocialUrl("https://instagram.com/sumosta?igsi=abc"))
      .toBe("https://www.instagram.com/sumosta");
  });

  it("keeps distinct handles distinct", () => {
    expect(canonicalizeSocialUrl("https://instagram.com/sumosta"))
      .not.toBe(canonicalizeSocialUrl("https://instagram.com/sumosta.in"));
  });

  it("canonicalizes twitter.com and x.com to x.com", () => {
    expect(canonicalizeSocialUrl("https://twitter.com/acme")).toBe("https://x.com/acme");
    expect(canonicalizeSocialUrl("https://x.com/acme")).toBe("https://x.com/acme");
  });

  it("rejects reserved paths (login, share, etc.)", () => {
    expect(canonicalizeSocialUrl("https://twitter.com/intent/tweet")).toBe(null);
    expect(canonicalizeSocialUrl("https://facebook.com/sharer/x")).toBe(null);
    expect(canonicalizeSocialUrl("https://instagram.com/accounts/login")).toBe(null);
  });

  it("canonicalizes LinkedIn company + personal paths", () => {
    expect(canonicalizeSocialUrl("https://www.linkedin.com/company/Acme/about"))
      .toBe("https://www.linkedin.com/company/acme");
    expect(canonicalizeSocialUrl("https://linkedin.com/in/Priya-Sharma/"))
      .toBe("https://www.linkedin.com/in/priya-sharma");
  });

  it("returns null for non-social URLs", () => {
    expect(canonicalizeSocialUrl("https://example.com/foo")).toBe(null);
  });
});

describe("isPlausibleName", () => {
  it("accepts 2–4-word capitalized names", () => {
    expect(isPlausibleName("Priya Sharma")).toBe(true);
    expect(isPlausibleName("Anita D'Souza")).toBe(true);
    expect(isPlausibleName("Vikram Chandra Rao")).toBe(true);
  });
  it("rejects single words and sentences", () => {
    expect(isPlausibleName("Priya")).toBe(false);
    expect(isPlausibleName("Welcome to our site")).toBe(false);
  });
  it("rejects strings containing digits", () => {
    expect(isPlausibleName("Priya 2024")).toBe(false);
  });
});

describe("extractPeople v2 — card and figure patterns", () => {
  it("extracts from a team-member card with sibling name + title", () => {
    const html = `
      <html><body>
        <div class="team-member">
          <h3>Priya Sharma</h3>
          <p>Head of Marketing</p>
        </div>
      </body></html>`;
    const people = extractPeople(parsePageHtml(html), FINAL_URL);
    expect(people.some((p) => p.fullName === "Priya Sharma")).toBe(true);
  });

  it("extracts from a figure/figcaption pair", () => {
    const html = `
      <html><body>
        <figure>
          <img src="/x.jpg" alt="">
          <figcaption>Rohan Mehta — Chief Technology Officer</figcaption>
        </figure>
      </body></html>`;
    const people = extractPeople(parsePageHtml(html), FINAL_URL);
    expect(people.some((p) => p.fullName === "Rohan Mehta")).toBe(true);
  });

  it("does not double-extract when the same person appears via multiple patterns", () => {
    const html = `
      <html><body>
        <h3>Anita Rao — Head of Marketing</h3>
        <div class="team-member">
          <h4>Anita Rao</h4>
          <p>Head of Marketing</p>
        </div>
      </body></html>`;
    const people = extractPeople(parsePageHtml(html), FINAL_URL);
    expect(people.filter((p) => p.fullName === "Anita Rao")).toHaveLength(1);
  });
});
