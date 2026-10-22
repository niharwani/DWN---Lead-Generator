/**
 * Web Intelligence crawler engine.
 *
 * In-process, bounded, breadth-first same-domain crawler. Reuses:
 *   - `auditFetch` for every HTTP request (SSRF guard, byte cap, timeout,
 *     manual redirect follow re-validated per hop)
 *   - `node-html-parser` for parsing (already a dependency)
 *   - the pure `extract` and `findings` modules in this folder for everything
 *     downstream of the fetch
 *
 * This runs inline inside the server action — same lifetime constraint as
 * the existing discovery runner. For long-running jobs the right next step
 * is to move the loop body into a Cloudflare Queue consumer; for now the
 * crawl is bounded (maxPages, maxDepth, perDomainCap) and the typical crawl
 * sits well inside the Workers CPU budget.
 */

import { auditFetch } from "@/lib/audit/fetcher";
import { normalizeDomain } from "@/lib/db/normalize";
import { discoverSitemapAndRobots, isPathDisallowed } from "./discovery";
import {
  extractCompanyIntel,
  extractLinks,
  extractPeople,
  parsePageHtml,
} from "./extract";
import { runIntelFindings } from "./findings";
import { looksLikeSpaShell, renderWithBrowser } from "./js-render";
import type {
  CompanyIntel,
  CrawlJobInput,
  CrawlOutcome,
  CrawlPageResult,
  DiscoveredVia,
  ExtractedPersonCandidate,
} from "./types";
import type { AuditFinding } from "@/lib/demo/types";

export type CrawlOptions = {
  maxPages: number;
  maxDepth: number;
  perDomainCap: number;
  totalBudgetMs: number;
  /** optional hook called after every page completes — lets the caller stream progress to D1. */
  onPage?: (page: CrawlPageResult) => Promise<void> | void;
  /**
   * When set, enables the JS rendering fallback: after a successful fetch, if
   * the HTML looks like a client-rendered shell, the crawler calls Cloudflare
   * Browser Rendering (via `renderWithBrowser`) and swaps in the rendered DOM
   * before parsing. Keys expected: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
   * When not provided or when the keys aren't set, the crawler behaves exactly
   * as before — no regression.
   */
  renderEnv?: Readonly<Record<string, string | undefined>>;
};

const DEFAULTS: CrawlOptions = {
  maxPages: 20,
  maxDepth: 2,
  perDomainCap: 20,
  totalBudgetMs: 45_000,
};

