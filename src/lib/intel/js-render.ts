/**
 * JavaScript rendering fallback for the Web Intelligence crawler.
 *
 * Many modern sites (Shopify SPAs, Next.js client-only shells, Angular apps)
 * ship a 1–3 KB HTML shell that only becomes meaningful after client-side
 * hydration. Fetching that shell with `auditFetch` gets us a document the
 * extractors cannot parse (no title, no description, no body text).
 *
 * This module provides:
 *   1. A pure heuristic (`looksLikeSpaShell`) the crawler can use after each
 *      successful fetch to decide whether a JS render is worth attempting.
 *   2. A bounded `renderWithBrowser` call that invokes Cloudflare Browser
 *      Rendering's REST API with the account's own API token. The returned
 *      HTML is the fully-rendered DOM, which the existing extractors can
 *      consume unchanged.
 *
 * The fallback is strictly opt-in — when the API token / account ID aren't
 * configured, `renderWithBrowser` returns `{ ok: false }` with a clear reason
 * instead of throwing, so the crawler can continue parsing the shell it
 * already fetched. Zero regression when the keys aren't set.
 *
 * We hit `api.cloudflare.com` directly (bypassing `auditFetch`) because that
 * endpoint is a trusted first-party service, not a crawled target URL. The
 * SSRF guard would reject it as outbound-to-public-API by design.
 */

const BROWSER_RENDERING_TIMEOUT_MS = 10_000;
/** Cap on the rendered HTML we accept — matches the audit fetcher's 2 MB cap. */
const MAX_RENDERED_BYTES = 2 * 1024 * 1024;

const SPA_SHELL_MARKERS = [
  '<div id="root"></div>',
  '<div id="__next"></div>',
  "<app-root></app-root>",
  "<app-root>",
];

/**
 * Returns true when the fetched HTML looks like a client-rendered shell —
 * the signal the crawler uses to decide whether a JS render is worth the
 * extra budget.
 *
 * Heuristics (all three combined):
 *   - total body bytes under 5 KB (hydration shells are consistently tiny)
 *   - AND one of:
 *       - a known mount-point marker (`<div id="root">`, `<div id="__next">`,
 *         `<app-root>`) with no inner content
 *       - fewer than 3 anchor tags (static pages have menus, SPAs don't)
 */
export function looksLikeSpaShell(html: string, bytes: number): boolean {
  if (bytes >= 5000) return false;
  const lower = html.toLowerCase();
  const hasMarker = SPA_SHELL_MARKERS.some((m) => lower.includes(m));
  if (hasMarker) return true;
  const anchorMatches = lower.match(/<a\s[^>]*href=/g);
  const anchorCount = anchorMatches ? anchorMatches.length : 0;
  return anchorCount < 3;
}

export type RenderResult =
  | { ok: true; html: string; bytes: number }
  | { ok: false; reason: string };

type CloudflareRenderResponse = {
  success?: boolean;
  result?: string;
  errors?: Array<{ message?: string; code?: number }>;
};

/**
 * Render the given URL via Cloudflare Browser Rendering's REST API. Returns a
 * discriminated union — never throws for configuration / HTTP / parse errors.
 * The caller handles the `{ ok: false }` branch by falling back to the raw
 * shell HTML it already has.
 */
export async function renderWithBrowser(
  url: string,
  env: Readonly<Record<string, string | undefined>>
): Promise<RenderResult> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    return {
      ok: false,
      reason:
        "Cloudflare Browser Rendering is not configured — set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to enable the JS fallback.",
    };
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    accountId
  )}/browser-rendering/content`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROWSER_RENDERING_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
  } catch (err) {
    const reason =
      (err as Error).name === "AbortError"
        ? `Cloudflare Browser Rendering timed out after ${BROWSER_RENDERING_TIMEOUT_MS}ms.`
        : `Cloudflare Browser Rendering transport error: ${(err as Error).message}`;
    clearTimeout(timer);
    return { ok: false, reason };
  }
  clearTimeout(timer);

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      reason: `Cloudflare rejected the API token (HTTP ${resp.status}) — check CLOUDFLARE_API_TOKEN scope and CLOUDFLARE_ACCOUNT_ID.`,
    };
  }
  if (resp.status === 429) {
    return {
      ok: false,
      reason: "Cloudflare Browser Rendering quota exhausted (HTTP 429).",
    };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return {
      ok: false,
      reason: `Cloudflare Browser Rendering returned HTTP ${resp.status}: ${body.slice(0, 200)}`,
    };
  }

  let data: CloudflareRenderResponse;
  try {
    data = (await resp.json()) as CloudflareRenderResponse;
  } catch (err) {
    return {
      ok: false,
      reason: `Cloudflare Browser Rendering returned non-JSON: ${(err as Error).message}`,
    };
  }

  if (!data.success || typeof data.result !== "string") {
    const firstError = data.errors?.[0]?.message;
    return {
      ok: false,
      reason: firstError
        ? `Cloudflare Browser Rendering reported failure: ${firstError}`
        : "Cloudflare Browser Rendering returned success=false with no result.",
    };
  }

  const html = data.result;
  // Rough byte count — enough to enforce the cap without re-encoding every char.
  const bytes = html.length;
  if (bytes > MAX_RENDERED_BYTES) {
    return {
      ok: false,
      reason: `Rendered HTML exceeded ${MAX_RENDERED_BYTES} bytes (${bytes}).`,
    };
  }

  return { ok: true, html, bytes };
}
