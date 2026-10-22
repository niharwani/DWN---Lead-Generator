/**
 * Pure HTML extractors used by the Web Intelligence crawler.
 *
 * No network, no DB — every function takes a parsed HTMLElement + context and
 * returns derived values. Keeping these pure means they are unit-testable
 * against captured HTML fixtures.
 *
 * Sources we parse (all public, no auth required):
 *   - <meta>, <title>, <link rel=canonical>
 *   - Open Graph og:*
 *   - JSON-LD <script type="application/ld+json"> blocks (Organization,
 *     LocalBusiness, Person, Corporation, WebSite)
 *   - mailto: and tel: anchors
 *   - obvious social-media link patterns
 *   - page body text for executive-title heuristics
 */

import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import type {
  CompanyIntel,
  ExtractedPersonCandidate,
  Confidence,
} from "./types";

export function parsePageHtml(html: string): HTMLElement {
  return parseHtml(html, {
    lowerCaseTagName: true,
    comment: false,
    // JSON-LD lives inside <script> blocks — we need their text content preserved.
    blockTextElements: { script: true, style: false, pre: true },
  });
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/* ---------- Phone extraction (strict mode) ---------------------- *
 *
 * Earlier versions did a free-text regex sweep across every page's visible
 * text — this produced garbage like FSSAI licence fragments on real sites
 * (sumosta.com returned "8241475, 1840-93373, ..."). The free-text sweep is
 * dropped. Phones now come only from `tel:` anchors + JSON-LD `telephone`,
 * with digit-count validation and a `+`-prefix OR tel-origin gate.
 */

export function isPlausiblePhone(
  raw: string,
  opts: { fromTel?: boolean } = {}
): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  const hasPlus = trimmed.startsWith("+");
  return hasPlus || opts.fromTel === true;
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

/* ---------- Social URL canonicalization ------------------------- *
 *
 * One handle shouldn't appear twice because of trailing slashes, tracking
 * params, or protocol variants (sumosta.com returned both
 * `instagram.com/sumosta` and `instagram.com/sumosta.in?igsi=...`). The
 * platform-aware canonicalizer collapses variants to a single stable URL
 * per account.
 */

const SOCIAL_HOST_PATTERNS: Array<{
  test: (host: string) => boolean;
  canonicalize: (url: URL) => string | null;
}> = [
  {
    test: (h) => /(^|\.)linkedin\.com$/i.test(h),
    canonicalize: (url) => {
      const segs = url.pathname.split("/").filter(Boolean);
      if (segs.length < 2) return null;
      const type = segs[0]?.toLowerCase();
      const slug = segs[1];
      if (!slug) return null;
      if (type === "company" || type === "school") {
        return `https://www.linkedin.com/company/${slug.toLowerCase()}`;
      }
      if (type === "in" || type === "pub") {
        return `https://www.linkedin.com/in/${slug.toLowerCase()}`;
      }
      return null;
    },
  },
  {
    test: (h) => /(^|\.)instagram\.com$/i.test(h),
    canonicalize: (url) => {
      const segs = url.pathname.split("/").filter(Boolean);
      const handle = segs[0];
      if (!handle) return null;
      if (
        ["p", "reel", "reels", "explore", "stories", "accounts", "about"].includes(
          handle.toLowerCase()
        )
      ) {
        return null;
      }
      return `https://www.instagram.com/${handle.toLowerCase()}`;
    },
  },
  {
    test: (h) => /(^|\.)(twitter\.com|x\.com)$/i.test(h),
    canonicalize: (url) => {
      const segs = url.pathname.split("/").filter(Boolean);
      const handle = segs[0];
      if (!handle) return null;
      if (
        ["home", "login", "share", "intent", "search", "i", "explore"].includes(
          handle.toLowerCase()
        )
      ) {
        return null;
      }
      return `https://x.com/${handle.toLowerCase()}`;
    },
  },
  {
    test: (h) => /(^|\.)facebook\.com$/i.test(h) || /(^|\.)fb\.com$/i.test(h),
    canonicalize: (url) => {
      const segs = url.pathname.split("/").filter(Boolean);
      if (segs.length === 0) return null;
      const first = segs[0];
      if (!first) return null;
      if (first.toLowerCase() === "pages" && segs[1]) {
        return `https://www.facebook.com/pages/${segs[1]}`;
      }
      if (
        ["sharer", "share", "login", "dialog", "tr"].includes(first.toLowerCase())
      ) {
        return null;
      }
      return `https://www.facebook.com/${first.toLowerCase()}`;
    },
  },
  {
    test: (h) => /(^|\.)youtube\.com$/i.test(h) || /(^|\.)youtu\.be$/i.test(h),
    canonicalize: (url) => {
      const segs = url.pathname.split("/").filter(Boolean);
      if (segs.length === 0) return null;
      const first = segs[0];
      if (!first) return null;
      const TRAILING = new Set([
        "videos", "about", "playlists", "community", "channels", "featured", "streams",
      ]);
      if (first.startsWith("@")) {
        return `https://www.youtube.com/${first.toLowerCase()}`;
      }
      if ((first === "c" || first === "channel" || first === "user") && segs[1]) {
        const rest = segs.slice(1).filter((s) => !TRAILING.has(s.toLowerCase()));
        if (rest.length === 0) return null;
        const second = rest[0];
        if (!second) return null;
        return `https://www.youtube.com/${first}/${second}`;
      }
      return null;
    },
  },
  {
    test: (h) => /(^|\.)tiktok\.com$/i.test(h),
    canonicalize: (url) => {
      const segs = url.pathname.split("/").filter(Boolean);
      const handle = segs[0];
      if (!handle || !handle.startsWith("@")) return null;
      return `https://www.tiktok.com/${handle.toLowerCase()}`;
    },
  },
  {
    test: (h) => /(^|\.)github\.com$/i.test(h),
    canonicalize: (url) => {
      const segs = url.pathname.split("/").filter(Boolean);
      const handle = segs[0];
      if (!handle) return null;
      return `https://github.com/${handle.toLowerCase()}`;
    },
  },
];

/**
 * Platform-aware canonicalization. Returns null when the URL isn't a
 * recognized social platform OR when it's a reserved path (login, share, etc).
 */
export function canonicalizeSocialUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  for (const platform of SOCIAL_HOST_PATTERNS) {
    if (platform.test(host)) return platform.canonicalize(url);
  }
  return null;
}

