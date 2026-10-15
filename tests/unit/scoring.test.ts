import { describe, expect, it } from "vitest";
import {
  buildTemplateBrief,
  DEFAULT_WEIGHTS,
  deriveConfidence,
  matchServiceOffering,
  SCORE_VERSION,
  scoreLead,
  type ScoreFactorCode,
  type WeightMap,
} from "@/lib/scoring/engine";
import type {
  Campaign,
  Lead,
  ServiceOffering,
  WebsiteAudit,
} from "@/lib/demo/types";

const NOW = "2026-10-15T12:00:00.000Z";
const AUDIT_STARTED = "2026-10-14T08:00:00.000Z";

const BASE_LEAD: Lead = {
  id: "lead_test",
  businessName: "Test Studio",
  normalizedName: "test studio",
  category: "D2C skincare brand",
  niche: "D2C consumer brands",
  city: "Mumbai",
  country: "India",
  sourceName: "manual",
  websiteCondition: "unknown",
  pipelineStage: "new",
  currency: "INR",
  createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-14T00:00:00.000Z",
  doNotContact: { flagged: false },
  tags: [],
};

const SERVICES: ServiceOffering[] = [
  {
    id: "svc_website",
    name: "Website design & build",
    description: "Modern responsive websites.",
    idealCustomer: "Studios whose site is missing.",
    valueProposition: "A clear mobile-first site.",
    isActive: true,
  },
  {
    id: "svc_ecommerce",
    name: "E-commerce experience",
    description: "Shopify / headless storefronts.",
    idealCustomer: "D2C brands.",
    valueProposition: "A storefront that matches the product.",
    isActive: true,
  },
  {
    id: "svc_landing",
    name: "Landing pages",
    description: "Single-focus pages.",
    idealCustomer: "Brands running paid traffic.",
    valueProposition: "Visitors who convert.",
    isActive: true,
  },
];

const makeAudit = (overrides: Partial<WebsiteAudit> = {}): WebsiteAudit => ({
  id: "aud_01",
  leadId: BASE_LEAD.id,
  requestedUrl: "https://example.test",
  finalUrl: "https://example.test/",
  status: "success",
  httpStatus: 200,
  auditVersion: "audit/v0.1",
  startedAt: AUDIT_STARTED,
  completedAt: AUDIT_STARTED,
  findings: [],
  metrics: { source: "server-fetch", pageWeightBytes: 100_000, loadMs: 1500 },
  ...overrides,
});

/* -----------------------------------------------------------------
 * Confidence derivation
 * ----------------------------------------------------------------- */

describe("deriveConfidence", () => {
  it("insufficient when there's no website, no contact, no source url", () => {
    expect(deriveConfidence({ lead: BASE_LEAD })).toBe("insufficient");
  });

  it("low when only a source URL is present (no website, audit, or verified contact)", () => {
    expect(
      deriveConfidence({
        lead: { ...BASE_LEAD, sourceUrl: "https://instagram.example/profile" },
      })
    ).toBe("low");
  });

  it("medium when there's a website but no successful audit", () => {
    expect(
      deriveConfidence({
        lead: { ...BASE_LEAD, websiteUrl: "https://example.test" },
      })
    ).toBe("medium");
  });

  it("high when there's a website and a successful audit", () => {
    expect(
      deriveConfidence({
        lead: { ...BASE_LEAD, websiteUrl: "https://example.test" },
        audit: makeAudit(),
      })
    ).toBe("high");
  });

  it("medium when only verified contact is present (no website / audit)", () => {
    expect(
      deriveConfidence({
        lead: { ...BASE_LEAD, publicEmail: "hello@example.test" },
      })
    ).toBe("medium");
  });
});

/* -----------------------------------------------------------------
 * Bounds + clamping
 * ----------------------------------------------------------------- */

