/**
 * One-off smoke script to exercise the Web Intelligence crawler against a
 * real public URL. Prints extracted intel, people, pages, findings.
 *
 * Also exercises the post-crawl pipeline the runner would run against D1:
 *   - dedupeFindings() (Stream D)
 *   - enrichWithLlm() (Stream B) — only if GEMINI_API_KEY is set
 *   - JS rendering fallback (Stream C) — only if CLOUDFLARE_API_TOKEN set
 *
 *   pnpm tsx scripts/intel-smoke.ts <url>
 */

import { crawlSite } from "../src/lib/intel/crawler";
import { dedupeFindings } from "../src/lib/intel/findings";
import { enrichWithLlm } from "../src/lib/intel/llm-extract";

async function main() {
  const seedUrl = process.argv[2] ?? "https://dwn-site.pages.dev/";
  const env: Record<string, string | undefined> = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL_CLASSIFIER: process.env.GEMINI_MODEL_CLASSIFIER,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  };

  console.log(`\n🕸️  Web Intelligence crawl → ${seedUrl}`);
  console.log(
    `   providers: Gemini=${env.GEMINI_API_KEY ? "on" : "off"} · JS-render=${env.CLOUDFLARE_API_TOKEN ? "on" : "off"}\n`
  );
  const started = Date.now();

  const outcome = await crawlSite(
    { seedUrl },
    {
      maxPages: 10,
      maxDepth: 2,
      perDomainCap: 10,
      totalBudgetMs: 60_000,
      ...(env.CLOUDFLARE_API_TOKEN ? { renderEnv: env } : {}),
    }
  );

  const elapsed = Date.now() - started;
  console.log(`⏱  ${elapsed} ms · ${outcome.pages.length} pages processed\n`);

  // Pages
  console.log("─── Pages ───────────────────────────────────────────────");
  for (const p of outcome.pages) {
    const bytes = p.bytes != null ? `${Math.round(p.bytes / 1024)} KB` : "—";
    const rendered = p.rendered ? " [js]" : "";
    const line = [
      (p.status + rendered).padEnd(10),
      String(p.httpStatus ?? "—").padStart(4),
      bytes.padStart(8),
      `d${p.depth}`,
      p.discoveredVia.padEnd(7),
      p.title ? `"${p.title.slice(0, 60)}"` : "(no title)",
      p.finalUrl ?? p.url,
    ].join("  ");
    console.log("  " + line);
    if (p.errorReason) console.log("           ↳ " + p.errorReason);
  }

  // LLM enrichment (if available)
  let intel = outcome.intel;
  let people = outcome.people;
  if (env.GEMINI_API_KEY) {
    console.log("\n─── Gemini enrichment ──────────────────────────────────");
    try {
      const enriched = await enrichWithLlm(
        {
          intel: outcome.intel,
          people: outcome.people,
          pages: outcome.pages
            .filter((p) => p.status === "fetched")
            .map((p) => ({ url: p.finalUrl ?? p.url, title: p.title })),
        },
        env
      );
      const addedPeople = enriched.people.length - outcome.people.length;
      console.log(
        `  Heuristic people: ${outcome.people.length} → after LLM: ${enriched.people.length} (+${addedPeople})`
      );
      intel = enriched.intel;
      people = enriched.people;
    } catch (err) {
      console.log("  LLM enrichment failed:", (err as Error).message);
    }
  }

  // Intel
  console.log("\n─── Company intel ───────────────────────────────────────");
  console.log("  Domain:         ", intel.domain);
  if (intel.name) console.log("  Name:           ", intel.name);
  if (intel.description) console.log("  Description:    ", intel.description);
  if (intel.address) console.log("  Address:        ", intel.address);
  if (intel.city || intel.region || intel.country) {
    console.log(
      "  Location:       ",
      [intel.city, intel.region, intel.country].filter(Boolean).join(", ")
    );
  }
  if (intel.emails.length)
    console.log("  Emails:         ", intel.emails.slice(0, 5).join(", "));
  if (intel.phones.length) {
    console.log("  Phones:         ", intel.phones.slice(0, 5).join(", "));
  } else {
    console.log("  Phones:          (none — strict mode rejects body-text matches)");
  }
  if (intel.contactPageUrl)
    console.log("  Contact page:   ", intel.contactPageUrl);
  if (intel.socialUrls.length) {
    console.log("  Social (canonical):");
    for (const s of intel.socialUrls.slice(0, 10)) console.log("   ·", s);
  }
  if (intel.techIndicators.length)
    console.log("  Tech:           ", intel.techIndicators.join(", "));

  // People
  console.log("\n─── Decision-makers ─────────────────────────────────────");
  if (people.length === 0) {
    console.log("  (none extracted)");
  } else {
    for (const p of people) {
      console.log(
        `  [${p.confidence}] ${p.fullName}${p.jobTitle ? ` — ${p.jobTitle}` : ""}`
      );
      console.log(`           ↳ source: ${p.sourceUrl}`);
      if (p.evidence) console.log(`           ↳ evidence: ${p.evidence.slice(0, 120)}`);
    }
  }

  // Findings — deduped per Stream D
  const raw = outcome.findings;
  const deduped = dedupeFindings(raw);
  console.log("\n─── Website findings (deduped) ──────────────────────────");
  console.log(`  Raw per-page: ${raw.length} · After dedup: ${deduped.length}\n`);
  if (deduped.length === 0) {
    console.log("  ✓ No findings — baseline checks all passed.");
  } else {
    for (const f of deduped) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.code}: ${f.title}`);
      console.log(`           ↳ ${f.description}`);
      if (f.evidence) console.log(`           ↳ evidence: ${f.evidence}`);
      console.log(`           ↳ fix: ${f.recommendation}`);
    }
  }

  console.log();
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exit(1);
});