export async function crawlSite(
  input: CrawlJobInput,
  options: Partial<CrawlOptions> = {}
): Promise<CrawlOutcome> {
  const opts = { ...DEFAULTS, ...options };
  const started = Date.now();

  const seedDomain = normalizeDomain(input.seedUrl);
  if (!seedDomain) {
    return emptyOutcome(input, {
      domain: "",
      services: [],
      categories: [],
      emails: [],
      phones: [],
      socialUrls: [],
      techIndicators: [],
    });
  }

  // Discover robots.txt disallow prefixes + sitemap URLs before we start.
  // Best-effort: a 404/network error degrades silently to an empty list and
  // the crawl falls back to link-following behaviour. Captured in closure so
  // no API change leaks out of this function.
  let disallowed: string[] = [];
  let sitemapCandidates: string[] = [];
  try {
    const discovery = await discoverSitemapAndRobots(input.seedUrl, opts.maxPages * 2);
    disallowed = discovery.disallowed;
    sitemapCandidates = discovery.discoveredUrls;
  } catch {
    // Discovery helpers never throw, but belt-and-braces.
  }

  const visited = new Set<string>();
  const pages: CrawlPageResult[] = [];
  const people: ExtractedPersonCandidate[] = [];
  const findings: AuditFinding[] = [];
  let intel: CompanyIntel | null = null;

  type Pending = { url: string; depth: number; via: DiscoveredVia; priority: number };
  const queue: Pending[] = [];
  const seedCanonical = canonicalize(input.seedUrl);
  // Seed URL always first, regardless of robots.txt (operator-selected).
  queue.push({ url: seedCanonical, depth: 0, via: "seed", priority: 100 });

  // Add up to maxPages sitemap-discovered URLs that match the same domain
  // AND aren't disallowed by robots. Priority 5 slots them after seed (100)
  // and the priority-path heuristic (e.g. /about, /team usually ~10) but
  // well above generic link discoveries (1).
  if (sitemapCandidates.length > 0) {
    let added = 0;
    for (const raw of sitemapCandidates) {
      if (added >= opts.maxPages) break;
      const canonical = canonicalize(raw);
      if (canonical === seedCanonical) continue;
      const linkDomain = normalizeDomain(canonical);
      if (!linkDomain || linkDomain !== seedDomain) continue;
      if (isPathDisallowed(canonical, disallowed)) continue;
      queue.push({ url: canonical, depth: 0, via: "sitemap", priority: 5 });
      added++;
    }
  }

  while (queue.length > 0 && pages.length < opts.maxPages) {
    if (Date.now() - started > opts.totalBudgetMs) break;

    // Highest-priority first (sitemap/seed > priority paths > generic).
    queue.sort((a, b) => b.priority - a.priority);
    const next = queue.shift()!;
    if (visited.has(next.url)) continue;
    visited.add(next.url);

    // auditFetch applies its own 10s per-hop timeout; totalBudgetMs below caps the whole crawl.
    const fetched = await auditFetch(next.url);

    const base: CrawlPageResult = {
      url: next.url,
      discoveredVia: next.via,
      depth: next.depth,
      status: "queued",
    };

    if (!fetched.ok) {
      const pageStatus =
        fetched.stage === "ssrf_blocked"
          ? "blocked"
          : fetched.stage === "non_html"
            ? "skipped"
            : "failed";
      const page: CrawlPageResult = {
        ...base,
        status: pageStatus,
        httpStatus: fetched.httpStatus,
        finalUrl: fetched.finalUrl,
        errorStage: fetched.stage,
        errorReason: fetched.reason.slice(0, 500),
      };
      pages.push(page);
      await opts.onPage?.(page);
      continue;
    }

    // JS rendering fallback — if the raw fetch returned a client-rendered
    // shell and the caller supplied Cloudflare credentials, swap in the
    // fully-rendered HTML before parsing. Bounded: only one render attempt
    // per page, so we can never recurse into this branch.
    let pageHtml = fetched.html;
    let pageBytes = fetched.bodyBytes;
    let pageRendered = false;
    if (opts.renderEnv && looksLikeSpaShell(pageHtml, pageBytes)) {
      const rendered = await renderWithBrowser(fetched.finalUrl, opts.renderEnv);
      if (rendered.ok) {
        pageHtml = rendered.html;
        pageBytes = rendered.bytes;
        pageRendered = true;
      }
    }

    const doc = parsePageHtml(pageHtml);
    const pageTitle = doc.querySelector("title")?.text?.trim();
    const page: CrawlPageResult = {
      ...base,
      status: "fetched",
      httpStatus: fetched.httpStatus,
      finalUrl: fetched.finalUrl,
      contentType: fetched.contentType,
      bytes: pageBytes,
      elapsedMs: fetched.elapsedMs,
      title: pageTitle,
      ...(pageRendered ? { rendered: true } : {}),
    };
    pages.push(page);
    await opts.onPage?.(page);

    const pageIntel = extractCompanyIntel(doc, fetched.finalUrl, pageHtml);
    intel = mergeIntel(intel, pageIntel);

    const pagePeople = extractPeople(doc, fetched.finalUrl);
    for (const p of pagePeople) {
      if (!people.some((e) => e.fullName.toLowerCase() === p.fullName.toLowerCase())) {
        people.push(p);
      }
    }

    const pageFindings = runIntelFindings(doc, {
      finalUrl: fetched.finalUrl,
      html: pageHtml,
      bytes: pageBytes,
      intel: pageIntel,
    });
    // Attribute each finding to its page URL so the UI can group them.
    for (const f of pageFindings) findings.push(f);

    // Only follow links while under depth budget.
    if (next.depth < opts.maxDepth) {
      const links = extractLinks(doc, fetched.finalUrl, seedDomain);
      for (const link of links) {
        if (visited.has(link.url)) continue;
        if (pages.length + queue.length >= opts.perDomainCap) break;
        if (isPathDisallowed(link.url, disallowed)) continue;
        queue.push({
          url: link.url,
          depth: next.depth + 1,
          via: "link",
          priority: link.priority,
        });
      }
    }
  }

  if (!intel) {
    intel = {
      domain: seedDomain,
      services: [],
      categories: [],
      emails: [],
      phones: [],
      socialUrls: [],
      techIndicators: [],
    };
  }

  return { intel, pages, people, findings };
}

function canonicalize(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Prefer values from the earliest-seen page (usually the homepage) and only
 * fill blanks from later pages. Lists (emails, phones, social, tech) are
 * union-merged with dedup.
 */
function mergeIntel(prev: CompanyIntel | null, next: CompanyIntel): CompanyIntel {
  if (!prev) return next;
  return {
    domain: prev.domain || next.domain,
    name: prev.name ?? next.name,
    description: prev.description ?? next.description,
    industry: prev.industry ?? next.industry,
    services: unique([...prev.services, ...next.services]),
    categories: unique([...prev.categories, ...next.categories]),
    address: prev.address ?? next.address,
    city: prev.city ?? next.city,
    region: prev.region ?? next.region,
    country: prev.country ?? next.country,
    emails: unique([...prev.emails, ...next.emails]),
    phones: unique([...prev.phones, ...next.phones]),
    contactPageUrl: prev.contactPageUrl ?? next.contactPageUrl,
    socialUrls: unique([...prev.socialUrls, ...next.socialUrls]),
    techIndicators: unique([...prev.techIndicators, ...next.techIndicators]),
  };
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function emptyOutcome(input: CrawlJobInput, intel: CompanyIntel): CrawlOutcome {
  return {
    intel,
    pages: [
      {
        url: input.seedUrl,
        discoveredVia: "seed",
        depth: 0,
        status: "blocked",
        errorStage: "invalid_seed",
        errorReason: "Seed URL could not be parsed to a canonical domain.",
      },
    ],
    people: [],
    findings: [],
  };
}
