/**
 * Custom audit signal evaluator.
 *
 * Pure helper — no DB, no I/O. Given an array of `CustomAuditSignal` rows,
 * the fetched HTML, and metrics, returns additional `AuditFinding[]` to append
 * to the baseline audit findings.
 *
 * Supported detection methods:
 *   - `regex`    — run a regex against the fetched HTML body.
 *   - `presence` — check for a known social/link pattern in the HTML.
 *   - `absence`  — fire when a pattern is NOT found.
 *   - `count`    — fire when a pattern matches at least N times.
 */

import type { AuditFinding } from "@/lib/demo/types";

export type SignalDetectionMethod = "regex" | "presence" | "absence" | "count";

export type SignalSeverity = "info" | "low" | "medium" | "high";

export type CustomAuditSignalRegexConfig = {
  pattern: string;
  flags?: string;
};

export type CustomAuditSignalPresenceConfig = {
  /** One of: "instagram" | "linkedin" | "facebook" | "youtube" | custom URL fragment */
  linkPattern: string;
};

export type CustomAuditSignalAbsenceConfig = {
  pattern: string;
  flags?: string;
};

export type CustomAuditSignalCountConfig = {
  pattern: string;
  flags?: string;
  /** Minimum number of matches required to fire. */
  minCount: number;
};

export type CustomAuditSignal = {
  id: string;
  code: string;
  label: string;
  severity: SignalSeverity;
  enabled: boolean;
  detectionMethod: SignalDetectionMethod;
  detectionConfig:
    | CustomAuditSignalRegexConfig
    | CustomAuditSignalPresenceConfig
    | CustomAuditSignalAbsenceConfig
    | CustomAuditSignalCountConfig
    | null;
};

export type CustomSignalInputs = {
  html: string;
  finalUrl?: string;
};

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  instagram: /instagram\.com/i,
  linkedin: /linkedin\.com/i,
  facebook: /facebook\.com/i,
  youtube: /youtube\.com|youtu\.be/i,
};

/**
 * Evaluate all enabled custom audit signals against the provided HTML + metrics.
 * Returns additional `AuditFinding[]` entries to append to the audit findings.
 */
export function evaluateCustomSignals(
  signals: CustomAuditSignal[],
  inputs: CustomSignalInputs
): AuditFinding[] {
  const results: AuditFinding[] = [];

  for (const signal of signals) {
    if (!signal.enabled) continue;

    const finding = buildFinding(signal, inputs);
    if (finding) results.push(finding);
  }

  return results;
}

function buildFinding(
  signal: CustomAuditSignal,
  inputs: CustomSignalInputs
): AuditFinding | null {
  const { html, finalUrl } = inputs;

  switch (signal.detectionMethod) {
    case "regex": {
      const cfg = signal.detectionConfig as CustomAuditSignalRegexConfig | null;
      if (!cfg?.pattern) return null;

      let re: RegExp;
      try {
        re = new RegExp(cfg.pattern, cfg.flags ?? "i");
      } catch {
        return null;
      }

      if (!re.test(html)) return null;

      return makeAuditFinding(signal, {
        evidence: `Pattern /${cfg.pattern}/ matched in page HTML.`,
        evidenceUrl: finalUrl,
      });
    }

    case "presence": {
      const cfg = signal.detectionConfig as CustomAuditSignalPresenceConfig | null;
      if (!cfg?.linkPattern) return null;

      // Check named social patterns first
      const social = SOCIAL_PATTERNS[cfg.linkPattern.toLowerCase()];
      const re = social ?? (() => {
        try { return new RegExp(cfg.linkPattern, "i"); } catch { return null; }
      })();

      if (!re) return null;
      if (!re.test(html)) return null;

      return makeAuditFinding(signal, {
        evidence: `Link matching "${cfg.linkPattern}" was found in page HTML.`,
        evidenceUrl: finalUrl,
      });
    }

    case "absence": {
      const cfg = signal.detectionConfig as CustomAuditSignalAbsenceConfig | null;
      if (!cfg?.pattern) return null;

      let re: RegExp;
      try {
        re = new RegExp(cfg.pattern, cfg.flags ?? "i");
      } catch {
        return null;
      }

      // Fire only when pattern is ABSENT
      if (re.test(html)) return null;

      return makeAuditFinding(signal, {
        evidence: `Pattern /${cfg.pattern}/ was NOT found in page HTML.`,
        evidenceUrl: finalUrl,
      });
    }

    case "count": {
      const cfg = signal.detectionConfig as CustomAuditSignalCountConfig | null;
      if (!cfg?.pattern) return null;

      let re: RegExp;
      try {
        re = new RegExp(cfg.pattern, `g${cfg.flags?.replace("g", "") ?? "i"}`);
      } catch {
        return null;
      }

      const matches = html.match(re) ?? [];
      if (matches.length < cfg.minCount) return null;

      return makeAuditFinding(signal, {
        evidence: `Pattern /${cfg.pattern}/ matched ${matches.length} time(s) (minimum: ${cfg.minCount}).`,
        evidenceUrl: finalUrl,
      });
    }

    default:
      return null;
  }
}

function makeAuditFinding(
  signal: CustomAuditSignal,
  extra: { evidence: string; evidenceUrl?: string }
): AuditFinding {
  return {
    code: signal.code,
    title: signal.label,
    severity: signal.severity,
    description: `Custom audit signal: ${signal.label}`,
    evidence: extra.evidence,
    evidenceUrl: extra.evidenceUrl,
    confidence: "medium",
    recommendation: `Review the "${signal.label}" signal and determine whether action is needed.`,
  };
}
