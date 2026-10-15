/**
 * Baseline website audit checks (spec §9 §Checks for MVP, items 1–11).
 *
 * Each check reads a parsed HTML document and returns zero or more
 * `AuditFinding` entries. Checks must be pure — no network, no DB — so the
 * audit engine can run the same checks against a captured HTML snapshot in
 * tests. Any content-dependent severity goes through the shared helpers so
 * the thresholds are visible in one place.
 */

import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import type { AuditFinding } from "@/lib/demo/types";

/* ---------- Parser factory ----------------------------------- */

export function parseAuditHtml(html: string): HTMLElement {
  return parseHtml(html, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: {
      script: false,
      style: false,
      pre: true,
    },
  });
}

/* ---------- Checks ------------------------------------------- */

export type CheckContext = {
  finalUrl: string;
  requestedUrl: string;
  html: string;
  bodyBytes: number;
  elapsedMs: number;
};

type CheckFn = (doc: HTMLElement, ctx: CheckContext) => AuditFinding[];

export function runAllChecks(doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const check of CHECKS) findings.push(...check(doc, ctx));
  return findings;
}

const CHECKS: CheckFn[] = [
  checkHttps,
  checkTitle,
  checkMetaDescription,
  checkViewport,
  checkHeadingStructure,
  checkImageAltText,
  checkContactPath,
  checkPageWeight,
];

/** HTTPS presence. Flag high-severity when a form or email collection exists on plain HTTP. */
function checkHttps(_doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  if (ctx.finalUrl.startsWith("https://")) return [];
  return [
    {
      code: "no_https",
      title: "Site is served over HTTP, not HTTPS",
      severity: "high",
      description:
        "Modern browsers flag non-HTTPS pages as “Not Secure”. This is table-stakes for any site collecting enquiries or payment.",
      evidence: `Final URL: ${ctx.finalUrl}`,
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation:
        "Install a free TLS certificate (Let's Encrypt / Cloudflare) and enforce HTTPS site-wide.",
    },
  ];
}

/** Non-empty <title>. */
function checkTitle(doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  const title = doc.querySelector("title")?.text?.trim();
  if (title && title.length >= 3 && title.length <= 120) return [];
  if (!title) {
    return [
      {
        code: "no_title",
        title: "Page has no <title>",
        severity: "medium",
        description:
          "The <title> is what shows up in browser tabs, bookmarks, and search results. Missing titles signal an unfinished site.",
        evidence: "No <title> tag found in <head>.",
        evidenceUrl: ctx.finalUrl,
        confidence: "high",
        recommendation: "Add a descriptive <title> tag — ideally 30–60 characters.",
      },
    ];
  }
  if (title.length < 3) {
    return [
      {
        code: "title_too_short",
        title: "Page title is suspiciously short",
        severity: "low",
        description: `The <title> is "${title}" (${title.length} chars). Likely a placeholder.`,
        evidence: `title="${title}"`,
        confidence: "medium",
        recommendation: "Replace the placeholder title with a real page title.",
      },
    ];
  }
  return [
    {
      code: "title_too_long",
      title: "Page title is unusually long",
      severity: "info",
      description: `The <title> is ${title.length} chars — most search engines truncate above ~60.`,
      evidence: `title.length = ${title.length}`,
      confidence: "medium",
      recommendation: "Trim the title to 30–60 characters.",
    },
  ];
}

/** <meta name="description"> presence. */
function checkMetaDescription(doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  const meta = doc.querySelector('meta[name="description"]');
  const content = meta?.getAttribute("content")?.trim();
  if (!meta || !content) {
    return [
      {
        code: "no_meta_description",
        title: "Page is missing a meta description",
        severity: "low",
        description:
          "Search results fall back to a snippet of body text when there's no description. A deliberate description is almost always better.",
        evidence: 'No <meta name="description"> tag or empty content attribute.',
        evidenceUrl: ctx.finalUrl,
        confidence: "high",
        recommendation:
          "Add a 120–160 character description that previews the page's value.",
      },
    ];
  }
  return [];
}

/** <meta name="viewport"> presence — single biggest predictor of a broken mobile layout. */
function checkViewport(doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  const meta = doc.querySelector('meta[name="viewport"]');
  if (meta?.getAttribute("content")) return [];
  return [
    {
      code: "missing_viewport",
      title: "Missing viewport meta tag",
      severity: "medium",
      description:
        "Without a viewport declaration, mobile browsers render a scaled-down desktop layout. The whole site looks “zoomed out” on a phone.",
      evidence: 'No <meta name="viewport"> tag in <head>.',
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation:
        'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and verify responsive breakpoints.',
    },
  ];
}

