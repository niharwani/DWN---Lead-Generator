import { describe, expect, it } from "vitest";
import type { AuditFinding } from "@/lib/demo/types";
import { dedupeFindings } from "@/lib/intel/findings";

function mkFinding(partial: Partial<AuditFinding> & Pick<AuditFinding, "code" | "evidenceUrl">): AuditFinding {
  return {
    title: partial.title ?? `title-${partial.code}`,
    severity: partial.severity ?? "low",
    description: partial.description ?? "desc",
    evidence: partial.evidence,
    confidence: partial.confidence ?? "medium",
    recommendation: partial.recommendation ?? "fix it",
    ...partial,
  };
}

describe("dedupeFindings", () => {
  it("collapses the same code across 3 pages into one entry with elevated severity + URL list", () => {
    const findings: AuditFinding[] = [
      mkFinding({
        code: "slow_images",
        evidenceUrl: "https://x.com/a",
        severity: "medium",
      }),
      mkFinding({
        code: "slow_images",
        evidenceUrl: "https://x.com/b",
        severity: "medium",
      }),
      mkFinding({
        code: "slow_images",
        evidenceUrl: "https://x.com/c",
        severity: "medium",
      }),
    ];
    const out = dedupeFindings(findings);
    expect(out).toHaveLength(1);
    const [row] = out;
    expect(row).toBeDefined();
    expect(row?.code).toBe("slow_images");
    expect(row?.severity).toBe("high"); // medium → high because 3 pages affected
    expect(row?.evidence).toContain("3 page(s) affected");
    expect(row?.evidence).toContain("https://x.com/a");
    expect(row?.evidence).toContain("https://x.com/b");
    expect(row?.evidence).toContain("https://x.com/c");
  });

  it("does not elevate severity when only 2 pages share the finding", () => {
    const findings: AuditFinding[] = [
      mkFinding({
        code: "slow_images",
        evidenceUrl: "https://x.com/a",
        severity: "medium",
      }),
      mkFinding({
        code: "slow_images",
        evidenceUrl: "https://x.com/b",
        severity: "medium",
      }),
    ];
    const out = dedupeFindings(findings);
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("medium"); // unchanged
    expect(out[0]?.evidence).toContain("2 page(s) affected");
  });

  it("keeps the FIRST occurrence as the representative (ordering is preserved)", () => {
    const findings: AuditFinding[] = [
      mkFinding({
        code: "no_h1",
        evidenceUrl: "https://x.com/first",
        title: "First title",
      }),
      mkFinding({
        code: "no_h1",
        evidenceUrl: "https://x.com/second",
        title: "Second title",
      }),
    ];
    const out = dedupeFindings(findings);
    expect(out[0]?.title).toBe("First title");
  });

  it("truncates evidence URL list to 3 shown + overflow suffix", () => {
    const findings: AuditFinding[] = [
      "a",
      "b",
      "c",
      "d",
      "e",
    ].map((u) =>
      mkFinding({ code: "x", evidenceUrl: `https://x.com/${u}`, severity: "low" })
    );
    const out = dedupeFindings(findings);
    const ev = out[0]?.evidence ?? "";
    expect(ev).toContain("https://x.com/a");
    expect(ev).toContain("https://x.com/b");
    expect(ev).toContain("https://x.com/c");
    expect(ev).toContain("+2 more");
    expect(ev).not.toContain("https://x.com/d");
    expect(ev).not.toContain("https://x.com/e");
  });

  it("elevates low → medium when 3 pages affected", () => {
    const findings: AuditFinding[] = ["a", "b", "c"].map((u) =>
      mkFinding({ code: "y", evidenceUrl: `https://x.com/${u}`, severity: "low" })
    );
    const out = dedupeFindings(findings);
    expect(out[0]?.severity).toBe("medium");
  });

  it("keeps high at high (saturates)", () => {
    const findings: AuditFinding[] = ["a", "b", "c", "d"].map((u) =>
      mkFinding({ code: "z", evidenceUrl: `https://x.com/${u}`, severity: "high" })
    );
    const out = dedupeFindings(findings);
    expect(out[0]?.severity).toBe("high");
  });

  it("passes through singletons unchanged", () => {
    const findings: AuditFinding[] = [
      mkFinding({
        code: "only_once",
        evidenceUrl: "https://x.com/a",
        severity: "medium",
        evidence: "original evidence",
      }),
    ];
    const out = dedupeFindings(findings);
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("medium");
    expect(out[0]?.evidence).toBe("original evidence");
  });

  it("groups by code — different codes do not merge", () => {
    const findings: AuditFinding[] = [
      mkFinding({ code: "a", evidenceUrl: "https://x.com/1" }),
      mkFinding({ code: "b", evidenceUrl: "https://x.com/2" }),
      mkFinding({ code: "a", evidenceUrl: "https://x.com/3" }),
    ];
    const out = dedupeFindings(findings);
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.code)).toEqual(["a", "b"]);
  });

  it("does not mutate the input findings", () => {
    const input: AuditFinding[] = [
      mkFinding({
        code: "k",
        evidenceUrl: "https://x.com/a",
        severity: "low",
      }),
      mkFinding({
        code: "k",
        evidenceUrl: "https://x.com/b",
        severity: "low",
      }),
      mkFinding({
        code: "k",
        evidenceUrl: "https://x.com/c",
        severity: "low",
      }),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    dedupeFindings(input);
    expect(input).toEqual(snapshot);
  });

  it("skips evidenceUrl collection when evidenceUrl is absent", () => {
    const findings: AuditFinding[] = [
      mkFinding({ code: "n", evidenceUrl: undefined as unknown as string }),
      mkFinding({ code: "n", evidenceUrl: undefined as unknown as string }),
    ];
    const out = dedupeFindings(findings);
    expect(out).toHaveLength(1);
    // No "page(s) affected" suffix because there were no URLs to list.
    expect(out[0]?.evidence ?? "").not.toContain("page(s) affected");
  });
});