const SOCIAL_HOSTS = [
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "github.com",
  "medium.com",
];

const TITLE_RE =
  /\b(founder|co[- ]?founder|ceo|chief executive officer|managing director|md|chief technology officer|cto|chief marketing officer|cmo|head of (growth|marketing|sales|product|design)|marketing (manager|director)|sales (manager|director)|e[- ]?commerce (manager|lead)|owner|principal|president|vp|vice president|director)\b/i;

const TECH_SIGNATURES: Array<{ marker: RegExp; label: string }> = [
  { marker: /wp-content|wordpress/i, label: "WordPress" },
  { marker: /\/_next\//i, label: "Next.js" },
  { marker: /shopify|cdn\.shopify\.com/i, label: "Shopify" },
  { marker: /wix\.com|_wix/i, label: "Wix" },
  { marker: /squarespace/i, label: "Squarespace" },
  { marker: /webflow/i, label: "Webflow" },
  { marker: /\.myshopify\./i, label: "Shopify" },
  { marker: /gatsby/i, label: "Gatsby" },
  { marker: /nuxt/i, label: "Nuxt" },
  { marker: /drupal/i, label: "Drupal" },
  { marker: /magento/i, label: "Magento" },
  { marker: /googletagmanager/i, label: "GTM" },
  { marker: /google-analytics|gtag\(/i, label: "Google Analytics" },
  { marker: /hubspot/i, label: "HubSpot" },
  { marker: /intercom/i, label: "Intercom" },
  { marker: /tailwindcss/i, label: "Tailwind CSS" },
];

/**
 * JSON-LD parsing — tolerant to malformed JSON, @graph wrappers, and arrays.
 */
export function parseJsonLd(doc: HTMLElement): Array<Record<string, unknown>> {
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
  const out: Array<Record<string, unknown>> = [];
  for (const b of blocks) {
    const raw = b.text?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const asObj = item as Record<string, unknown>;
        const graph = asObj["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (g && typeof g === "object") out.push(g as Record<string, unknown>);
          }
        } else {
          out.push(asObj);
        }
      }
    } catch {
      // ignore malformed block
    }
  }
  return out;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return undefined;
}
function asStringArray(v: unknown): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