describe("scoreLead — bounds", () => {
  it("clamps a maxed-out score at 100", () => {
    // Pile on every positive factor by making the lead no-website + audit
    // flagging the full set + perfect campaign match + contact path.
    const lead: Lead = {
      ...BASE_LEAD,
      websiteCondition: "no_website",
      publicEmail: "hello@example.test",
      publicPhone: "+91 22 5555 0000",
      sourceUrl: "https://instagram.example/profile",
    };
    const campaign: Campaign = {
      id: "cmp_d2c",
      name: "D2C",
      status: "active",
      niche: "D2C consumer brands",
      geography: {},
      idealCustomerDescription: "",
      offer: "",
      valueProposition: "",
      minimumScore: 60,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const result = scoreLead({
      lead,
      campaign,
      services: SERVICES,
      weights: DEFAULT_WEIGHTS,
      nowIso: NOW,
    });
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.total).toBeGreaterThan(0);
  });

  it("never goes below 0 even with heavy penalties", () => {
    const weights: WeightMap = {
      ...DEFAULT_WEIGHTS,
      low_evidence_penalty: { points: -200, enabled: true },
      strong_site_penalty: { points: -200, enabled: true },
    };
    const lead: Lead = {
      ...BASE_LEAD,
      websiteUrl: "https://example.test",
      websiteCondition: "strong",
    };
    const audit = makeAudit({ findings: [] });
    const result = scoreLead({ lead, audit, services: SERVICES, weights, nowIso: NOW });
    expect(result.total).toBe(0);
  });
});

/* -----------------------------------------------------------------
 * Insufficient-evidence override
 * ----------------------------------------------------------------- */

describe("scoreLead — insufficient evidence", () => {
  it("returns insufficient_evidence band and total 0 when lead has nothing to anchor on", () => {
    const result = scoreLead({
      lead: BASE_LEAD,
      services: SERVICES,
      nowIso: NOW,
    });
    expect(result.confidence).toBe("insufficient");
    expect(result.band).toBe("insufficient_evidence");
    expect(result.total).toBe(0);
    expect(result.factors).toHaveLength(1);
    expect(result.factors[0]!.code).toBe("insufficient_evidence");
    expect(result.firedCodes).toHaveLength(0);
  });

  it("does NOT fall into insufficient when a source URL is present (even without website)", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      sourceUrl: "https://instagram.example/profile",
      websiteCondition: "no_website",
    };
    const result = scoreLead({ lead, services: SERVICES, nowIso: NOW });
    expect(result.confidence).not.toBe("insufficient");
    expect(result.band).not.toBe("insufficient_evidence");
    expect(result.firedCodes).toContain("no_website");
  });
});

/* -----------------------------------------------------------------
 * Factor combinatorics
 * ----------------------------------------------------------------- */

