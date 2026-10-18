/**
 * Bounded HTTP fetcher for the audit engine.
 *
 * Guarantees:
 *   - Every URL (initial + redirect targets) passes `validateUrlForFetch`.
 *   - Request has a per-attempt timeout via AbortSignal.
 *   - Response body is read as a stream and aborted when the configured
 *     size cap is exceeded — we never buffer an unbounded body.
 *   - Content-type is checked; non-HTML bodies are reported as a distinct
 *     "non_html" status rather than being parsed.
 *   - Redirects are followed manually (fetch is called with `redirect:"manual"`)
 *     so each hop can be re-validated by the SSRF guard.
 *
 * No `undici`, no native Node packages, no DOM APIs — safe for the Workers
 * runtime and Next dev alike.
 */

import { validateUrlForFetch } from "./ssrf";

export const DEFAULT_FETCH_OPTIONS = {
  timeoutMs: 10_000,
  maxBytes: 2_000_000, // 2 MB
  maxRedirects: 5,
  userAgent: "Lead-Engine/0.1 (+https://getleadengine.com/)",
} as const;

export type FetchOptions = typeof DEFAULT_FETCH_OPTIONS;

export type FetchResult =
  | {
      ok: true;
      finalUrl: string;
      httpStatus: number;
      bodyBytes: number;
      elapsedMs: number;
      html: string;
      contentType: string;
      redirectChain: string[];
    }
  | {
      ok: false;
      stage:
        | "ssrf_blocked"
        | "timeout"
        | "network_error"
        | "too_many_redirects"
        | "oversized"
        | "non_html"
        | "http_error"
        | "aborted";
      httpStatus?: number;
      finalUrl?: string;
      reason: string;
      elapsedMs: number;
      redirectChain: string[];
    };

/**
 * Fetch a URL with full SSRF defense, bounded size, and manual redirect
 * follow. Returns a structured result rather than throwing — the audit engine
 * records both success and failure paths.
 */
export async function auditFetch(
  input: string,
  options: Partial<FetchOptions> = {}
): Promise<FetchResult> {
  const opts: FetchOptions = { ...DEFAULT_FETCH_OPTIONS, ...options };
  const started = Date.now();
  const redirectChain: string[] = [];

  const initial = validateUrlForFetch(input);
  if (!initial.ok) {
    return {
      ok: false,
      stage: "ssrf_blocked",
      reason: initial.reason,
      elapsedMs: Date.now() - started,
      redirectChain,
    };
  }

  let current = initial.url;
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    redirectChain.push(current.toString());

    const perHop = AbortSignal.timeout(opts.timeoutMs);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: perHop,
        headers: {
          "user-agent": opts.userAgent,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.5",
          "accept-language": "en-US,en;q=0.9",
        },
      });
    } catch (err) {
      const e = err as Error;
      const isAbort = e.name === "TimeoutError" || e.name === "AbortError";
      return {
        ok: false,
        stage: isAbort ? "timeout" : "network_error",
        reason: isAbort
          ? `Request timed out after ${opts.timeoutMs} ms.`
          : `Network error: ${e.message || e.name}`,
        elapsedMs: Date.now() - started,
        redirectChain,
      };
    }

    const status = response.status;
    const location = response.headers.get("location");

    // Redirect?
    if (status >= 300 && status < 400 && location) {
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return {
          ok: false,
          stage: "network_error",
          reason: `Redirect target "${location}" is not a valid URL.`,
          httpStatus: status,
          elapsedMs: Date.now() - started,
          redirectChain,
        };
      }
      // Re-validate the redirect target against the SSRF rules
      const check = validateUrlForFetch(next.toString());
      if (!check.ok) {
        return {
          ok: false,
          stage: "ssrf_blocked",
          reason: `Redirect blocked: ${check.reason}`,
          httpStatus: status,
          finalUrl: next.toString(),
          elapsedMs: Date.now() - started,
          redirectChain,
        };
      }
      current = check.url;
      // Important: body must be fully consumed or the socket may hang on
      // some runtimes. `response.body?.cancel()` is the Workers-friendly way.
      await response.body?.cancel().catch(() => void 0);
      continue;
    }

    if (status < 200 || status >= 400) {
      await response.body?.cancel().catch(() => void 0);
      return {
        ok: false,
        stage: "http_error",
        reason: `Server returned HTTP ${status}.`,
        httpStatus: status,
        finalUrl: current.toString(),
        elapsedMs: Date.now() - started,
        redirectChain,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const looksLikeHtml =
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml+xml") ||
      // Some servers return no content-type for HTML — accept but tag.
      contentType === "";
    if (!looksLikeHtml) {
      await response.body?.cancel().catch(() => void 0);
      return {
        ok: false,
        stage: "non_html",
        reason: `Response content-type "${contentType}" is not HTML.`,
        httpStatus: status,
        finalUrl: current.toString(),
        elapsedMs: Date.now() - started,
        redirectChain,
      };
    }

    const read = await readBoundedBody(response, opts.maxBytes);
    if (!read.ok) {
      return {
        ok: false,
        stage: read.stage,
        reason: read.reason,
        httpStatus: status,
        finalUrl: current.toString(),
        elapsedMs: Date.now() - started,
        redirectChain,
      };
    }

    return {
      ok: true,
      finalUrl: current.toString(),
      httpStatus: status,
      bodyBytes: read.bytes,
      elapsedMs: Date.now() - started,
      html: read.text,
      contentType,
      redirectChain,
    };
  }

  return {
    ok: false,
    stage: "too_many_redirects",
    reason: `Exceeded ${opts.maxRedirects} redirects.`,
    elapsedMs: Date.now() - started,
    redirectChain,
  };
}

/**
 * Read a Response body as text with a hard byte cap. Aborts the stream as
 * soon as the cap is exceeded so we never buffer an unbounded payload.
 */
async function readBoundedBody(
  response: Response,
  maxBytes: number
): Promise<
  | { ok: true; text: string; bytes: number }
  | {
      ok: false;
      stage: "oversized" | "network_error" | "aborted";
      reason: string;
    }
> {
  if (!response.body) {
    return { ok: true, text: "", bytes: 0 };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        return {
          ok: false,
          stage: "oversized",
          reason: `Response body exceeded ${maxBytes.toLocaleString()} bytes.`,
        };
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    // Flush any trailing bytes in the decoder.
    chunks.push(decoder.decode());
    return { ok: true, text: chunks.join(""), bytes: total };
  } catch (err) {
    const e = err as Error;
    const isAbort = e.name === "TimeoutError" || e.name === "AbortError";
    return {
      ok: false,
      stage: isAbort ? "aborted" : "network_error",
      reason: isAbort
        ? "Response stream aborted (timeout)."
        : `Error reading response body: ${e.message || e.name}`,
    };
  }
}
