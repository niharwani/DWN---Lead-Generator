/**
 * Sitemap + robots.txt discovery for the Web Intelligence crawler.
 *
 * This module adds two first-class URL discovery sources on top of the
 * breadth-first link follower in `crawler.ts`:
 *
 *   1. `/robots.txt` — parsed with a tolerant line reader. We honor
 *      `Disallow:` prefixes under the `User-agent: *` block, and collect
 *      every `Sitemap:` URL (robots-level sitemaps live outside any UA
 *      block). We ignore wildcards and `$` anchors — simple prefix matching
 *      is enough for the crawl-politeness use case here and keeps the
 *      surface area small.
 *
 *   2. `/sitemap.xml` (plus any sitemap URLs discovered via robots.txt).
 *      Supports a sitemap-index with one level of recursion (max 5 child
 *      sitemaps). URLs are capped at `maxUrls` so a huge sitemap can't
 *      blow the crawl budget.
 *
 * Every HTTP request goes through `auditFetch` so SSRF rules, redirect
 * revalidation, timeout, and byte caps all apply. If a server returns a
 * non-HTML content-type (common for XML sitemaps) `auditFetch` reports
 * `non_html` and we treat it as "no data" — the crawl still succeeds via
 * link discovery. Likewise a 404 or network error is swallowed silently.
 */

import { parse as parseHtml } from "node-html-parser";
import { auditFetch } from "@/lib/audit/fetcher";

const MAX_CHILD_SITEMAPS = 5;

export type RobotsInfo = {
  disallowed: string[];
  sitemapUrls: string[];
};

/**
 * Fetch and parse `/robots.txt` for the seed origin. Returns empty arrays
 * when the file is missing, blocked, or malformed — the caller must never
 * depend on this throwing.
 */
export async function fetchRobotsTxt(seedUrl: string): Promise<RobotsInfo> {
  const origin = toOrigin(seedUrl);
  if (!origin) return { disallowed: [], sitemapUrls: [] };

  const target = `${origin}/robots.txt`;
  const result = await auditFetch(target);
  if (!result.ok) return { disallowed: [], sitemapUrls: [] };

  return parseRobotsTxt(result.html);
}

/**
 * Pure parser for robots.txt. Exported for direct unit testing without
 * mocking fetch. Only honors the `User-agent: *` block for `Disallow:`
 * directives; `Sitemap:` lines are collected regardless of block.
 */
export function parseRobotsTxt(body: string): RobotsInfo {
  const disallowed: string[] = [];
  const sitemapUrls: string[] = [];

  // State machine: are we currently inside a User-agent: * block?
  let inStarBlock = false;
  // Track whether we've seen any user-agent line yet — directives before
  // the first UA line apply to all agents by convention.
  let seenAnyUa = false;

  const lines = body.split(/\r?\n/);
  for (const raw of lines) {
    // Strip inline comments and trim.
    const hashAt = raw.indexOf("#");
    const line = (hashAt >= 0 ? raw.slice(0, hashAt) : raw).trim();
    if (!line) continue;

    const colonAt = line.indexOf(":");
    if (colonAt <= 0) continue;
    const directive = line.slice(0, colonAt).trim().toLowerCase();
    const value = line.slice(colonAt + 1).trim();
    if (!value) continue;

    if (directive === "user-agent") {
      seenAnyUa = true;
      inStarBlock = value === "*";
      continue;
    }

    if (directive === "sitemap") {
      sitemapUrls.push(value);
      continue;
    }

    if (directive === "disallow") {
      if (!seenAnyUa || inStarBlock) {
        // Empty value means "allow everything" — ignore. We only
        // record non-empty prefixes. Also ignore wildcard-only paths.
        if (value && value !== "*") {
          disallowed.push(value);
        }
      }
    }
  }

  return {
    disallowed: unique(disallowed),
    sitemapUrls: unique(sitemapUrls),
  };
}

/**
 * Fetch a sitemap (or sitemap-index) and return at most `maxUrls` child URLs.
 *
 * Sitemap-index support: if the fetched document contains `<sitemap>`
 * elements, we recurse into each child `<loc>` and collect its `<url><loc>`
 * entries. Recursion is limited to one level and at most
 * `MAX_CHILD_SITEMAPS` children — same-site sitemaps are allowed to grow
 * but we never follow more than that in a single run.
 */
export async function fetchSitemapUrls(
  sitemapUrl: string,
  maxUrls: number
): Promise<string[]> {
  if (maxUrls <= 0) return [];
  return fetchSitemapUrlsInternal(sitemapUrl, maxUrls, 0);
}

