import { describe, it, expect, afterEach } from "vitest";
import { crawlSite } from "@/lib/intel/crawler";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Mock a tiny two-page site so we exercise:
 *   - seed fetch
 *   - link discovery (/about)
 *   - priority-path handling
 *   - JSON-LD + mailto extraction
 *   - the per-page onPage callback
 */
function mockSite() {
  const home = `
    <html>
      <head>
        <title>Acme Jewels</title>
        <meta name="description" content="Mumbai heritage brand">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="canonical" href="https://acme.example/">
        <script type="application/ld+json">
          {"@type":"Organization","name":"Acme Jewels",
           "email":"info@acme.example","telephone":"+91 22 1234 5678"}
        </script>
      </head>
      <body>
        <h1>Fine Jewellery</h1>
        <a href="/about">About</a>
        <a href="https://directoryspam.example/other">External</a>
        <a href="mailto:info@acme.example">write</a>
        <a href="/contact">Contact us</a>
      </body>
    </html>`;
  const about = `
    <html>
      <head><title>About us</title>
        <meta name="description" content="Our team">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="canonical" href="https://acme.example/about">
      </head>
      <body>
        <h1>Our Team</h1>
        <h3>Priya Sharma — Founder & CEO</h3>
        <h3>Rohan Mehta — CTO</h3>
      </body>
    </html>`;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/about")) {
      return new Response(about, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.endsWith("acme.example/") || url.endsWith("acme.example")) {
      return new Response(home, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("crawlSite", () => {
  it("walks the seed + priority /about link and extracts intel + people", async () => {
    mockSite();
    const outcome = await crawlSite(
      { seedUrl: "https://acme.example/" },
      { maxPages: 5, maxDepth: 2, perDomainCap: 5, totalBudgetMs: 15_000 }
    );
    expect(outcome.pages.length).toBeGreaterThanOrEqual(2);
    expect(outcome.pages[0]!.status).toBe("fetched");
    expect(outcome.intel.name).toBe("Acme Jewels");
    expect(outcome.intel.emails).toContain("info@acme.example");
    expect(outcome.people.map((p) => p.fullName).sort()).toEqual([
      "Priya Sharma",
      "Rohan Mehta",
    ]);
    // No findings on the homepage because every baseline passed.
    const homepageFinding = outcome.findings.find((f) => f.code === "intel_missing_title");
    expect(homepageFinding).toBeUndefined();
  });

  it("respects maxPages", async () => {
    mockSite();
    const outcome = await crawlSite(
      { seedUrl: "https://acme.example/" },
      { maxPages: 1, maxDepth: 2, perDomainCap: 5, totalBudgetMs: 15_000 }
    );
    expect(outcome.pages).toHaveLength(1);
  });

  it("blocks SSRF-bad seed URLs without issuing a fetch", async () => {
    // Note: Node fetch mock not needed — SSRF guard rejects before fetch.
    const outcome = await crawlSite({ seedUrl: "http://localhost/" }, { maxPages: 3 });
    expect(outcome.pages[0]!.status).toBe("blocked");
  });

  it("fires onPage for every processed URL", async () => {
    mockSite();
    const seen: string[] = [];
    await crawlSite(
      { seedUrl: "https://acme.example/" },
      {
        maxPages: 5,
        maxDepth: 2,
        perDomainCap: 5,
        totalBudgetMs: 15_000,
        onPage: (p) => {
          seen.push(p.url);
        },
      }
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});
