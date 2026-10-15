/**
 * One-off Phase 4 smoke test. Runs the audit engine end-to-end against a
 * handful of real + synthetic URLs so we see:
 *   - SSRF rejections (private IPs, bad schemes, metadata hostnames)
 *   - Successful fetch + parse + checks against a real public page
 *   - Error paths (unavailable host, non-HTML response)
 *
 * NOT part of the committed test suite — this talks to the internet.
 *   pnpm tsx scripts/smoke-audit.ts
 */

import { runAudit } from "../src/lib/audit/engine";

const TARGETS: Array<{ label: string; url: string; expectBlock?: boolean }> = [
  { label: "Loopback IPv4", url: "http://127.0.0.1/", expectBlock: true },
  { label: "Private IPv4", url: "http://10.0.0.1/", expectBlock: true },
  {
    label: "Cloud metadata",
    url: "http://169.254.169.254/latest/meta-data/",
    expectBlock: true,
  },
  { label: "Loopback IPv6", url: "http://[::1]/", expectBlock: true },
  { label: "javascript: scheme", url: "javascript:alert(1)", expectBlock: true },
  { label: "Bare .local suffix", url: "http://my-router.local/", expectBlock: true },
  // Real public URLs
  { label: "example.com (public, minimal HTML)", url: "https://example.com/" },
  { label: "cloudflare.com (public, big HTML)", url: "https://www.cloudflare.com/" },
  {
    label: "non-HTML (an image URL)",
    url: "https://www.cloudflare.com/favicon.ico",
  },
];

async function main() {
  for (const target of TARGETS) {
    console.log("");
    console.log(`---- ${target.label} ----`);
    console.log(`URL: ${target.url}`);
    const result = await runAudit({
      leadId: "smoke-test",
      requestedUrl: target.url,
    });
    console.log("Audit status :", result.audit.status);
    console.log("HTTP status  :", result.audit.httpStatus ?? "—");
    console.log("Error cat    :", result.audit.errorCategory ?? "—");
    console.log("Findings     :", result.audit.findings.length);
    for (const f of result.audit.findings.slice(0, 4)) {
      console.log(`  [${f.severity}] ${f.code}: ${f.title}`);
    }
    console.log("Condition    :", result.derivedCondition);
    if (target.expectBlock) {
      const blocked = result.audit.status === "blocked";
      console.log(blocked ? "✓ blocked as expected" : "✗ EXPECTED BLOCK");
    }
  }
}

main().catch((err) => {
  console.error("smoke audit failed", err);
  process.exit(1);
});