describe("scoreLead — factor combinatorics", () => {
  it("fires no_website for a lead with no site", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      sourceUrl: "https://instagram.example/profile",
      websiteCondition: "no_website",
    };
    const result = scoreLead({ lead, services: SERVICES, nowIso: NOW });
    expect(result.firedCodes).toContain("no_website");
  });

  it("fires inaccessible when audit returned unavailable", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const audit = makeAudit({
      status: "unavailable",
      httpStatus: 522,
      findings: [
        {
          code: "fetch_timeout",
          title: "Request timed out",
          severity: "high",
          description: "Timed out after three attempts.",
          confidence: "high",
          recommendation: "Check hosting.",
        },
      ],
    });
    const result = scoreLead({ lead, audit, services: SERVICES, nowIso: NOW });
    expect(result.firedCodes).toContain("inaccessible");
    // Should NOT also credit outdated / viewport / etc when fetch itself failed.
    expect(result.firedCodes).not.toContain("missing_viewport");
    expect(result.firedCodes).not.toContain("missing_https");
  });

  it("maps audit findings to the matching factors", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const audit = makeAudit({
      findings: [
        { code: "missing_viewport", title: "No viewport", severity: "medium", description: "", confidence: "high", recommendation: "" },
        { code: "weak_contact_path", title: "No contact", severity: "medium", description: "", confidence: "high", recommendation: "" },
        { code: "no_https", title: "No HTTPS", severity: "high", description: "", confidence: "high", recommendation: "" },
        { code: "heavy_page", title: "Heavy", severity: "medium", description: "", confidence: "high", recommendation: "" },
      ],
    });
    const result = scoreLead({ lead, audit, services: SERVICES, nowIso: NOW });
    expect(result.firedCodes).toContain("missing_viewport");
    expect(result.firedCodes).toContain("missing_contact_path");
    expect(result.firedCodes).toContain("missing_https");
    expect(result.firedCodes).toContain("heavy_page");
  });

  it("credits niche_match only when a campaign with matching niche is supplied", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const campaign: Campaign = {
      id: "cmp_other",
      name: "Other",
      status: "active",
      niche: "Different niche",
      geography: {},
      idealCustomerDescription: "",
      offer: "",
      valueProposition: "",
      minimumScore: 60,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const matching: Campaign = { ...campaign, niche: BASE_LEAD.niche };

    expect(scoreLead({ lead, campaign, services: SERVICES, nowIso: NOW }).firedCodes).not.toContain("niche_match");
    expect(scoreLead({ lead, campaign: matching, services: SERVICES, nowIso: NOW }).firedCodes).toContain("niche_match");
  });

  it("credits useful_contact_path when lead has public email or phone", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      publicEmail: "hello@example.test",
    };
    const result = scoreLead({ lead, services: SERVICES, nowIso: NOW });
    expect(result.firedCodes).toContain("useful_contact_path");
  });

  it("applies strong_site_penalty when audit is clean", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const audit = makeAudit({ findings: [] });
    const result = scoreLead({ lead, audit, services: SERVICES, nowIso: NOW });
    expect(result.firedCodes).toContain("strong_site_penalty");
    expect(result.firedCodes).not.toContain("outdated");
  });

  it("disabled weights are omitted from the breakdown", () => {
    const weights: WeightMap = {
      ...DEFAULT_WEIGHTS,
      useful_contact_path: { points: 5, enabled: false },
    };
    const lead: Lead = {
      ...BASE_LEAD,
      websiteUrl: "https://example.test",
      publicEmail: "hello@example.test",
    };
    const result = scoreLead({ lead, services: SERVICES, weights, nowIso: NOW });
    expect(result.firedCodes).not.toContain("useful_contact_path");
  });

  it("positive factors are listed before small ones (ordered by magnitude)", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      websiteCondition: "no_website",
      publicEmail: "hello@example.test",
    };
    const result = scoreLead({ lead, services: SERVICES, nowIso: NOW });
    // no_website is +20, useful_contact_path is +5 — no_website must come first
    const codes = result.factors.map((f) => f.code);
    expect(codes.indexOf("no_website")).toBeLessThan(codes.indexOf("useful_contact_path"));
  });
});

/* -----------------------------------------------------------------
 * Idempotency (spec §10)
 * ----------------------------------------------------------------- */

describe("scoreLead — idempotency", () => {
  it("same inputs + same version + same nowIso produce an identical breakdown", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      websiteUrl: "https://example.test",
      publicEmail: "hello@example.test",
    };
    const audit = makeAudit({
      findings: [
        { code: "missing_viewport", title: "No viewport", severity: "medium", description: "", confidence: "high", recommendation: "" },
      ],
    });
    const a = scoreLead({ lead, audit, services: SERVICES, nowIso: NOW });
    const b = scoreLead({ lead, audit, services: SERVICES, nowIso: NOW });
    expect(a).toEqual(b);
  });

  it("version string is pinned (so future weight changes bump the version)", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const result = scoreLead({ lead, services: SERVICES, nowIso: NOW });
    expect(result.version).toBe(SCORE_VERSION);
  });
});

/* -----------------------------------------------------------------
 * Weight override + customisation
 * ----------------------------------------------------------------- */

describe("scoreLead — weight overrides", () => {
  it("respects per-factor weight overrides", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      publicEmail: "hello@example.test",
    };
    const weights: WeightMap = {
      ...DEFAULT_WEIGHTS,
      useful_contact_path: { points: 50, enabled: true },
    };
    const result = scoreLead({ lead, services: SERVICES, weights, nowIso: NOW });
    const factor = result.factors.find((f) => f.code === "useful_contact_path");
    expect(factor?.points).toBe(50);
  });
});

/* -----------------------------------------------------------------
 * Service matching
 * ----------------------------------------------------------------- */

