/**
 * Website intelligence findings — opportunities we can lead outreach with.
 *
 * Reuses the shared `AuditFinding` shape so these flow through the existing
 * audit UI without a parallel display layer. Each finding records: affected
 * URL (evidenceUrl), finding type (code), supporting evidence (evidence),
 * severity, and recommendation.
 *
 * Pure — no network, no DB. Takes a parsed HTMLElement + context.
 */

import type { HTMLElement } from "node-html-parser";
import type { AuditFinding, AuditFindingSeverity } from "@/lib/demo/types";
import type { CompanyIntel } from "./types";

export type FindingContext = {
  finalUrl: string;
  html: string;
  bytes: number;
  intel: CompanyIntel;
};

export function runIntelFindings(
  doc: HTMLElement,
  ctx: FindingContext
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Missing title
  const title = doc.querySelector("title")?.text?.trim();
  if (!title) {
    findings.push({
      code: "intel_missing_title",
      title: "Page is missing a <title>",
      severity: "high",
      description: "The page has no <title> element — search engines use the URL as a fallback.",
      evidence: "No <title> tag found in document head.",
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation: "Add a descriptive, keyword-aware <title> under 60 characters.",
    });
  }

  // Missing meta description
  const metaDesc = doc
    .querySelector('meta[name="description"]')
    ?.getAttribute("content")
    ?.trim();
  if (!metaDesc) {
    findings.push({
      code: "intel_missing_meta_description",
      title: "Missing meta description",
      severity: "medium",
      description:
        "Search engines show the meta description under the title. Without one, they synthesize one from body text.",
      evidence: "No meta[name=description] on the page.",
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation: "Write a 140–160 character meta description emphasising the primary conversion.",
    });
  }

  // Missing canonical
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (!canonical) {
    findings.push({
      code: "intel_missing_canonical",
      title: "No canonical URL declared",
      severity: "low",
      description:
        "Pages without <link rel=canonical> are vulnerable to duplicate-content ranking issues.",
      evidence: "No <link rel=canonical> found.",
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation: "Add <link rel=canonical href=\"{finalUrl}\"> to the head.",
    });
  }

  // Missing viewport
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute("content");
  if (!viewport) {
    findings.push({
      code: "intel_missing_viewport",
      title: "No mobile viewport meta",
      severity: "high",
      description:
        "Without a viewport meta, mobile browsers render the page at desktop width and zoom out — unusable on phones.",
      evidence: "No meta[name=viewport] found.",
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation:
        'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the head.',
    });
  }

  // No HTTPS
  if (!ctx.finalUrl.startsWith("https://")) {
    findings.push({
      code: "intel_no_https",
      title: "Site is not served over HTTPS",
      severity: "high",
      description:
        "Browsers mark non-HTTPS pages as 'Not Secure'. Lead-gen forms especially need HTTPS to be trusted.",
      evidence: `Served at ${ctx.finalUrl}`,
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation: "Install a Let's Encrypt / Cloudflare TLS certificate and 301-redirect HTTP → HTTPS.",
    });
  }

  // Missing structured data (no JSON-LD at all)
  const jsonLd = doc.querySelectorAll('script[type="application/ld+json"]');
  if (jsonLd.length === 0) {
    findings.push({
      code: "intel_missing_structured_data",
      title: "No JSON-LD structured data",
      severity: "low",
      description:
        "Pages with Organization / LocalBusiness JSON-LD get richer SERP treatment and are easier for AI to understand.",
      evidence: "No application/ld+json blocks found.",
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation:
        "Add an Organization or LocalBusiness JSON-LD block with name, url, logo, and contactPoint.",
    });
  }

  // No contact information discoverable
  if (ctx.intel.emails.length === 0 && ctx.intel.phones.length === 0) {
    findings.push({
      code: "intel_no_contact_info",
      title: "No public contact information",
      severity: "medium",
      description:
        "No public email or phone number was found anywhere on the page — raises friction for prospective customers.",
      evidence: "No mailto:/tel: links and no detectable email in body text.",
      evidenceUrl: ctx.finalUrl,
      confidence: "medium",
      recommendation:
        "Add a public email and phone (or a clearly linked contact page) in the header or footer.",
    });
  }

  // Missing H1
  if (!doc.querySelector("h1")) {
    findings.push({
      code: "intel_missing_h1",
      title: "Page has no H1",
      severity: "low",
      description:
        "Every content page should have exactly one H1 that describes the primary offer.",
      evidence: "No <h1> element found.",
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation: "Add a single H1 that mirrors the dominant search intent.",
    });
  }

  // Broken-looking image references (missing src / data-src)
  const imgs = doc.querySelectorAll("img");
  const brokenImgs = imgs.filter(
    (i) => !i.getAttribute("src") && !i.getAttribute("data-src")
  );
  if (brokenImgs.length > 0) {
    findings.push({
      code: "intel_broken_image_refs",
      title: `${brokenImgs.length} <img> tag(s) with no src`,
      severity: "medium",
      description:
        "Images without src often render as broken icons on first load — poor first impression and bad for Core Web Vitals.",
      evidence: `${brokenImgs.length} img elements have neither src nor data-src.`,
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation:
        "Ensure every <img> has a resolvable src (or data-src with lazy-loading library) and alt text.",
    });
  }

  // Images missing alt
  const missingAlt = imgs.filter((i) => {
    const alt = i.getAttribute("alt");
    return alt == null; // omitted → bad; empty string is explicit decorative
  });
  if (imgs.length > 0 && missingAlt.length / imgs.length > 0.3) {
    findings.push({
      code: "intel_missing_alt_text",
      title: "Many images missing alt text",
      severity: "low",
      description:
        "Alt attributes help screen readers and give search engines contextual signal. Over 30% of images here have no alt attribute at all.",
      evidence: `${missingAlt.length} of ${imgs.length} images missing alt attribute.`,
      evidenceUrl: ctx.finalUrl,
      confidence: "high",
      recommendation:
        "Add descriptive alt text for every content image. Use alt=\"\" only for purely decorative images.",
    });
  }

  // CTA detection — look for any visible button-like element with a transactional label.
  const ctaRe = /(contact|get started|get in touch|book|request|hire|try|sign up|download|get a quote)/i;
  const possibleCtas = doc.querySelectorAll("a, button").filter((el) => ctaRe.test(el.text || ""));
  if (possibleCtas.length === 0) {
    findings.push({
      code: "intel_missing_cta",
      title: "No obvious call-to-action detected",
      severity: "medium",
      description:
        "No link or button matched common CTA phrasing. Visitors may not know what action to take.",
      evidence:
        "Scanned anchors and buttons for 'contact', 'get started', 'book', 'request', 'hire', 'try', 'sign up', 'download', 'get a quote'.",
      evidenceUrl: ctx.finalUrl,
      confidence: "medium",
      recommendation: "Add a prominent primary CTA button that leads to the contact / booking page.",
    });
  }

  return findings;
}