async function fetchSitemapUrlsInternal(
  sitemapUrl: string,
  maxUrls: number,
  depth: number
): Promise<string[]> {
  const result = await auditFetch(sitemapUrl);
  if (!result.ok) return [];

  const { childSitemaps, urls } = parseSitemapBody(result.html);

  // If this is a sitemap-index AND we haven't recursed yet, follow children.
  if (childSitemaps.length > 0 && depth === 0) {
    const collected: string[] = [...urls];
    const children = childSitemaps.slice(0, MAX_CHILD_SITEMAPS);
    for (const child of children) {
      if (collected.length >= maxUrls) break;
      const remaining = maxUrls - collected.length;
      const childUrls = await fetchSitemapUrlsInternal(child, remaining, depth + 1);
      for (const u of childUrls) {
        if (collected.length >= maxUrls) break;
        collected.push(u);
      }
    }
    return unique(collected).slice(0, maxUrls);
  }

  return unique(urls).slice(0, maxUrls);
}

/**
 * Pure sitemap XML parser. Exported for unit testing.
 *
 * node-html-parser treats XML tags as HTML — good enough for extracting
 * `<loc>` text. We distinguish a sitemap-index (contains `<sitemap>`
 * elements) from a URL set (contains `<url>` elements) so the caller can
 * recurse one level.
 */
export function parseSitemapBody(body: string): {
  childSitemaps: string[];
  urls: string[];
} {
  // node-html-parser lowercases tag names when `lowerCaseTagName: true`,
  // which lets us match both `<Loc>` and `<loc>` uniformly.
  const doc = parseHtml(body, {
    lowerCaseTagName: true,
    comment: false,
  });

  const childSitemaps: string[] = [];
  for (const sm of doc.querySelectorAll("sitemap")) {
    const loc = sm.querySelector("loc")?.text?.trim();
    if (loc) childSitemaps.push(decodeXmlEntities(loc));
  }

  const urls: string[] = [];
  for (const u of doc.querySelectorAll("url")) {
    const loc = u.querySelector("loc")?.text?.trim();
    if (loc) urls.push(decodeXmlEntities(loc));
  }

  // Fallback: if the parser didn't find a `<url>` structure (e.g. the
  // body was a bare list of `<loc>` elements), collect every top-level
  // `<loc>` that is NOT already nested inside a `<sitemap>`.
  if (urls.length === 0 && childSitemaps.length === 0) {
    for (const loc of doc.querySelectorAll("loc")) {
      const value = loc.text?.trim();
      if (value) urls.push(decodeXmlEntities(value));
    }
  }

  return { childSitemaps, urls };
}

/**
 * Case-sensitive prefix match of a URL's pathname against a robots.txt
 * disallow list. Returns true if the URL's path (including query) is
 * covered by any disallow prefix.
 *
 * Prefix "/" blocks everything; empty disallow list never matches.
 */
export function isPathDisallowed(url: string, disallowed: string[]): boolean {
  if (disallowed.length === 0) return false;
  let path: string;
  try {
    const u = new URL(url);
    path = `${u.pathname}${u.search}`;
  } catch {
    return false;
  }
  for (const prefix of disallowed) {
    if (!prefix) continue;
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Convenience wrapper: fetch robots.txt + any discovered sitemaps and
 * return the merged URL list plus the disallow prefixes. Never throws.
 */
export async function discoverSitemapAndRobots(
  seedUrl: string,
  maxUrls = 50
): Promise<{
  disallowed: string[];
  sitemapUrls: string[];
  discoveredUrls: string[];
}> {
  const origin = toOrigin(seedUrl);
  if (!origin) {
    return { disallowed: [], sitemapUrls: [], discoveredUrls: [] };
  }

  const robots = await fetchRobotsTxt(seedUrl);

  // Candidate sitemap list: explicit ones from robots.txt first, then the
  // conventional `/sitemap.xml` as a fallback.
  const candidates = unique([...robots.sitemapUrls, `${origin}/sitemap.xml`]);

  const discoveredUrls: string[] = [];
  for (const candidate of candidates) {
    if (discoveredUrls.length >= maxUrls) break;
    const remaining = maxUrls - discoveredUrls.length;
    const urls = await fetchSitemapUrls(candidate, remaining);
    for (const u of urls) {
      if (discoveredUrls.length >= maxUrls) break;
      discoveredUrls.push(u);
    }
  }

  return {
    disallowed: robots.disallowed,
    sitemapUrls: robots.sitemapUrls,
    discoveredUrls: unique(discoveredUrls).slice(0, maxUrls),
  };
}

// ---------- helpers ----------

function toOrigin(input: string): string | null {
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

/**
 * Minimal XML entity decoder for the five predefined entities. Sitemaps
 * routinely emit `&amp;` in query strings; nothing else is common enough
 * to warrant a full decoder.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
