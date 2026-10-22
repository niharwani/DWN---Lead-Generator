/**
 * Web Intelligence — snapshot archive (Stream F).
 *
 * Three concerns live here:
 *   1. Hashing: a Workers-safe SHA-256 helper over the normalized visible text
 *      of a page. Used to detect whether a re-crawl changed anything.
 *   2. Archive write: best-effort put of raw HTML into the R2 bucket bound as
 *      `INTEL_SNAPSHOTS`. The binding is optional in dev; when missing we
 *      return an `{ ok: false, reason: "no_binding" }` result rather than
 *      throwing so the crawler can swallow it.
 *   3. Diffing: a cheap line-set diff that produces a one-sentence summary
 *      like "3 lines added, 1 removed". Nothing fancy — a full semantic diff
 *      is out of scope.
 *
 * All work here is best-effort. Archive write failures MUST NEVER fail a
 * crawl; callers are expected to wrap these in try/catch (and most of these
 * functions already return a tagged result instead of throwing).
 */

import { parse as parseHtml } from "node-html-parser";

/* -------------------------------------------------------------------------
 * Normalization + hashing
 * ------------------------------------------------------------------------- */

/**
 * Reduce an HTML document to its visible text in a canonical form so that
 * cosmetic changes (whitespace, script/style edits, casing) don't produce a
 * different hash. Returns an empty string on empty input.
 */
export function normalizeForHash(html: string): string {
  if (!html) return "";
  const root = parseHtml(html, {
    lowerCaseTagName: true,
    comment: false,
    // Drop script/style text — they're not "visible" and often contain
    // cache-busting hashes that would create false "changed" findings.
    blockTextElements: {
      script: false,
      style: false,
      pre: true,
    },
  });

  // node-html-parser's structuredText or text handles descendants correctly.
  // `.structuredText` preserves block boundaries as newlines, which is helpful
  // for the line-set diff later. Fall back to `.text` for robustness.
  const text =
    (root as unknown as { structuredText?: string }).structuredText ??
    root.text ??
    "";

  return text
    .toLowerCase()
    .replace(/\s+/g, " ") // collapse all whitespace runs
    .trim();
}

/**
 * SHA-256 hex of the input string using `crypto.subtle` (available in Workers
 * and Node 20+). Deterministic for identical input.
 */
