import { afterEach, describe, expect, it } from "vitest";
import {
  discoverSitemapAndRobots,
  fetchRobotsTxt,
  fetchSitemapUrls,
  isPathDisallowed,
  parseRobotsTxt,
  parseSitemapBody,
} from "@/lib/intel/discovery";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Build a Response that `auditFetch` will accept — the fetcher rejects
 * non-HTML content types, so our fixtures either declare `text/html` or
 * leave the header empty (which `auditFetch` treats as HTML).
 */
function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function notFoundResponse(): Response {
  return new Response("not found", { status: 404 });
}

// ---------- pure parsers ----------

describe("parseRobotsTxt", () => {
  it("collects disallow prefixes under User-agent: *", () => {
    const { disallowed, sitemapUrls } = parseRobotsTxt(
      [
        "User-agent: *",
        "Disallow: /admin",
        "Disallow: /private/",
        "Allow: /public",
        "",
        "User-agent: BadBot",
        "Disallow: /",
        "",
        "Sitemap: https://example.com/sitemap.xml",
      ].join("\n")
    );
    expect(disallowed).toEqual(["/admin", "/private/"]);
    expect(sitemapUrls).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("ignores comments and blank lines", () => {
    const info = parseRobotsTxt(
      [
        "# This is a comment",
        "User-agent: *",
        "Disallow: /secret  # inline comment",
        "",
        "   ",
      ].join("\n")
    );
    expect(info.disallowed).toEqual(["/secret"]);
  });

  it("ignores empty-value disallow (which means allow all)", () => {
    const info = parseRobotsTxt(
      ["User-agent: *", "Disallow:"].join("\n")
    );
    expect(info.disallowed).toEqual([]);
  });

  it("returns empty for a blank file", () => {
    const info = parseRobotsTxt("");
    expect(info.disallowed).toEqual([]);
    expect(info.sitemapUrls).toEqual([]);
  });

  it("deduplicates sitemap URLs", () => {
    const info = parseRobotsTxt(
      [
        "Sitemap: https://x.example/sitemap.xml",
        "Sitemap: https://x.example/sitemap.xml",
      ].join("\n")
    );
    expect(info.sitemapUrls).toEqual(["https://x.example/sitemap.xml"]);
  });
});

describe("parseSitemapBody", () => {
  it("extracts <url><loc> entries from a URL set", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>https://ex.com/a</loc></url>
        <url><loc>https://ex.com/b</loc></url>
      </urlset>`;
    const parsed = parseSitemapBody(xml);
    expect(parsed.urls).toEqual(["https://ex.com/a", "https://ex.com/b"]);
    expect(parsed.childSitemaps).toEqual([]);
  });

  it("extracts child sitemaps from a sitemap-index", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex>
        <sitemap><loc>https://ex.com/sitemaps/one.xml</loc></sitemap>
        <sitemap><loc>https://ex.com/sitemaps/two.xml</loc></sitemap>
      </sitemapindex>`;
    const parsed = parseSitemapBody(xml);
    expect(parsed.childSitemaps).toEqual([
      "https://ex.com/sitemaps/one.xml",
      "https://ex.com/sitemaps/two.xml",
    ]);
    expect(parsed.urls).toEqual([]);
  });

  it("decodes &amp; entities in <loc> values", () => {
    const xml = `
      <urlset>
        <url><loc>https://ex.com/search?q=a&amp;b=1</loc></url>
      </urlset>`;
    const parsed = parseSitemapBody(xml);
    expect(parsed.urls[0]!).toBe("https://ex.com/search?q=a&b=1");
  });
});

// ---------- isPathDisallowed ----------

describe("isPathDisallowed", () => {
  it("returns false when disallow list is empty", () => {
    expect(isPathDisallowed("https://x.com/foo", [])).toBe(false);
  });

  it("matches by case-sensitive prefix", () => {
    expect(isPathDisallowed("https://x.com/admin/users", ["/admin"])).toBe(true);
    expect(isPathDisallowed("https://x.com/Admin/users", ["/admin"])).toBe(false);
  });

  it("does not match when prefix is unrelated", () => {
    expect(isPathDisallowed("https://x.com/public", ["/admin"])).toBe(false);
  });

  it("returns false for malformed URLs", () => {
    expect(isPathDisallowed("::::", ["/x"])).toBe(false);
  });

  it("matches against query string when prefix includes a '?'", () => {
    expect(
      isPathDisallowed("https://x.com/search?q=secret", ["/search?q=secret"])
    ).toBe(true);
  });
});

// ---------- fetchRobotsTxt ----------

describe("fetchRobotsTxt", () => {
  it("fetches /robots.txt and returns parsed data", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      seen.push(url);
      if (url.endsWith("/robots.txt")) {
        return htmlResponse(
          [
            "User-agent: *",
            "Disallow: /cart",
            "Sitemap: https://shop.example/sitemap.xml",
          ].join("\n")
        );
      }
      return notFoundResponse();
    }) as typeof fetch;

    const info = await fetchRobotsTxt("https://shop.example/some/path");
    expect(seen).toContain("https://shop.example/robots.txt");
    expect(info.disallowed).toEqual(["/cart"]);
    expect(info.sitemapUrls).toEqual(["https://shop.example/sitemap.xml"]);
  });

  it("returns empty values when robots.txt is missing (404)", async () => {
    globalThis.fetch = (async () => notFoundResponse()) as typeof fetch;
    const info = await fetchRobotsTxt("https://nope.example/");
    expect(info.disallowed).toEqual([]);
    expect(info.sitemapUrls).toEqual([]);
  });

  it("returns empty values when the seed URL is unparseable", async () => {
    const info = await fetchRobotsTxt("not a url");
    expect(info.disallowed).toEqual([]);
    expect(info.sitemapUrls).toEqual([]);
  });

  it("returns empty values when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    const info = await fetchRobotsTxt("https://err.example/");
    expect(info.disallowed).toEqual([]);
    expect(info.sitemapUrls).toEqual([]);
  });
});

