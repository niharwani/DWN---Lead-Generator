/**
 * `web_search` LeadSourceAdapter — thin wrapper around the Web Intelligence
 * search provider so companies discovered via Brave Search can flow into the
 * existing discovery runner (which handles dedup + persistence + optional
 * audit + optional scoring).
 *
 * This adapter does NOT crawl. It only normalizes the SERP result into a
 * `DiscoveredCandidate`. The Web Intelligence page's "Discover & crawl"
 * action enqueues real crawl jobs for the top results.
 */

import { runWebSearch, webSearchProviderStatus } from "@/lib/intel/search";
import { normalizeDomain } from "@/lib/db/normalize";
import type {
  DiscoveredCandidate,
  DiscoveryInput,
  LeadSourceAdapter,
} from "./types";

export const webSearchAdapter: LeadSourceAdapter = {
  name: "web_search",
  label: "Web search (Brave)",
  capability: (env) => webSearchProviderStatus(env),
  run: async (input: DiscoveryInput, env) => {
    const results = await runWebSearch(
      {
        industry: input.niche,
        location: [input.city, input.region, input.country].filter(Boolean).join(", "),
        keywords: input.keywords,
        resultLimit: input.limit,
      },
      env
    );
    const seenDomains = new Set<string>();
    const candidates: DiscoveredCandidate[] = [];
    for (const r of results) {
      const domain = normalizeDomain(r.url) ?? r.domain;
      if (seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      candidates.push({
        businessName: r.title.replace(/\s*[-|·].*$/, "").trim() || r.domain,
        websiteUrl: `https://${domain}`,
        sourceUrl: r.url,
        externalId: domain,
        city: input.city,
        region: input.region,
        country: input.country ?? "India",
        evidence: { description: r.description ?? null, age: r.age ?? null },
      });
    }
    return { candidates };
  },
};
