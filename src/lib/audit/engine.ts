/**
 * Website audit orchestrator.
 *
 * Flow: validate (SSRF) → fetch (bounded) → parse → run checks → derive
 * `website_condition` → persist. Returns the final audit record either way;
 * failure paths produce an audit with status `unavailable` / `blocked` /
 * `failed` plus a single explanatory finding so the Lead Detail timeline
 * still reflects what happened.
 */

import { auditFetch, DEFAULT_FETCH_OPTIONS, type FetchOptions } from "./fetcher";
import { parseAuditHtml, runAllChecks } from "./checks";
import type {
  AuditFinding,
  WebsiteAudit,
  WebsiteCondition,
} from "@/lib/demo/types";

export const AUDIT_VERSION = "audit/v0.1";

export type RunAuditInput = {
  leadId: string;
  requestedUrl: string;
  options?: Partial<FetchOptions>;
};

export type AuditRunResult = {
  audit: Omit<WebsiteAudit, "id">;
  derivedCondition: WebsiteCondition;
};

export async function runAudit(input: RunAuditInput): Promise<AuditRunResult> {
  const startedAt = new Date().toISOString();
  const options: FetchOptions = { ...DEFAULT_FETCH_OPTIONS, ...input.options };

  const fetched = await auditFetch(input.requestedUrl, options);
  const completedAt = new Date().toISOString();

  if (!fetched.ok) {
    const [status, condition] = classifyFailure(fetched.stage);
    const finding = failureFinding(input.requestedUrl, fetched);
    const audit: Omit<WebsiteAudit, "id"> = {
      leadId: input.leadId,
      requestedUrl: input.requestedUrl,
      finalUrl: fetched.finalUrl,
      status,
      httpStatus: fetched.httpStatus,
      auditVersion: AUDIT_VERSION,
      findings: [finding],
      startedAt,
      completedAt,
      errorCategory: fetched.stage,
    };
    return { audit, derivedCondition: condition };
  }

  // Parse + run checks
  let doc;
  try {
    doc = parseAuditHtml(fetched.html);
  } catch (err) {
    const finding: AuditFinding = {
      code: "html_parse_failed",
      title: "Could not parse HTML",
      severity: "high",
      description: `HTML parser threw: ${(err as Error).message}`,
      evidence: `Response body was ${fetched.bodyBytes.toLocaleString()} bytes`,
      evidenceUrl: fetched.finalUrl,
      confidence: "high",
      recommendation:
        "Verify the URL returns valid HTML. Non-HTML responses (XML, JSON, plain text, binary) are not audit-able.",
    };
    return {
      audit: {
        leadId: input.leadId,
        requestedUrl: input.requestedUrl,
        finalUrl: fetched.finalUrl,
        status: "failed",
        httpStatus: fetched.httpStatus,
        auditVersion: AUDIT_VERSION,
        findings: [finding],
        startedAt,
        completedAt,
        errorCategory: "html_parse_failed",
      },
      derivedCondition: "unknown",
    };
  }

  const findings = runAllChecks(doc, {
    finalUrl: fetched.finalUrl,
    requestedUrl: input.requestedUrl,
    html: fetched.html,
    bodyBytes: fetched.bodyBytes,
    elapsedMs: fetched.elapsedMs,
  });

  const derivedCondition = deriveWebsiteCondition(findings);
  const partial = fetched.redirectChain.length > 1 ? true : false;

  return {
    audit: {
      leadId: input.leadId,
      requestedUrl: input.requestedUrl,
      finalUrl: fetched.finalUrl,
      status: "success",
      httpStatus: fetched.httpStatus,
      auditVersion: AUDIT_VERSION,
      findings,
      startedAt,
      completedAt,
      metrics: {
        source: "server-fetch",
        pageWeightBytes: fetched.bodyBytes,
        loadMs: fetched.elapsedMs,
        note: partial
          ? `Server-observed timing across ${fetched.redirectChain.length} hop(s). Not a real-user measurement.`
          : "Server-observed timing — not a real-user Web Vitals measurement.",
      },
    },
    derivedCondition,
  };
}

/** Translate the fetcher's failure stage into (audit status, lead condition). */
function classifyFailure(
  stage: Exclude<
    import("./fetcher").FetchResult,
    { ok: true }
  >["stage"]
): [WebsiteAudit["status"], WebsiteCondition] {
  switch (stage) {
    case "ssrf_blocked":
      return ["blocked", "unknown"];
    case "timeout":
    case "network_error":
    case "http_error":
    case "aborted":
      return ["unavailable", "inaccessible"];
    case "too_many_redirects":
      return ["partial", "weak"];
    case "oversized":
      return ["partial", "weak"];
    case "non_html":
      return ["failed", "unknown"];
    default:
      return ["failed", "unknown"];
  }
}

function failureFinding(
  requestedUrl: string,
  result: Exclude<import("./fetcher").FetchResult, { ok: true }>
): AuditFinding {
  const base: AuditFinding = {
    code: `fetch_${result.stage}`,
    title: titleForStage(result.stage),
    severity: severityForStage(result.stage),
    description: result.reason,
    evidence: `Requested: ${requestedUrl}${result.httpStatus ? ` · HTTP ${result.httpStatus}` : ""}`,
    evidenceUrl: result.finalUrl ?? requestedUrl,
    confidence: "high",
    recommendation: recommendationForStage(result.stage),
  };
  return base;
}

function titleForStage(stage: string): string {
  switch (stage) {
    case "ssrf_blocked":
      return "URL blocked by SSRF policy";
    case "timeout":
      return "Request timed out";
    case "network_error":
      return "Network error reaching site";
    case "http_error":
      return "Server returned an error status";
    case "too_many_redirects":
      return "Too many redirects";
    case "oversized":
      return "Response body exceeded size cap";
    case "non_html":
      return "URL does not return HTML";
    case "aborted":
      return "Request aborted";
    default:
      return "Audit could not complete";
  }
}

function severityForStage(stage: string): AuditFinding["severity"] {
  if (stage === "ssrf_blocked") return "info";
  if (stage === "non_html") return "low";
  if (stage === "oversized") return "medium";
  return "high";
}

function recommendationForStage(stage: string): string {
  switch (stage) {
    case "ssrf_blocked":
      return "Verify this URL points at a publicly reachable site, not an internal / private address.";
    case "timeout":
    case "network_error":
      return "Flag this lead as a credible first conversation starter — their site is effectively offline. Confirm manually before outreach.";
    case "http_error":
      return "The server returned a non-success status. If it's a 404 the content moved; if it's a 5xx the host is unstable.";
    case "too_many_redirects":
      return "Redirect loops often indicate a misconfigured CDN or SSL redirect. Worth flagging in outreach.";
    case "oversized":
      return "Site HTML exceeded the audit cap. The homepage is almost certainly carrying unused inline assets — strong signal for a rebuild.";
    case "non_html":
      return "This URL points at a non-HTML resource (PDF, image, JSON). Point the audit at the public-facing HTML page instead.";
    default:
      return "Re-run the audit after addressing the underlying issue.";
  }
}

/** Map a set of findings to the owner-facing `websiteCondition`. */
export function deriveWebsiteCondition(
  findings: AuditFinding[]
): WebsiteCondition {
  if (findings.length === 0) return "strong";
  const highs = findings.filter((f) => f.severity === "high").length;
  const mediums = findings.filter((f) => f.severity === "medium").length;
  if (highs >= 2) return "weak";
  if (highs === 1) return "outdated";
  if (mediums >= 3) return "outdated";
  if (mediums >= 1) return "acceptable";
  return "strong";
}
