/**
 * Variable substitution engine.
 *
 * Supports double-brace syntax: {{lead.business_name}}, {{owner.studio_name}},
 * {{workspace.name}}, {{audit.headline_finding}}, {{custom.myVar}}.
 *
 * Missing keys resolve to an empty string — no exceptions.
 */

import type { Lead, WebsiteAudit, OpportunityBrief, ServiceOffering } from "@/lib/demo/types";

export type VariableContext = {
  lead?: Partial<Lead> & {
    estimated_deal_value?: number;
    currency?: string;
    recommended_service?: string;
  };
  owner?: {
    studio_name?: string;
    pitch?: string;
    case_study_url?: string;
    signature?: string;
  };
  workspace?: {
    name?: string;
    slug?: string;
    accent_color?: string;
  };
  audit?: {
    headline_finding?: string;
    page_weight_mb?: number | null;
    load_ms?: number | null;
  };
  custom?: Record<string, string>;
};

const BRACE_RE = /\{\{([^}]+)\}\}/g;

/**
 * Substitute all `{{namespace.key}}` tokens in `template` using the provided
 * context. Unknown namespaces or keys resolve to empty string. Returns both
 * the substituted output and the list of variable keys that were actually used.
 */
export function substitute(
  template: string,
  context: VariableContext
): { output: string; usedKeys: string[] } {
  const usedKeys: string[] = [];

  const output = template.replace(BRACE_RE, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = resolve(key, context);
    if (value !== "") {
      usedKeys.push(key);
    }
    return value;
  });

  return { output, usedKeys };
}

function resolve(key: string, context: VariableContext): string {
  const dotIndex = key.indexOf(".");
  if (dotIndex < 0) return "";

  const namespace = key.slice(0, dotIndex);
  const field = key.slice(dotIndex + 1);

  switch (namespace) {
    case "lead":
      return resolveLeadField(field, context.lead ?? {});
    case "owner":
      return resolveOwnerField(field, context.owner ?? {});
    case "workspace":
      return resolveWorkspaceField(field, context.workspace ?? {});
    case "audit":
      return resolveAuditField(field, context.audit ?? {});
    case "custom":
      return context.custom?.[field] ?? "";
    default:
      return "";
  }
}

function resolveLeadField(field: string, lead: VariableContext["lead"] & object): string {
  // Map snake_case keys to camelCase lead properties
  switch (field) {
    case "business_name":
      return (lead as Partial<Lead>).businessName ?? "";
    case "city":
      return (lead as Partial<Lead>).city ?? "";
    case "region":
      return (lead as Partial<Lead>).region ?? "";
    case "country":
      return (lead as Partial<Lead>).country ?? "";
    case "niche":
      return (lead as Partial<Lead>).niche ?? "";
    case "category":
      return (lead as Partial<Lead>).category ?? "";
    case "website_url":
      return (lead as Partial<Lead>).websiteUrl ?? "";
    case "public_email":
      return (lead as Partial<Lead>).publicEmail ?? "";
    case "public_phone":
      return (lead as Partial<Lead>).publicPhone ?? "";
    case "address":
      return (lead as Partial<Lead>).address ?? "";
    case "estimated_deal_value":
      return lead.estimated_deal_value != null ? String(lead.estimated_deal_value) : "";
    case "currency":
      return lead.currency ?? (lead as Partial<Lead>).currency ?? "";
    case "recommended_service":
      return lead.recommended_service ?? "";
    default:
      return "";
  }
}

function resolveOwnerField(field: string, owner: NonNullable<VariableContext["owner"]>): string {
  switch (field) {
    case "studio_name":
      return owner.studio_name ?? "";
    case "pitch":
      return owner.pitch ?? "";
    case "case_study_url":
      return owner.case_study_url ?? "";
    case "signature":
      return owner.signature ?? owner.studio_name ?? "";
    default:
      return "";
  }
}

function resolveWorkspaceField(
  field: string,
  workspace: NonNullable<VariableContext["workspace"]>
): string {
  switch (field) {
    case "name":
      return workspace.name ?? "";
    case "slug":
      return workspace.slug ?? "";
    case "accent_color":
      return workspace.accent_color ?? "";
    default:
      return "";
  }
}

function resolveAuditField(
  field: string,
  audit: NonNullable<VariableContext["audit"]>
): string {
  switch (field) {
    case "headline_finding":
      return audit.headline_finding ?? "";
    case "page_weight_mb":
      return audit.page_weight_mb != null ? String(audit.page_weight_mb) : "";
    case "load_ms":
      return audit.load_ms != null ? String(audit.load_ms) : "";
    default:
      return "";
  }
}

/**
 * Build a `VariableContext` from the rich objects available in a draft-build
 * context. Useful for `previewTemplateAction` and the settings preview.
 */
export function buildContext(opts: {
  lead?: Partial<Lead>;
  studioName?: string;
  pitch?: string;
  caseStudyUrl?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  accentColor?: string;
  audit?: WebsiteAudit | null;
  brief?: { recommendedService?: string };
  customVars?: Record<string, string>;
}): VariableContext {
  const { lead, audit } = opts;

  const auditCtx: VariableContext["audit"] = audit
    ? {
        headline_finding: audit.findings[0]?.title ?? undefined,
        page_weight_mb:
          audit.metrics?.pageWeightBytes != null
            ? parseFloat((audit.metrics.pageWeightBytes / 1_000_000).toFixed(2))
            : null,
        load_ms: audit.metrics?.loadMs ?? null,
      }
    : {};

  return {
    lead: lead
      ? {
          ...lead,
          estimated_deal_value: (lead as Lead & { estimatedDealValue?: number }).estimatedDealValue,
          currency: (lead as Lead & { currency?: string }).currency,
          recommended_service: opts.brief?.recommendedService,
        }
      : {},
    owner: {
      studio_name: opts.studioName,
      pitch: opts.pitch,
      case_study_url: opts.caseStudyUrl,
      signature: opts.studioName,
    },
    workspace: {
      name: opts.workspaceName,
      slug: opts.workspaceSlug,
      accent_color: opts.accentColor,
    },
    audit: auditCtx,
    custom: opts.customVars,
  };
}

/** Return the full list of known variable keys (for autocomplete). */
export const KNOWN_VARIABLE_KEYS: string[] = [
  "lead.business_name",
  "lead.city",
  "lead.region",
  "lead.country",
  "lead.niche",
  "lead.category",
  "lead.website_url",
  "lead.public_email",
  "lead.public_phone",
  "lead.address",
  "lead.estimated_deal_value",
  "lead.currency",
  "lead.recommended_service",
  "owner.studio_name",
  "owner.pitch",
  "owner.case_study_url",
  "owner.signature",
  "workspace.name",
  "workspace.slug",
  "workspace.accent_color",
  "audit.headline_finding",
  "audit.page_weight_mb",
  "audit.load_ms",
];