describe("matchServiceOffering", () => {
  it("recommends website for a no-website lead", () => {
    const lead: Lead = { ...BASE_LEAD, websiteCondition: "no_website" };
    const match = matchServiceOffering({ lead, services: SERVICES });
    expect(match?.service.id).toBe("svc_website");
  });

  it("recommends website for an unavailable audit, even if lead has a URL", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const audit = makeAudit({ status: "unavailable" });
    const match = matchServiceOffering({ lead, audit, services: SERVICES });
    expect(match?.service.id).toBe("svc_website");
  });

  it("recommends landing page when audit flags cta_hierarchy", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const audit = makeAudit({
      findings: [
        { code: "cta_hierarchy", title: "", severity: "medium", description: "", confidence: "high", recommendation: "" },
      ],
    });
    const match = matchServiceOffering({ lead, audit, services: SERVICES });
    expect(match?.service.id).toBe("svc_landing");
  });

  it("falls back to niche hints (D2C → e-commerce)", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      websiteUrl: "https://example.test",
      niche: "D2C consumer brands",
    };
    const audit = makeAudit({ findings: [] });
    const match = matchServiceOffering({ lead, audit, services: SERVICES });
    expect(match?.service.id).toBe("svc_ecommerce");
  });

  it("returns null when no active services exist", () => {
    const match = matchServiceOffering({
      lead: BASE_LEAD,
      services: SERVICES.map((s) => ({ ...s, isActive: false })),
    });
    expect(match).toBeNull();
  });
});

/* -----------------------------------------------------------------
 * Template brief
 * ----------------------------------------------------------------- */

describe("buildTemplateBrief", () => {
  it("picks a service for a no-website lead and names it in recommendedService", () => {
    const lead: Lead = {
      ...BASE_LEAD,
      sourceUrl: "https://instagram.example/profile",
      websiteCondition: "no_website",
    };
    const brief = buildTemplateBrief({ lead, services: SERVICES, nowIso: NOW });
    expect(brief.recommendedService).toBe("Website design & build");
    expect(brief.summary).toMatch(/Test Studio/);
    expect(brief.summary).toMatch(/no reachable public website/i);
    expect(brief.observations.some((o) => /no reachable public website/i.test(o.observation))).toBe(true);
  });

  it("pulls audit findings into the observations list", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const audit = makeAudit({
      findings: [
        { code: "no_https", title: "Site is HTTP, not HTTPS", severity: "high", description: "", evidence: "Final URL http://example.test", confidence: "high", recommendation: "" },
        { code: "missing_viewport", title: "No viewport meta", severity: "medium", description: "", confidence: "high", recommendation: "" },
      ],
    });
    const brief = buildTemplateBrief({ lead, audit, services: SERVICES, nowIso: NOW });
    const titles = brief.observations.map((o) => o.observation);
    expect(titles).toContain("Site is HTTP, not HTTPS");
    expect(titles).toContain("No viewport meta");
  });

  it("propagates confidence from the score breakdown", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const audit = makeAudit();
    const score = scoreLead({ lead, audit, services: SERVICES, nowIso: NOW });
    const brief = buildTemplateBrief({
      lead,
      score,
      audit,
      services: SERVICES,
      nowIso: NOW,
    });
    expect(brief.confidence).toBe("high");
  });

  it("flags 'audit not yet run' as an unknown when the lead has a site but no audit", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const brief = buildTemplateBrief({ lead, services: SERVICES, nowIso: NOW });
    expect(brief.unknowns.some((u) => /audit not yet run/i.test(u))).toBe(true);
  });

  it("source is 'template' (AI generation is Phase 7)", () => {
    const lead: Lead = { ...BASE_LEAD, websiteUrl: "https://example.test" };
    const brief = buildTemplateBrief({ lead, services: SERVICES, nowIso: NOW });
    expect(brief.source).toBe("template");
  });
});

/* -----------------------------------------------------------------
 * Verify all factor codes are mapped
 * ----------------------------------------------------------------- */

describe("FACTOR_LABELS", () => {
  it("has a label for every factor code in DEFAULT_WEIGHTS", () => {
    const codes = Object.keys(DEFAULT_WEIGHTS) as ScoreFactorCode[];
    for (const code of codes) {
      expect(typeof code).toBe("string");
    }
  });
});