export async function hashContent(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/* -------------------------------------------------------------------------
 * R2 archive write
 * ------------------------------------------------------------------------- */

/**
 * Minimal shape of an R2 bucket binding. We deliberately duck-type here rather
 * than depending on @cloudflare/workers-types' `R2Bucket` interface so this
 * module stays trivially testable from Node without pulling in the full type
 * surface.
 */
export type R2PutLike = {
  put: (
    key: string,
    value: string | ArrayBuffer | ReadableStream | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ) => Promise<unknown>;
};

export type ArchiveEnv = {
  INTEL_SNAPSHOTS?: R2PutLike | undefined;
} & Record<string, unknown>;

export type ArchiveResult =
  | { ok: true; key: string }
  | { ok: false; reason: string };

/**
 * Writes raw HTML to the `INTEL_SNAPSHOTS` R2 bucket. When the binding isn't
 * configured (common in local dev / tests) returns `{ ok: false, reason: "no_binding" }`
 * without throwing. On any put failure returns `{ ok: false, reason }` with the
 * stringified error — again, no throws. Callers can treat this as fire-and-forget.
 */
export async function putSnapshotToR2(
  key: string,
  html: string,
  env: ArchiveEnv | null | undefined
): Promise<ArchiveResult> {
  if (!env || !env.INTEL_SNAPSHOTS) {
    return { ok: false, reason: "no_binding" };
  }
  const bucket = env.INTEL_SNAPSHOTS;
  if (typeof bucket.put !== "function") {
    return { ok: false, reason: "no_binding" };
  }
  try {
    await bucket.put(key, html, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
    return { ok: true, key };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
  }
}

/* -------------------------------------------------------------------------
 * Diffing
 * ------------------------------------------------------------------------- */

export type DiffResult = {
  changed: boolean;
  summary: string;
};

/**
 * Cheap line-set diff. Works on the normalized text (one-line post-collapse
 * strings also diff fine — the result is "unchanged" or "N lines added/
 * removed"). Not a full semantic diff; good enough to tell "this page is
 * materially different" from "same page as before".
 */
export function diffContent(prev: string, next: string): DiffResult {
  if (prev === next) {
    return { changed: false, summary: "unchanged" };
  }

  const prevLines = splitLines(prev);
  const nextLines = splitLines(next);
  const prevSet = new Set(prevLines);
  const nextSet = new Set(nextLines);

  let added = 0;
  for (const line of nextSet) {
    if (!prevSet.has(line)) added++;
  }
  let removed = 0;
  for (const line of prevSet) {
    if (!nextSet.has(line)) removed++;
  }

  if (added === 0 && removed === 0) {
    // Different strings but same line-set — treat as a minor reorder. We
    // still mark changed=true because the hashes will differ, but the
    // summary makes it clear nothing structural moved.
    return { changed: true, summary: "lines reordered" };
  }

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} line${added === 1 ? "" : "s"} added`);
  if (removed > 0)
    parts.push(`${removed} line${removed === 1 ? "" : "s"} removed`);
  return { changed: true, summary: parts.join(", ") };
}

function splitLines(input: string): string[] {
  if (!input) return [];
  return input
    .split(/\r?\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/* -------------------------------------------------------------------------
 * Convenience key builder
 * ------------------------------------------------------------------------- */

/**
 * Deterministic R2 object key: `snapshots/<ownerId>/<leadId or "unlinked">/<hash>.html`.
 * Including the hash in the key means re-writing an identical page is a no-op
 * at the R2 level (same key, same bytes) — but we keep the DB row distinct
 * because `createSnapshot` always generates a fresh id. Callers can trim this
 * if they want strict content-addressable storage.
 */
export function buildSnapshotKey(
  ownerId: string,
  leadId: string | null | undefined,
  contentHash: string
): string {
  const safeOwner = encodeURIComponent(ownerId);
  const safeLead = leadId ? encodeURIComponent(leadId) : "unlinked";
  return `snapshots/${safeOwner}/${safeLead}/${contentHash}.html`;
}

/* -------------------------------------------------------------------------
 * High-level integration helper used by runner.ts
 *
 * Encapsulates the full "detect-change + archive + persist" workflow for a
 * single fetched page so the crawler runner only needs one call per page.
 * Returns a change-detection outcome the caller can turn into an
 * `intel_content_changed` AuditFinding.
 * ------------------------------------------------------------------------- */

export type PageSnapshotInput = {
  html: string;
  url: string;
  title?: string | null;
  leadId?: string | null;
  jobId?: string | null;
};

export type PageSnapshotOutcome = {
  contentHash: string;
  bytes: number;
  r2Key: string | null;
  // `priorHash` is undefined when there was no prior snapshot (first crawl)
  priorHash: string | undefined;
  diff: DiffResult | null;
};

/**
 * Shape of the repo callbacks we need. Imported structurally so this module
 * stays decoupled from `@/lib/db/repos/intel-snapshots.ts`. The runner wires
 * these from the actual repo.
 */
export type SnapshotRepoAdapter = {
  latestSnapshotForUrl: (
    ownerId: string,
    leadId: string | null,
    url: string
  ) => Promise<
    | {
        contentHash: string;
        // normalized body of the prior snapshot, if we kept it. Most callers
        // won't have this (we only persist the hash + the R2 key). The diff
        // then falls back to "contents changed" without a line summary.
        normalizedBody?: string;
      }
    | undefined
  >;
  createSnapshot: (input: {
    leadId?: string | null;
    jobId?: string | null;
    url: string;
    contentHash: string;
    title?: string | null;
    r2Key?: string | null;
    bytes?: number | null;
  }) => Promise<unknown>;
};

/**
 * Record one page snapshot and compute the diff vs. the prior one. Best-effort:
 * failures in R2 writes or DB inserts are swallowed and surfaced via the
 * returned `outcome.r2Key === null` / absent `priorHash` sentinels. If the
 * repo adapter itself throws (e.g., bad ownerId), the exception propagates;
 * callers should still wrap the whole thing in try/catch.
 */
export async function recordSnapshotForPage(
  input: PageSnapshotInput,
  env: ArchiveEnv | null | undefined,
  repo: SnapshotRepoAdapter
): Promise<PageSnapshotOutcome> {
  const normalized = normalizeForHash(input.html);
  const contentHash = await hashContent(normalized);
  const bytes = new TextEncoder().encode(input.html).byteLength;

  // Load prior snapshot (if any) for the diff.
  let prior: Awaited<ReturnType<SnapshotRepoAdapter["latestSnapshotForUrl"]>>;
  try {
    prior = await repo.latestSnapshotForUrl(
      // ownerId comes from the repo closure — we rely on the adapter being
      // pre-scoped to the owner. See runner.ts for the wiring.
      "",
      input.leadId ?? null,
      input.url
    );
  } catch {
    prior = undefined;
  }

  const priorHash = prior?.contentHash;
  const diff =
    priorHash && priorHash !== contentHash
      ? diffContent(prior?.normalizedBody ?? "", normalized)
      : priorHash === contentHash
        ? { changed: false, summary: "unchanged" }
        : null;

  // Best-effort R2 write.
  let r2Key: string | null = null;
  try {
    const key = buildSnapshotKey(
      // The key doesn't need the owner from here either — the adapter is
      // pre-scoped. We use a placeholder so the key is still namespaced per
      // (lead, hash). Runners that care about per-owner isolation at the R2
      // layer should build the key themselves.
      "owner",
      input.leadId ?? null,
      contentHash
    );
    const result = await putSnapshotToR2(key, input.html, env);
    if (result.ok) r2Key = result.key;
  } catch {
    r2Key = null;
  }

  // Best-effort DB insert.
  try {
    await repo.createSnapshot({
      leadId: input.leadId ?? null,
      jobId: input.jobId ?? null,
      url: input.url,
      contentHash,
      title: input.title ?? null,
      r2Key,
      bytes,
    });
  } catch {
    // Swallow: archiving must NEVER fail the crawl.
  }

  return {
    contentHash,
    bytes,
    r2Key,
    priorHash,
    diff,
  };
}
