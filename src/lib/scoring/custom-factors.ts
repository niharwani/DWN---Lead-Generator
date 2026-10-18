/**
 * Custom scoring factor evaluator.
 *
 * This is a pure helper — no DB access, no I/O. Given an array of
 * `CustomScoreFactor` definitions and the standard `ScoreInputs`, it returns
 * additional `ScoreFactor[]` entries to be appended to the scoring breakdown.
 *
 * Supported detection methods:
 *   - `presence`  — fires if a lead field is non-empty.
 *   - `regex`     — matches a regex against evidence snippets from audit findings.
 *   - `count`     — fires if a numeric field meets a threshold.
 *   - `manual`    — always fires (weight applies unconditionally when enabled).
 */

import type { ScoreFactor } from "@/lib/demo/types";
import type { ScoreInputs } from "./engine";

export type DetectionMethod = "presence" | "regex" | "count" | "manual";

export type PresenceConfig = {
  /** Field path on the lead object, e.g. "publicEmail" or "websiteUrl". */
  field: string;
};

export type RegexConfig = {
  /** Regular expression source string (no delimiters). */
  pattern: string;
  /** Flags for the regex, e.g. "i". Default: "i". */
  flags?: string;
};

export type CountConfig = {
  /** Numeric field on the lead or audit to compare.
   *  `fitScore` maps to `lead.score.total`.
   */
  field: "fitScore" | "auditFindingsCount";
  /** Comparison operator. */
  operator: ">=" | "<=" | "==" | ">" | "<";
  /** Threshold value. */
  threshold: number;
};

export type ManualConfig = Record<string, never>;

export type CustomScoreFactor = {
  id: string;
  code: string;
  label: string;
  /** Points to add (positive) or subtract (negative) when the factor fires. */
  points: number;
  enabled: boolean;
  detectionMethod: DetectionMethod;
  detectionConfig: PresenceConfig | RegexConfig | CountConfig | ManualConfig | null;
};

/**
 * Evaluate all enabled custom factors against the provided inputs.
 * Returns a list of `ScoreFactor` entries to append to the breakdown.
 */
export function evaluateCustomFactors(
  factors: CustomScoreFactor[],
  inputs: ScoreInputs
): ScoreFactor[] {
  const result: ScoreFactor[] = [];

  for (const factor of factors) {
    if (!factor.enabled) continue;

    const fired = doesFactorFire(factor, inputs);
    if (!fired.fires) continue;

    result.push({
      code: factor.code,
      label: factor.label,
      points: factor.points,
      evidence: fired.evidence,
    });
  }

  return result;
}

type FireResult =
  | { fires: false }
  | { fires: true; evidence: string };

function doesFactorFire(factor: CustomScoreFactor, inputs: ScoreInputs): FireResult {
  const { lead, audit } = inputs;

  switch (factor.detectionMethod) {
    case "manual": {
      return {
        fires: true,
        evidence: `Custom factor "${factor.label}" — manually always-on.`,
      };
    }

    case "presence": {
      const cfg = factor.detectionConfig as PresenceConfig | null;
      if (!cfg?.field) return { fires: false };
      // Safe dynamic read of a string field from Lead
      const value = (lead as Record<string, unknown>)[cfg.field];
      const nonEmpty =
        value !== undefined && value !== null && value !== "" && value !== false;
      if (!nonEmpty) return { fires: false };
      return {
        fires: true,
        evidence: `Field "${cfg.field}" is present on the lead.`,
      };
    }

    case "regex": {
      const cfg = factor.detectionConfig as RegexConfig | null;
      if (!cfg?.pattern) return { fires: false };

      let re: RegExp;
      try {
        re = new RegExp(cfg.pattern, cfg.flags ?? "i");
      } catch {
        return { fires: false };
      }

      // Test against audit finding evidence snippets
      if (audit?.findings?.length) {
        for (const finding of audit.findings) {
          const haystack = [finding.evidence, finding.description, finding.title]
            .filter(Boolean)
            .join(" ");
          if (re.test(haystack)) {
            return {
              fires: true,
              evidence: `Regex /${cfg.pattern}/ matched in audit finding "${finding.title}".`,
            };
          }
        }
      }

      // Also test against lead fields: businessName, niche, category
      const leadText = [lead.businessName, lead.niche, lead.category].filter(Boolean).join(" ");
      if (re.test(leadText)) {
        return {
          fires: true,
          evidence: `Regex /${cfg.pattern}/ matched in lead fields.`,
        };
      }

      return { fires: false };
    }

    case "count": {
      const cfg = factor.detectionConfig as CountConfig | null;
      if (!cfg) return { fires: false };

      let actual: number | null = null;
      if (cfg.field === "fitScore") {
        actual = lead.score?.total ?? null;
      } else if (cfg.field === "auditFindingsCount") {
        actual = audit?.findings?.length ?? null;
      }

      if (actual === null) return { fires: false };

      const passes = (() => {
        switch (cfg.operator) {
          case ">=": return actual >= cfg.threshold;
          case "<=": return actual <= cfg.threshold;
          case "==": return actual === cfg.threshold;
          case ">": return actual > cfg.threshold;
          case "<": return actual < cfg.threshold;
          default: return false;
        }
      })();

      if (!passes) return { fires: false };

      return {
        fires: true,
        evidence: `Field "${cfg.field}" is ${actual}, which passes the condition ${cfg.operator} ${cfg.threshold}.`,
      };
    }

    default:
      return { fires: false };
  }
}