// ---------- fetchSitemapUrls ----------

describe("fetchSitemapUrls", () => {
  it("returns <loc> URLs from a flat sitemap", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith("/sitemap.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://ex.com/a</loc></url>
             <url><loc>https://ex.com/b</loc></url>
             <url><loc>https://ex.com/c</loc></url>
           </urlset>`
        );
      }
      return notFoundResponse();
    }) as typeof fetch;

    const urls = await fetchSitemapUrls("https://ex.com/sitemap.xml", 10);
    expect(urls).toEqual([
      "https://ex.com/a",
      "https://ex.com/b",
      "https://ex.com/c",
    ]);
  });

  it("follows a sitemap-index one level deep", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith("/sitemap.xml")) {
        return htmlResponse(
          `<sitemapindex>
             <sitemap><loc>https://ex.com/sitemaps/one.xml</loc></sitemap>
             <sitemap><loc>https://ex.com/sitemaps/two.xml</loc></sitemap>
           </sitemapindex>`
        );
      }
      if (url.endsWith("/sitemaps/one.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://ex.com/1</loc></url>
             <url><loc>https://ex.com/2</loc></url>
           </urlset>`
        );
      }
      if (url.endsWith("/sitemaps/two.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://ex.com/3</loc></url>
           </urlset>`
        );
      }
      return notFoundResponse();
    }) as typeof fetch;

    const urls = await fetchSitemapUrls("https://ex.com/sitemap.xml", 10);
    expect(urls).toContain("https://ex.com/1");
    expect(urls).toContain("https://ex.com/2");
    expect(urls).toContain("https://ex.com/3");
    expect(urls).toHaveLength(3);
  });

  it("does not recurse past one level (sitemap-of-sitemap-of-sitemap bail out)", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      // Each level is itself a sitemap-index. We expect only one recursion.
      if (url.endsWith("/sitemap.xml")) {
        return htmlResponse(
          `<sitemapindex>
             <sitemap><loc>https://ex.com/level2.xml</loc></sitemap>
           </sitemapindex>`
        );
      }
      if (url.endsWith("/level2.xml")) {
        return htmlResponse(
          `<sitemapindex>
             <sitemap><loc>https://ex.com/level3.xml</loc></sitemap>
           </sitemapindex>`
        );
      }
      if (url.endsWith("/level3.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://ex.com/deep</loc></url>
           </urlset>`
        );
      }
      return notFoundResponse();
    }) as typeof fetch;

    const urls = await fetchSitemapUrls("https://ex.com/sitemap.xml", 10);
    // Level 3 is NOT followed — recursion is capped at depth 1.
    expect(urls).not.toContain("https://ex.com/deep");
    expect(urls).toHaveLength(0);
  });

  it("enforces the maxUrls cap", async () => {
    globalThis.fetch = (async () =>
      htmlResponse(
        `<urlset>
           <url><loc>https://ex.com/1</loc></url>
           <url><loc>https://ex.com/2</loc></url>
           <url><loc>https://ex.com/3</loc></url>
           <url><loc>https://ex.com/4</loc></url>
           <url><loc>https://ex.com/5</loc></url>
         </urlset>`
      )) as typeof fetch;

    const urls = await fetchSitemapUrls("https://ex.com/sitemap.xml", 2);
    expect(urls).toHaveLength(2);
  });

  it("enforces maxUrls across sitemap-index children", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith("/sitemap.xml")) {
        return htmlResponse(
          `<sitemapindex>
             <sitemap><loc>https://ex.com/one.xml</loc></sitemap>
             <sitemap><loc>https://ex.com/two.xml</loc></sitemap>
           </sitemapindex>`
        );
      }
      if (url.endsWith("/one.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://ex.com/a1</loc></url>
             <url><loc>https://ex.com/a2</loc></url>
             <url><loc>https://ex.com/a3</loc></url>
           </urlset>`
        );
      }
      if (url.endsWith("/two.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://ex.com/b1</loc></url>
           </urlset>`
        );
      }
      return notFoundResponse();
    }) as typeof fetch;

    const urls = await fetchSitemapUrls("https://ex.com/sitemap.xml", 2);
    expect(urls).toHaveLength(2);
  });

  it("returns empty when sitemap is missing", async () => {
    globalThis.fetch = (async () => notFoundResponse()) as typeof fetch;
    const urls = await fetchSitemapUrls("https://ex.com/sitemap.xml", 5);
    expect(urls).toEqual([]);
  });

  it("returns empty when maxUrls <= 0", async () => {
    // Should short-circuit without issuing a fetch.
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return htmlResponse("<urlset></urlset>");
    }) as typeof fetch;
    const urls = await fetchSitemapUrls("https://ex.com/sitemap.xml", 0);
    expect(urls).toEqual([]);
    expect(fetched).toBe(false);
  });
});