/* ---------- Dedup ------------------------------------------- *
 *
 * Collapse findings sharing the same `code` into a single entry so the UI
 * doesn't show N copies of the same issue once per crawled page.
 *
 * Rules:
 *   • Keep the FIRST occurrence as the representative (preserves ordering).
 *   • Collect distinct `evidenceUrl` values from every occurrence.
 *   • Append `(N page(s) affected: url1, url2, url3, +N more)` to the
 *     representative's `evidence` string (first 3 URLs + overflow suffix).
 *   • When ≥ 3 pages share the finding, elevate the representative's
 *     severity by one step (low→medium, medium→high, high stays).
 *
 * Shape-preserving: `AuditFinding` is unchanged.
 */

const SEVERITY_ORDER: AuditFindingSeverity[] = ["info", "low", "medium", "high"];

function bumpSeverity(sev: AuditFindingSeverity): AuditFindingSeverity {
  const idx = SEVERITY_ORDER.indexOf(sev);
  if (idx < 0) return sev;
  const next = SEVERITY_ORDER[Math.min(idx + 1, SEVERITY_ORDER.length - 1)];
  return next ?? sev;
}

function truncatedPageList(urls: string[], limit = 3): string {
  if (urls.length <= limit) return urls.join(", ");
  const shown = urls.slice(0, limit).join(", ");
  const extra = urls.length - limit;
  return `${shown}, +${extra} more`;
}

export function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const byCode = new Map<
    string,
    { rep: AuditFinding; urls: string[]; count: number }
  >();
  const order: string[] = [];

  for (const f of findings) {
    const existing = byCode.get(f.code);
    if (!existing) {
      // Copy so we don't mutate the caller's objects.
      const rep: AuditFinding = { ...f };
      const urls = f.evidenceUrl ? [f.evidenceUrl] : [];
      byCode.set(f.code, { rep, urls, count: 1 });
      order.push(f.code);
      continue;
    }
    existing.count += 1;
    if (f.evidenceUrl && !existing.urls.includes(f.evidenceUrl)) {
      existing.urls.push(f.evidenceUrl);
    }
  }

  const out: AuditFinding[] = [];
  for (const code of order) {
    const entry = byCode.get(code);
    if (!entry) continue;
    const { rep, urls, count } = entry;
    if (count > 1) {
      const pageCount = urls.length;
      if (pageCount > 0) {
        const suffix = `(${pageCount} page(s) affected: ${truncatedPageList(urls)})`;
        rep.evidence = rep.evidence ? `${rep.evidence} ${suffix}` : suffix;
      }
      // Severity bump when the issue is site-wide (≥ 3 pages).
      if (pageCount >= 3) {
        rep.severity = bumpSeverity(rep.severity);
      }
    }
    out.push(rep);
  }
  return out;
}
