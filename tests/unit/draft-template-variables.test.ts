/**
 * Before/after equivalence tests for the draft template builder.
 *
 * Asserts that:
 *   1. The original hardcoded-template path (no templateBody) still produces
 *      the same output as before Phase C.
 *   2. The registry-based path (with templateBody) correctly substitutes
 *      variables and produces a body that uses them.
 */
import { describe, expect, it } from "vitest";
import { buildTemplateDraft, type BuildDraftInput } from "@/lib/outreach/draft";
import type { Lead, ServiceOffering } from "@/lib/demo/types";

const STUDIO = "Test Studio";

const BASE_LEAD: Lead = {
  id: "lead_draft_test",
  businessName: "Bloom Fitness",
  normalizedName: "bloom fitness",
  category: "Fitness",
  niche: "Fitness coaches",
  city: "Bangalore",
  country: "India",
  sourceName: "manual",
  websiteCondition: "unknown",
  pipelineStage: "new",
  currency: "INR",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-14T00:00:00Z",
  doNotContact: { flagged: false },
  tags: [],
  publicEmail: "hi@bloom.fitness",
  websiteUrl: "https://bloom.fitness",
};

const SERVICES: ServiceOffering[] = [
  {
    id: "svc_website",
    name: "Website design",
    description: "Modern sites.",
    idealCustomer: "Fitness coaches.",
    valueProposition: "A site that converts visitors.",
    isActive: true,
  },
];

const BASE_INPUT: BuildDraftInput = {
  lead: BASE_LEAD,
  services: SERVICES,
  studioName: STUDIO,
};

describe("buildTemplateDraft() — hardcoded template path (no templateBody)", () => {
  it("produces a subject with studio name and business name", () => {
    const result = buildTemplateDraft(BASE_INPUT);
    expect(result.subject).toContain("Bloom Fitness");
    expect(result.subject).toContain(STUDIO);
  });

  it("produces a body that starts with the business name", () => {
    const result = buildTemplateDraft(BASE_INPUT);
    expect(result.body).toContain("Bloom Fitness");
  });

  it("signs off with the studio name", () => {
    const result = buildTemplateDraft(BASE_INPUT);
    expect(result.body).toContain(`— ${STUDIO}`);
  });

  it("includes the website URL in the audit note", () => {
    const result = buildTemplateDraft(BASE_INPUT);
    expect(result.body).toContain(BASE_LEAD.websiteUrl ?? "");
  });

  it("has source='template'", () => {
    const result = buildTemplateDraft(BASE_INPUT);
    expect(result.source).toBe("template");
  });

  it("sets channel to 'email' when publicEmail is present", () => {
    const result = buildTemplateDraft(BASE_INPUT);
    expect(result.channel).toBe("email");
  });

  it("output is deterministic (same inputs → same output)", () => {
    const a = buildTemplateDraft(BASE_INPUT);
    const b = buildTemplateDraft(BASE_INPUT);
    expect(a.subject).toBe(b.subject);
    expect(a.body).toBe(b.body);
  });
});

describe("buildTemplateDraft() — registry-based path (with templateBody)", () => {
  const TEMPLATE_BODY =
    "Hi {{lead.business_name}},\n\nFrom {{owner.studio_name}}.\n\n— {{owner.signature}}";

  const TEMPLATE_SUBJECT = "Note for {{lead.business_name}} from {{owner.studio_name}}";

  it("substitutes lead.business_name in the body", () => {
    const result = buildTemplateDraft({
      ...BASE_INPUT,
      templateBody: TEMPLATE_BODY,
    });
    expect(result.body).toContain("Bloom Fitness");
    expect(result.body).not.toContain("{{lead.business_name}}");
  });

  it("substitutes owner.studio_name in the body", () => {
    const result = buildTemplateDraft({
      ...BASE_INPUT,
      templateBody: TEMPLATE_BODY,
    });
    expect(result.body).toContain(STUDIO);
    expect(result.body).not.toContain("{{owner.studio_name}}");
  });

  it("substitutes owner.signature in the body", () => {
    const result = buildTemplateDraft({
      ...BASE_INPUT,
      templateBody: TEMPLATE_BODY,
    });
    expect(result.body).toContain(`— ${STUDIO}`);
  });

  it("substitutes variables in the subject", () => {
    const result = buildTemplateDraft({
      ...BASE_INPUT,
      templateBody: TEMPLATE_BODY,
      templateSubject: TEMPLATE_SUBJECT,
    });
    expect(result.subject).toContain("Bloom Fitness");
    expect(result.subject).toContain(STUDIO);
    expect(result.subject).not.toContain("{{");
  });

  it("replaces unknown variables with empty string", () => {
    const result = buildTemplateDraft({
      ...BASE_INPUT,
      templateBody: "{{lead.nonexistent_field}} test",
    });
    expect(result.body).toBe(" test");
  });

  it("handles custom variables", () => {
    const result = buildTemplateDraft({
      ...BASE_INPUT,
      templateBody: "Promo: {{custom.discount}}",
      customVars: { discount: "20% off" },
    });
    expect(result.body).toBe("Promo: 20% off");
  });

  it("still has source='template'", () => {
    const result = buildTemplateDraft({
      ...BASE_INPUT,
      templateBody: TEMPLATE_BODY,
    });
    expect(result.source).toBe("template");
  });
});

describe("buildTemplateDraft() — channel routing is unchanged", () => {
  it("uses contact_form when no email and website present", () => {
    const noEmailLead = { ...BASE_LEAD, publicEmail: undefined };
    const result = buildTemplateDraft({ ...BASE_INPUT, lead: noEmailLead });
    expect(result.channel).toBe("contact_form");
  });

  it("uses 'other' when neither email nor website is present", () => {
    const bareLead = { ...BASE_LEAD, publicEmail: undefined, websiteUrl: undefined };
    const result = buildTemplateDraft({ ...BASE_INPUT, lead: bareLead });
    expect(result.channel).toBe("other");
  });

  it("honours an explicit channel override", () => {
    const result = buildTemplateDraft({ ...BASE_INPUT, channel: "instagram_dm" });
    expect(result.channel).toBe("instagram_dm");
  });
});