/**
 * Pull company-level facts from a parsed HTML document. Only reports facts
 * directly observed; callers decide how to merge with the lead record.
 */
export function extractCompanyIntel(
  doc: HTMLElement,
  finalUrl: string,
  html: string
): CompanyIntel {
  const urlObj = new URL(finalUrl);
  const intel: CompanyIntel = {
    domain: urlObj.hostname.replace(/^www\./, "").toLowerCase(),
    services: [],
    categories: [],
    emails: [],
    phones: [],
    socialUrls: [],
    techIndicators: [],
  };

  const ogTitle = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
  const metaTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const pageTitle = doc.querySelector("title")?.text?.trim();
  intel.name = ogTitle?.trim() || metaTitle?.trim() || pageTitle;

  const desc =
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
  if (desc) intel.description = desc.trim();

  // JSON-LD — Organization / LocalBusiness takes precedence over meta.
  const ld = parseJsonLd(doc);
  for (const item of ld) {
    const type = (item["@type"] ?? "").toString().toLowerCase();
    if (
      type.includes("organization") ||
      type.includes("localbusiness") ||
      type === "corporation"
    ) {
      intel.name = asString(item["name"]) ?? intel.name;
      intel.description = asString(item["description"]) ?? intel.description;
      const industryStr = asString(item["industry"]);
      if (industryStr) intel.industry = [industryStr];
      intel.categories.push(...asStringArray(item["@type"]));

      const addr = item["address"];
      if (addr && typeof addr === "object") {
        const a = addr as Record<string, unknown>;
        intel.city = asString(a["addressLocality"]) ?? intel.city;
        intel.region = asString(a["addressRegion"]) ?? intel.region;
        intel.country = asString(a["addressCountry"]) ?? intel.country;
        const streetAddress = asString(a["streetAddress"]);
        if (streetAddress) intel.address = streetAddress;
      } else if (typeof addr === "string") {
        intel.address = addr;
      }

      const email = asString(item["email"]);
      if (email) intel.emails.push(email.replace(/^mailto:/i, ""));
      // JSON-LD `telephone` is treated as a canonical origin — passes the
      // strict phone validator with `fromTel: true`.
      const phone = asString(item["telephone"]);
      if (phone && isPlausiblePhone(phone, { fromTel: true })) {
        const norm = normalizePhone(phone);
        if (norm) intel.phones.push(norm);
      }

      const sameAs = asStringArray(item["sameAs"]);
      for (const s of sameAs) intel.socialUrls.push(s);
    }
  }

  // mailto: + tel: anchors
  for (const a of doc.querySelectorAll('a[href^="mailto:"]')) {
    const href = a.getAttribute("href");
    if (!href) continue;
    const email = href.replace(/^mailto:/i, "").split("?")[0];
    if (email) intel.emails.push(email);
  }
  for (const a of doc.querySelectorAll('a[href^="tel:"], a[href^="TEL:"]')) {
    const href = a.getAttribute("href");
    if (!href) continue;
    const raw = href.replace(/^tel:/i, "").split(/[;?]/)[0] ?? "";
    if (!raw || !isPlausiblePhone(raw, { fromTel: true })) continue;
    const norm = normalizePhone(raw);
    if (norm) intel.phones.push(norm);
  }

  // Visible-text email sweep (phone sweep removed — too permissive, see
  // `isPlausiblePhone` doc comment).
  const text = doc.text || "";
  const foundEmails = text.match(EMAIL_RE) ?? [];
  for (const e of foundEmails) intel.emails.push(e);

  // Social URLs — canonicalize per platform so one handle maps to one URL.
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    try {
      const parsed = new URL(href, finalUrl);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      if (!SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) continue;
      const canonical = canonicalizeSocialUrl(parsed.toString());
      // Fall back to the raw URL when the platform isn't in our canonicalizer
      // (pinterest, medium, generic .com domains) — still better than dropping it.
      intel.socialUrls.push(canonical ?? parsed.toString());
    } catch {
      /* ignore */
    }
  }

  // Contact page link
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    const text = (a.text || "").trim().toLowerCase();
    const lower = href.toLowerCase();
    if (
      /contact|get[- ]in[- ]touch|reach[- ]us|hire[- ]us|work[- ]with[- ]us/.test(text) ||
      /\/contact|\/get-in-touch|\/reach|\/connect/.test(lower)
    ) {
      try {
        intel.contactPageUrl = new URL(href, finalUrl).toString();
        break;
      } catch {
        /* ignore */
      }
    }
  }

  // Tech indicators — fingerprint common CMS/framework strings.
  for (const sig of TECH_SIGNATURES) {
    if (sig.marker.test(html)) intel.techIndicators.push(sig.label);
  }
  const generator = doc.querySelector('meta[name="generator"]')?.getAttribute("content");
  if (generator) intel.techIndicators.push(generator);

  // Dedup. Phones are already normalized at insertion time (strict mode).
  intel.emails = unique(intel.emails.map((e) => e.toLowerCase()));
  intel.phones = unique(intel.phones);
  intel.socialUrls = unique(intel.socialUrls);
  intel.techIndicators = unique(intel.techIndicators);
  intel.categories = unique(intel.categories);

  return intel;
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