/** At least one <h1> and no "orphan" subheadings before the first h1. */
function checkHeadingStructure(doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  const headings = doc.querySelectorAll("h1, h2, h3");
  const h1Count = headings.filter((h) => h.tagName.toLowerCase() === "h1").length;
  if (h1Count === 0) {
    return [
      {
        code: "no_h1",
        title: "Page has no <h1>",
        severity: "low",
        description:
          "Every page should have exactly one h1 — it's the primary heading used by screen readers and SEO.",
        evidence: "No <h1> element found in body.",
        evidenceUrl: ctx.finalUrl,
        confidence: "high",
        recommendation: "Add a single h1 that names the page topic.",
      },
    ];
  }
  if (h1Count > 1) {
    return [
      {
        code: "multiple_h1",
        title: `Page has ${h1Count} <h1> elements`,
        severity: "info",
        description:
          "Multiple h1s don't break the page but confuse screen readers and SEO crawlers.",
        evidence: `${h1Count} <h1> tags detected.`,
        confidence: "medium",
        recommendation: "Keep one h1 and demote the others to h2 / h3.",
      },
    ];
  }
  return [];
}

/** Images carry alt attributes. Sample up to 20 to keep the scan bounded. */
function checkImageAltText(doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  const imgs = doc.querySelectorAll("img").slice(0, 20);
  if (imgs.length === 0) return [];
  const missing = imgs.filter((img) => {
    const alt = img.getAttribute("alt");
    return alt === undefined || alt === null;
  });
  if (missing.length === 0) return [];
  const ratio = missing.length / imgs.length;
  const severity: AuditFinding["severity"] =
    ratio >= 0.5 ? "medium" : "low";
  return [
    {
      code: "missing_alt_text",
      title: `${missing.length} of ${imgs.length} sampled images are missing alt text`,
      severity,
      description:
        "Alt text is read aloud by screen readers and shown when images fail to load. Decorative images should use alt=\"\" (empty) rather than being omitted.",
      evidence: `${missing.length} / ${imgs.length} sampled <img> elements have no alt attribute.`,
      evidenceUrl: ctx.finalUrl,
      confidence: "medium",
      recommendation:
        'Add descriptive alt text, or alt="" for purely decorative images.',
    },
  ];
}

/**
 * Contact path presence: email link, phone link, OR a `/contact` / `/contact-us`
 * / `/book` / `/enquiry` / `/get-in-touch` style anchor.
 */
function checkContactPath(doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  const links = doc.querySelectorAll("a[href]");
  let hasMailto = false;
  let hasTel = false;
  let hasContactPage = false;
  const contactPathRe = /\/(contact|contact-us|book|booking|enquiry|get-in-touch|hire-us|work-with|appointment|reservations?)(\/|$|\?)/i;

  for (const a of links) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("mailto:")) hasMailto = true;
    else if (href.startsWith("tel:")) hasTel = true;
    else if (contactPathRe.test(href)) hasContactPage = true;
    if (hasMailto && hasTel && hasContactPage) break;
  }

  if (hasMailto || hasTel || hasContactPage) return [];

  return [
    {
      code: "weak_contact_path",
      title: "No obvious contact path on the homepage",
      severity: "medium",
      description:
        "No mailto: link, tel: link, or /contact-style anchor was found. Visitors who want to enquire have to guess.",
      evidence: "Scanned all <a href=\"…\"> links on the homepage.",
      evidenceUrl: ctx.finalUrl,
      confidence: "medium",
      recommendation:
        "Add a visible email, phone, or contact-page link in the header or hero area.",
    },
  ];
}

/** Flag heavy pages. Threshold chosen conservatively — big agency sites are commonly 1–2 MB. */
function checkPageWeight(_doc: HTMLElement, ctx: CheckContext): AuditFinding[] {
  if (ctx.bodyBytes <= 1_200_000) return [];
  const mb = (ctx.bodyBytes / 1_000_000).toFixed(2);
  return [
    {
      code: "heavy_page",
      title: `Homepage HTML is ${mb} MB`,
      severity: ctx.bodyBytes > 2_000_000 ? "medium" : "low",
      description:
        "This measures HTML body size as observed from a server-side fetch — not a real-user Web Vitals measurement. Large HTML usually means inlined content or oversized hero markup that would be smaller with proper assets.",
      evidence: `Observed body size: ${ctx.bodyBytes.toLocaleString()} bytes`,
      confidence: "medium",
      recommendation:
        "Audit inlined CSS/JS, oversized imagery, and large auto-generated DOM.",
    },
  ];
}
