/**
 * Pure normalization helpers used by the repository layer.
 *
 * Keep this file dependency-free so unit tests can import without pulling in
 * the Cloudflare runtime or Drizzle.
 */

/**
 * Lowercase + trim + collapse whitespace + strip trailing punctuation.
 * Used for dedup by (owner, normalized_name, city).
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+$/u, "")
    .replace(/\s+/g, " ");
}

/**
 * Canonical domain for dedup. Returns `null` for inputs we can't parse rather
 * than falling back to the raw string, so a bad URL never joins two unrelated
 * leads together.
 */
export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Allow bare domains like "example.com" by inserting a scheme first.
  const withScheme = /^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  return host;
}

/**
 * Return a canonical URL string for storage: lowercased scheme/host, trimmed,
 * trailing slash removed on root. Returns `null` for unparseable or
 * disallowed-scheme input so the caller can treat it as "no site".
 */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  // Normalize root slash
  if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
    return `${parsed.protocol}//${parsed.hostname}`;
  }
  return parsed.toString();
}

/**
 * Clamp a numeric score into [0, 100]. Non-finite values collapse to 0.
 * Rounding happens at the application layer; this helper only enforces bounds.
 */
export function clampScore(total: number): number {
  if (!Number.isFinite(total)) return 0;
  if (total < 0) return 0;
  if (total > 100) return 100;
  return Math.round(total);
}

export type EvidenceConfidence = "low" | "medium" | "high" | "insufficient";

export type ScoreBand =
  | "priority_review"
  | "strong_candidate"
  | "needs_manual_review"
  | "low_priority"
  | "insufficient_evidence";

/**
 * Classify a (score, confidence) pair into one of the spec §10 bands.
 * Insufficient-evidence is always its own band, never a numeric position.
 */
export function scoreBandFor(
  total: number,
  confidence: EvidenceConfidence
): ScoreBand {
  if (confidence === "insufficient") return "insufficient_evidence";
  const clamped = clampScore(total);
  if (clamped >= 80) return "priority_review";
  if (clamped >= 60) return "strong_candidate";
  if (clamped >= 40) return "needs_manual_review";
  return "low_priority";
}
