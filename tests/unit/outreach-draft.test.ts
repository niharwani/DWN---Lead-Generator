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
    expect(draft.body).toContain("quick public audit");
    expect(draft.personalizationEvidence.some((e) => e.includes("audit/v0.1"))).toBe(
      true
    );
  });
});
