import { describe, it, expect } from "vitest";
import { buildTemplateDraft } from "@/lib/outreach/draft";
import type {
  Lead,
  OpportunityBrief,
  ServiceOffering,
  WebsiteAudit,
} from "@/lib/demo/types";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_t1",
    businessName: "Haveli Jewellers",
    niche: "Jewellery & luxury",
    city: "Mumbai",
    country: "India",
    sourceName: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    pipelineStage: "new",
    doNotContact: { flagged: false },
    tags: [],
    websiteCondition: "unknown",
    ...overrides,
  } as Lead;
}

function baseService(): ServiceOffering {
  return {
    id: "svc_1",
    name: "Website build",
    description: "Full-stack website build",
    idealCustomer: "SMBs with weak sites",
    valueProposition: "Fast, accessible, measurable.",
    isActive: true,
  };
}

describe("buildTemplateDraft", () => {
  it("picks email channel when a public email exists", () => {
    const draft = buildTemplateDraft({
      lead: baseLead({ publicEmail: "hi@example.test" }),
      services: [baseService()],
    });
    expect(draft.channel).toBe("email");
    expect(draft.subject).toContain("Haveli Jewellers");
  });

  it("falls back to contact_form when only a website is present", () => {
    const draft = buildTemplateDraft({
      lead: baseLead({ websiteUrl: "https://haveli.test" }),
      services: [baseService()],
    });
    expect(draft.channel).toBe("contact_form");
    expect(draft.subject).toBeNull();
  });

  it("falls back to 'other' when neither email nor website exist", () => {
    const draft = buildTemplateDraft({
      lead: baseLead(),
      services: [baseService()],
    });
    expect(draft.channel).toBe("other");
  });

  it("includes brief observation when brief is provided", () => {
    const brief: OpportunityBrief = {
      id: "brief_1",
      leadId: "lead_t1",
      summary: "Needs a rebuild.",
      observations: [
        { observation: "Homepage CTA is unclear", evidence: "cta_hierarchy finding" },
      ],
      possibleOpportunity: "A landing-page refresh could lift conversions.",
      recommendedService: "Website build",
      suggestedDeliverable: "New homepage + CTA.",
      confidence: "high",
      unknowns: [],
      createdAt: "2026-01-01T00:00:00Z",
      source: "template",
    };
    const draft = buildTemplateDraft({
      lead: baseLead({ websiteUrl: "https://haveli.test" }),
      brief,
      services: [baseService()],
    });
    expect(draft.body).toContain("Homepage CTA is unclear");
    expect(draft.body).toContain("landing-page refresh");
    expect(draft.personalizationEvidence).toContain("Brief confidence: high");
  });

  it("marks the source as template", () => {
    const draft = buildTemplateDraft({
      lead: baseLead(),
      services: [baseService()],
    });
    expect(draft.source).toBe("template");
  });

  it("mentions a successful audit in the body", () => {
    const audit: WebsiteAudit = {
      id: "audit_1",
      leadId: "lead_t1",
      requestedUrl: "https://haveli.test",
      status: "success",
      auditVersion: "audit/v0.1",
      findings: [
        {
          code: "missing_viewport",
          title: "Missing viewport",
          severity: "medium",
          description: "No viewport meta",
          confidence: "high",
          recommendation: "Add <meta name='viewport'>.",
        },
      ],
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:00Z",
    };
    const draft = buildTemplateDraft({
      lead: baseLead({ websiteUrl: "https://haveli.test" }),
      audit,
      services: [baseService()],
    });
    expect(draft.body).toContain("mobile viewport tag");
    expect(draft.personalizationEvidence.some((e) => e.includes("audit/v0.1"))).toBe(
      true
    );
  });

  it("cites the homepage weight in MB when the page is heavy", () => {
    const audit: WebsiteAudit = {
      id: "audit_2",
      leadId: "lead_t1",
      requestedUrl: "https://haveli.test",
      status: "success",
      auditVersion: "audit/v0.1",
      findings: [
        {
          code: "heavy_page",
          title: "Heavy homepage HTML",
          severity: "medium",
          description: "HTML body is large",
          confidence: "medium",
          recommendation: "Audit inlined assets.",
        },
      ],
      metrics: { source: "server-fetch", pageWeightBytes: 4_821_013 },
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:00Z",
    };
    const draft = buildTemplateDraft({
      lead: baseLead({ websiteUrl: "https://haveli.test" }),
      audit,
      services: [baseService()],
    });
    expect(draft.body).toContain("4.8 MB");
    expect(
      draft.personalizationEvidence.some((e) =>
        e.includes("pageWeightBytes=4821013")
      )
    ).toBe(true);
  });

  it("calls out HTTP / 'Not secure' when the site is missing HTTPS", () => {
    const audit: WebsiteAudit = {
      id: "audit_3",
      leadId: "lead_t1",
      requestedUrl: "http://haveli.test",
      status: "success",
      auditVersion: "audit/v0.1",
      findings: [
        {
          code: "no_https",
          title: "Site is served over HTTP",
          severity: "high",
          description: "No HTTPS",
          confidence: "high",
          recommendation: "Install TLS.",
        },
      ],
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:00Z",
    };
    const draft = buildTemplateDraft({
      lead: baseLead({ websiteUrl: "http://haveli.test" }),
      audit,
      services: [baseService()],
    });
    expect(draft.body).toContain("HTTP");
    expect(draft.body).toContain("Not secure");
    expect(
      draft.personalizationEvidence.some((e) => e.includes("no_https"))
    ).toBe(true);
  });

  it("cites the alt-text image count parsed from evidence", () => {
    const audit: WebsiteAudit = {
      id: "audit_4",
      leadId: "lead_t1",
      requestedUrl: "https://haveli.test",
      status: "success",
      auditVersion: "audit/v0.1",
      findings: [
        {
          code: "missing_alt_text",
          title: "Images missing alt text",
          severity: "medium",
          description: "Several images lack alt attributes.",
          evidence: "12 / 18 sampled <img> elements have no alt attribute.",
          confidence: "medium",
          recommendation: "Add alt text.",
        },
      ],
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:00Z",
    };
    const draft = buildTemplateDraft({
      lead: baseLead({ websiteUrl: "https://haveli.test" }),
      audit,
      services: [baseService()],
    });
    expect(draft.body).toContain("12 images");
    expect(draft.body).toContain("alt text");
  });

  it("falls back to the generic audit line when nothing notable is in the audit", () => {
    const audit: WebsiteAudit = {
      id: "audit_5",
      leadId: "lead_t1",
      requestedUrl: "https://haveli.test",
      status: "success",
      auditVersion: "audit/v0.1",
      findings: [
        {
          code: "title_too_long",
          title: "Title is a little long",
          severity: "info",
          description: "Title length is 72 chars.",
          confidence: "medium",
          recommendation: "Trim to 60.",
        },
      ],
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:00Z",
    };
    const draft = buildTemplateDraft({
      lead: baseLead({ websiteUrl: "https://haveli.test" }),
      audit,
      services: [baseService()],
    });
    expect(draft.body).toContain("quick public audit");
    expect(draft.body).toContain("items worth discussing");
  });
});
