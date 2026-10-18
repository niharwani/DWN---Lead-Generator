import { describe, expect, it } from "vitest";
import {
  substitute,
  buildContext,
  KNOWN_VARIABLE_KEYS,
  type VariableContext,
} from "@/lib/variables/registry";

const SAMPLE_CTX: VariableContext = {
  lead: {
    businessName: "Acme Fitness",
    city: "Mumbai",
    region: "Maharashtra",
    country: "India",
    niche: "Fitness",
    category: "Gym",
    websiteUrl: "https://acme.fitness",
    publicEmail: "hi@acme.fitness",
    publicPhone: "+91 99999 00000",
    address: "1 Main St",
    estimated_deal_value: 75000,
    currency: "INR",
    recommended_service: "Website redesign",
  },
  owner: {
    studio_name: "Test Studio",
    pitch: "We build great websites.",
    case_study_url: "https://example.com/case",
    signature: "Test Studio",
  },
  workspace: {
    name: "Test Workspace",
    slug: "test-workspace",
    accent_color: "#3b82f6",
  },
  audit: {
    headline_finding: "Missing viewport",
    page_weight_mb: 3.2,
    load_ms: 5200,
  },
  custom: {
    promo_code: "LAUNCH10",
  },
};

describe("substitute()", () => {
  it("replaces a single lead variable", () => {
    const { output } = substitute("Hello {{lead.business_name}}", SAMPLE_CTX);
    expect(output).toBe("Hello Acme Fitness");
  });

  it("replaces multiple variables in one template", () => {
    const { output } = substitute(
      "{{lead.business_name}} in {{lead.city}}",
      SAMPLE_CTX
    );
    expect(output).toBe("Acme Fitness in Mumbai");
  });

  it("replaces owner variables", () => {
    const { output } = substitute("From {{owner.studio_name}}", SAMPLE_CTX);
    expect(output).toBe("From Test Studio");
  });

  it("replaces owner.signature", () => {
    const { output } = substitute("— {{owner.signature}}", SAMPLE_CTX);
    expect(output).toBe("— Test Studio");
  });

  it("replaces workspace variables", () => {
    const { output } = substitute("Workspace: {{workspace.name}}", SAMPLE_CTX);
    expect(output).toBe("Workspace: Test Workspace");
  });

  it("replaces audit variables", () => {
    const { output } = substitute("Finding: {{audit.headline_finding}}", SAMPLE_CTX);
    expect(output).toBe("Finding: Missing viewport");
  });

  it("replaces numeric audit variables", () => {
    const { output } = substitute("Weight: {{audit.page_weight_mb}}MB", SAMPLE_CTX);
    expect(output).toBe("Weight: 3.2MB");
  });

  it("replaces custom variables", () => {
    const { output } = substitute("Code: {{custom.promo_code}}", SAMPLE_CTX);
    expect(output).toBe("Code: LAUNCH10");
  });

  it("replaces lead.estimated_deal_value", () => {
    const { output } = substitute("Deal: {{lead.estimated_deal_value}} {{lead.currency}}", SAMPLE_CTX);
    expect(output).toBe("Deal: 75000 INR");
  });

  it("returns empty string for unknown keys — no exception", () => {
    const { output } = substitute("{{lead.nonexistent_field}}", SAMPLE_CTX);
    expect(output).toBe("");
  });

  it("returns empty string for unknown namespace", () => {
    const { output } = substitute("{{bogus.key}}", SAMPLE_CTX);
    expect(output).toBe("");
  });

  it("returns empty string for key without a dot", () => {
    const { output } = substitute("{{nonamespace}}", SAMPLE_CTX);
    expect(output).toBe("");
  });

  it("does not throw on empty context", () => {
    const { output } = substitute("{{lead.business_name}}", {});
    expect(output).toBe("");
  });

  it("tracks usedKeys for used variables only", () => {
    const { usedKeys } = substitute(
      "{{lead.business_name}} {{owner.studio_name}} {{lead.nonexistent}}",
      SAMPLE_CTX
    );
    expect(usedKeys).toContain("lead.business_name");
    expect(usedKeys).toContain("owner.studio_name");
    expect(usedKeys).not.toContain("lead.nonexistent");
  });

  it("handles templates with no variables unchanged", () => {
    const { output } = substitute("Hello world!", SAMPLE_CTX);
    expect(output).toBe("Hello world!");
  });

  it("handles empty template", () => {
    const { output } = substitute("", SAMPLE_CTX);
    expect(output).toBe("");
  });

  it("handles null/undefined optional audit fields gracefully", () => {
    const ctx: VariableContext = { audit: { page_weight_mb: null, load_ms: null } };
    const { output } = substitute("{{audit.page_weight_mb}}", ctx);
    expect(output).toBe("");
  });
});

describe("buildContext()", () => {
  it("returns a context with lead fields mapped", () => {
    const ctx = buildContext({
      lead: {
        businessName: "Gym Inc",
        city: "Delhi",
        country: "India",
        niche: "Fitness",
        category: "Gym",
      } as Parameters<typeof buildContext>[0]["lead"],
      studioName: "My Studio",
    });
    expect(ctx.lead?.businessName).toBe("Gym Inc");
    expect(ctx.owner?.studio_name).toBe("My Studio");
  });

  it("maps audit metrics to audit context", () => {
    const ctx = buildContext({
      audit: {
        id: "a1",
        leadId: "l1",
        requestedUrl: "https://x.com",
        status: "success",
        httpStatus: 200,
        auditVersion: "audit/v0.1",
        findings: [{ code: "heavy_page", title: "Heavy page", severity: "medium", description: "Big", confidence: "high", recommendation: "Compress" }],
        metrics: { source: "server-fetch", pageWeightBytes: 3_000_000, loadMs: 4000 },
        startedAt: "2026-10-01T00:00:00Z",
      },
    });
    expect(ctx.audit?.page_weight_mb).toBe(3);
    expect(ctx.audit?.load_ms).toBe(4000);
    expect(ctx.audit?.headline_finding).toBe("Heavy page");
  });

  it("handles missing audit gracefully", () => {
    const ctx = buildContext({});
    expect(ctx.audit?.headline_finding).toBeUndefined();
  });
});

describe("KNOWN_VARIABLE_KEYS", () => {
  it("contains lead.business_name", () => {
    expect(KNOWN_VARIABLE_KEYS).toContain("lead.business_name");
  });

  it("contains owner.studio_name", () => {
    expect(KNOWN_VARIABLE_KEYS).toContain("owner.studio_name");
  });

  it("contains all expected namespaces", () => {
    const namespaces = new Set(KNOWN_VARIABLE_KEYS.map((k) => k.split(".")[0]));
    expect(namespaces).toContain("lead");
    expect(namespaces).toContain("owner");
    expect(namespaces).toContain("workspace");
    expect(namespaces).toContain("audit");
  });
});
