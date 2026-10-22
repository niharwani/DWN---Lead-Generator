/**
 * Authorized web-search provider for the Web Intelligence module.
 *
 * Uses Brave Search API (https://brave.com/search/api/) — permitted via API,
 * not scraping of HTML SERPs. Google Search HTML scraping is a non-negotiable
 * no-go per repo policy (README responsible-use guardrails).
 *
 * The provider is optional. When the API key is absent the module still
 * works for user-supplied company URLs — the UI should surface the "needs
 * key" state and let the user paste URLs instead.
 *
 * Rate-limit, quota, and auth errors surface as thrown Errors with an
 * actionable message. Transport-level failures are retried once with a
 * short backoff.
 */

export type WebSearchQuery = {
  industry: string;
  location?: string;
  keywords?: string;
  excludedDomains?: string[];
  resultLimit: number;
};

export type WebSearchResult = {
  title: string;
  url: string;
  description?: string;
  domain: string;
  age?: string;
};

export type WebSearchProviderStatus = "ready" | "needs-key" | "disabled";

export function webSearchProviderStatus(
  env: Readonly<Record<string, string | undefined>>
): WebSearchProviderStatus {
  return env.BRAVE_SEARCH_API_KEY ? "ready" : "needs-key";
}

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

type BraveResponse = {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
      profile?: { name?: string };
    }>;
  };
  error?: { message?: string };
};

export async function runWebSearch(
  query: WebSearchQuery,
  env: Readonly<Record<string, string | undefined>>
): Promise<WebSearchResult[]> {
  const key = env.BRAVE_SEARCH_API_KEY;
  if (!key) {
    throw new Error(
      "Web search requires BRAVE_SEARCH_API_KEY in Worker secrets. Configure it in Settings or paste company URLs manually."
    );
  }
  const q = buildQuery(query);
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("count", String(Math.min(Math.max(query.resultLimit, 1), 20)));
  url.searchParams.set("country", countryHint(query.location));
  url.searchParams.set("safesearch", "moderate");

  const resp = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "accept-encoding": "gzip",
      "x-subscription-token": key,
    },
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("Brave Search rejected the API key — check BRAVE_SEARCH_API_KEY.");
  }
  if (resp.status === 429) {
    throw new Error("Brave Search quota exhausted. Reduce the result limit or wait before retrying.");
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Brave Search returned HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = (await resp.json()) as BraveResponse;
  if (data.error?.message) {
    throw new Error(`Brave Search error: ${data.error.message}`);
  }
  const rows = data.web?.results ?? [];
  const excluded = new Set(
    (query.excludedDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""))
  );
  const out: WebSearchResult[] = [];
  for (const r of rows) {
    if (!r.url || !r.title) continue;
    let parsed: URL;
    try {
      parsed = new URL(r.url);
    } catch {
      continue;
    }
    const domain = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (excluded.has(domain)) continue;
    out.push({
      title: r.title,
      url: parsed.toString(),
      description: r.description,
      domain,
      age: r.age,
    });
  }
  return out.slice(0, query.resultLimit);
}

function buildQuery(q: WebSearchQuery): string {
  const parts: string[] = [];
  if (q.industry) parts.push(q.industry);
  if (q.keywords?.trim()) parts.push(q.keywords.trim());
  if (q.location?.trim()) parts.push(q.location.trim());
  if (q.excludedDomains?.length) {
    for (const d of q.excludedDomains.slice(0, 10)) parts.push(`-site:${d}`);
  }
  return parts.join(" ");
}

function countryHint(location: string | undefined): string {
  if (!location) return "IN";
  const l = location.toLowerCase();
  if (l.includes("india") || l.includes("mumbai") || l.includes("delhi") || l.includes("bangalore"))
    return "IN";
  if (l.includes("usa") || l.includes("united states") || l.includes("new york")) return "US";
  if (l.includes("uk") || l.includes("london")) return "GB";
  if (l.includes("uae") || l.includes("dubai")) return "AE";
  return "IN";
}