/* ------------------------------------------------------------------
 * People extraction
 * ------------------------------------------------------------------ */

/**
 * Extract publicly-documented decision-makers. Looks for:
 *   - JSON-LD Person items with jobTitle
 *   - "Name — Title" / "Name, Title" patterns on team / about / leadership pages
 *   - <h2>/<h3>/<h4> headings followed by title spans
 *
 * Returns candidates with evidence (the surrounding snippet) and confidence
 * reflecting how structured the source was.
 */
export function extractPeople(
  doc: HTMLElement,
  finalUrl: string
): ExtractedPersonCandidate[] {
  const results: ExtractedPersonCandidate[] = [];
  const seen = new Set<string>();

  // JSON-LD Person
  for (const item of parseJsonLd(doc)) {
    const type = (item["@type"] ?? "").toString().toLowerCase();
    if (type.includes("person")) {
      const name = asString(item["name"]);
      const title = asString(item["jobTitle"]);
      if (!name) continue;
      const profileSource = item["url"] ?? item["sameAs"];
      const profile = Array.isArray(profileSource)
        ? asString(profileSource[0])
        : asString(profileSource);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        fullName: name,
        jobTitle: title,
        profileUrl: profile,
        sourceUrl: finalUrl,
        evidence: `JSON-LD Person on ${finalUrl}`,
        confidence: title && TITLE_RE.test(title) ? "high" : "medium",
      });
    }
  }

  // Headings — "Name — Title" patterns inside common team-section tags.
  const candidates = doc.querySelectorAll(
    "h1, h2, h3, h4, h5, .team-member, .leader, .person, article"
  );
  for (const el of candidates) {
    const raw = (el.text || "").replace(/\s+/g, " ").trim();
    if (!raw || raw.length > 240) continue;

    // Try dash/en-dash/em-dash/comma/pipe separator between name and title.
    const m = raw.match(
      /^([A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3})\s*(?:[—–\-|,·•])\s*(.{3,120})$/
    );
    if (!m || !m[1] || !m[2]) continue;
    const name = m[1].trim();
    const title = m[2].trim();
    if (!TITLE_RE.test(title)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      fullName: name,
      jobTitle: title,
      sourceUrl: finalUrl,
      evidence: raw.slice(0, 240),
      confidence: "medium",
    });
  }

  // Fallback — <p>-level sibling pattern: a bold name followed by a title line.
  for (const strong of doc.querySelectorAll("strong, b")) {
    const name = (strong.text || "").trim();
    if (!isPlausibleName(name)) continue;
    const parent = strong.parentNode as HTMLElement | null;
    const context = (parent?.text || "").replace(/\s+/g, " ").trim();
    const titleMatch = context.match(TITLE_RE);
    if (!titleMatch) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      fullName: name,
      jobTitle: titleMatch[0],
      sourceUrl: finalUrl,
      evidence: context.slice(0, 240),
      confidence: "low",
    });
  }

  // v2: card patterns — team-member / leader / person wrapper cards where
  // name + title live in sibling elements rather than a dash-separated string.
  // Shopify theme defaults, Webflow team CMS, generic Tailwind team sections
  // all fall into this shape.
  const CARD_SELECTOR =
    '[class*="team-member"], [class*="team-card"], [class*="leader"], [class*="person"], [class*="member"], [class*="exec"], [class*="staff"], [class*="founder"], .team-member, .leader, .person';
  for (const card of doc.querySelectorAll(CARD_SELECTOR)) {
    const raw = (card.text || "").replace(/\s+/g, " ").trim();
    if (!raw || raw.length > 400) continue;

    // Split by element boundaries (child headings + paragraphs) so name and
    // title in separate siblings become separate tokens, THEN by in-text
    // separators for cards that collapse everything onto one line.
    const childTexts: string[] = [];
    for (const child of card.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,div,li")) {
      const t = (child.text || "").replace(/\s+/g, " ").trim();
      if (t && t.length <= 200) childTexts.push(t);
    }
    const separatorTokens = raw
      .split(/\s*[|·•–—,\n]\s*/)
      .map((t) => t.trim())
      .filter(Boolean);
    const tokens = Array.from(new Set([...childTexts, ...separatorTokens]));

    let name: string | null = null;
    let title: string | null = null;
    for (const t of tokens) {
      if (!name && isPlausibleName(t)) {
        name = t;
        continue;
      }
      if (name && TITLE_RE.test(t)) {
        title = t;
        break;
      }
    }
    if (!name || !title) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      fullName: name,
      jobTitle: title,
      sourceUrl: finalUrl,
      evidence: raw.slice(0, 240),
      confidence: "medium",
    });
  }

  // v2: <figure>/<figcaption> name + title pairs.
  for (const fig of doc.querySelectorAll("figure")) {
    const cap = fig.querySelector("figcaption");
    if (!cap) continue;
    const raw = (cap.text || "").replace(/\s+/g, " ").trim();
    const m = raw.match(/^(.+?)\s*(?:[—–\-|,·•\n]+)\s*(.+)$/);
    if (!m || !m[1] || !m[2]) continue;
    const name = m[1].trim();
    const title = m[2].trim();
    if (!isPlausibleName(name) || !TITLE_RE.test(title)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      fullName: name,
      jobTitle: title,
      sourceUrl: finalUrl,
      evidence: raw.slice(0, 240),
      confidence: "medium",
    });
  }

  // v2: image alt-attribute names paired with a nearby title string.
  for (const img of doc.querySelectorAll("img[alt]")) {
    const alt = (img.getAttribute("alt") ?? "").trim();
    if (!isPlausibleName(alt)) continue;
    const parent = img.parentNode as HTMLElement | null;
    if (!parent) continue;
    const context = (parent.text || "").replace(/\s+/g, " ").trim();
    const titleMatch = context.match(TITLE_RE);
    if (!titleMatch) continue;
    const key = alt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      fullName: alt,
      jobTitle: titleMatch[0],
      sourceUrl: finalUrl,
      evidence: context.slice(0, 240),
      confidence: "low",
    });
  }

  return results;
}