// ---------- discoverSitemapAndRobots (convenience) ----------

describe("discoverSitemapAndRobots", () => {
  it("merges robots.txt disallow + sitemap URLs", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith("/robots.txt")) {
        return htmlResponse(
          [
            "User-agent: *",
            "Disallow: /private",
            "Sitemap: https://shop.example/custom-sitemap.xml",
          ].join("\n")
        );
      }
      if (url.endsWith("/custom-sitemap.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://shop.example/one</loc></url>
             <url><loc>https://shop.example/two</loc></url>
           </urlset>`
        );
      }
      // Conventional fallback — no file.
      if (url.endsWith("/sitemap.xml")) return notFoundResponse();
      return notFoundResponse();
    }) as typeof fetch;

    const info = await discoverSitemapAndRobots("https://shop.example/", 10);
    expect(info.disallowed).toEqual(["/private"]);
    expect(info.sitemapUrls).toEqual([
      "https://shop.example/custom-sitemap.xml",
    ]);
    expect(info.discoveredUrls).toEqual([
      "https://shop.example/one",
      "https://shop.example/two",
    ]);
  });

  it("falls back to /sitemap.xml when robots.txt lists no sitemap", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith("/robots.txt")) {
        return htmlResponse(["User-agent: *", "Disallow: /x"].join("\n"));
      }
      if (url.endsWith("/sitemap.xml")) {
        return htmlResponse(
          `<urlset><url><loc>https://plain.example/a</loc></url></urlset>`
        );
      }
      return notFoundResponse();
    }) as typeof fetch;

    const info = await discoverSitemapAndRobots("https://plain.example/", 10);
    expect(info.disallowed).toEqual(["/x"]);
    expect(info.discoveredUrls).toEqual(["https://plain.example/a"]);
  });

  it("returns empty values when both robots.txt and sitemap.xml are missing", async () => {
    globalThis.fetch = (async () => notFoundResponse()) as typeof fetch;
    const info = await discoverSitemapAndRobots("https://ghost.example/", 10);
    expect(info.disallowed).toEqual([]);
    expect(info.sitemapUrls).toEqual([]);
    expect(info.discoveredUrls).toEqual([]);
  });

  it("respects the maxUrls cap in the aggregate", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith("/robots.txt")) {
        return htmlResponse("");
      }
      if (url.endsWith("/sitemap.xml")) {
        return htmlResponse(
          `<urlset>
             <url><loc>https://big.example/1</loc></url>
             <url><loc>https://big.example/2</loc></url>
             <url><loc>https://big.example/3</loc></url>
             <url><loc>https://big.example/4</loc></url>
             <url><loc>https://big.example/5</loc></url>
           </urlset>`
        );
      }
      return notFoundResponse();
    }) as typeof fetch;

    const info = await discoverSitemapAndRobots("https://big.example/", 3);
    expect(info.discoveredUrls).toHaveLength(3);
  });

  it("never throws when the seed URL is unparseable", async () => {
    const info = await discoverSitemapAndRobots("not a url", 5);
    expect(info.disallowed).toEqual([]);
    expect(info.sitemapUrls).toEqual([]);
    expect(info.discoveredUrls).toEqual([]);
  });
});