/**
 * A plausible full name: 2–4 Capitalized words, each 2–30 chars, no digits.
 * Rejects headings like "Our Team" (too short per word count), "123" (digits),
 * and marketing fluff.
 */
export function isPlausibleName(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/\d/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  for (const w of words) {
    if (w.length < 2 || w.length > 30) return false;
    if (!/^[A-Z][a-zA-Z'’.-]+$/.test(w)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------
 * Link discovery
 * ------------------------------------------------------------------ */

const PRIORITY_PATH_RE =
  /\/(about|about[- ]us|company|team|leadership|people|our[- ]team|contact|contact[- ]us|services|solutions|products|work|projects|portfolio|clients|case[- ]studies)(\/|$)/i;

export type DiscoveredLink = {
  url: string;
  priority: number; // higher = fetch first
};

export function extractLinks(
  doc: HTMLElement,
  finalUrl: string,
  rootDomain: string
): DiscoveredLink[] {
  const out = new Map<string, number>();
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    let parsed: URL;
    try {
      parsed = new URL(href, finalUrl);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== rootDomain) continue;
    parsed.hash = "";
    // Skip obvious binary/asset paths — those waste the crawl budget.
    if (
      /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|rar|mp4|mp3|woff2?|ttf|eot|otf|js|css|json|xml)$/i.test(
        parsed.pathname
      )
    ) {
      continue;
    }
    const normalized = parsed.toString();
    const priority = PRIORITY_PATH_RE.test(parsed.pathname) ? 10 : 1;
    const existing = out.get(normalized) ?? 0;
    if (priority > existing) out.set(normalized, priority);
  }
  return Array.from(out.entries()).map(([url, priority]) => ({ url, priority }));
}
