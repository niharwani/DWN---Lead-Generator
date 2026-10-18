import { describe, expect, it } from "vitest";
import {
  evaluateCustomSignals,
  type CustomAuditSignal,
} from "@/lib/audit/custom-signals";

const HTML_WITH_INSTAGRAM = `
<html><body>
  <a href="https://instagram.com/testbrand">Follow on Instagram</a>
  <a href="https://calendly.com/testbrand">Book a call</a>
  <img src="photo1.jpg" />
  <img src="photo2.jpg" />
</body></html>
`;

const HTML_WITHOUT_PRIVACY = `
<html><body>
  <p>Welcome to our site.</p>
  <a href="/contact">Contact us</a>
</body></html>
`;

const FINAL_URL = "https://testbrand.com/";

describe("evaluateCustomSignals() — regex method", () => {
  it("fires when regex matches HTML", () => {
    const signal: CustomAuditSignal = {
      id: "s1",
      code: "has_calendly",
      label: "Has Calendly link",
      severity: "info",
      enabled: true,
      detectionMethod: "regex",
      detectionConfig: { pattern: "calendly\\.com", flags: "i" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM, finalUrl: FINAL_URL });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("has_calendly");
    expect(findings[0]!.severity).toBe("info");
    expect(findings[0]!.evidenceUrl).toBe(FINAL_URL);
  });

  it("does not fire when regex does not match", () => {
    const signal: CustomAuditSignal = {
      id: "s2",
      code: "has_typeform",
      label: "Has Typeform",
      severity: "info",
      enabled: true,
      detectionMethod: "regex",
      detectionConfig: { pattern: "typeform\\.com" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(0);
  });

  it("does not fire when signal is disabled", () => {
    const signal: CustomAuditSignal = {
      id: "s3",
      code: "has_ig_disabled",
      label: "Has Instagram (disabled)",
      severity: "info",
      enabled: false,
      detectionMethod: "regex",
      detectionConfig: { pattern: "instagram" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(0);
  });

  it("gracefully handles invalid regex", () => {
    const signal: CustomAuditSignal = {
      id: "s4",
      code: "invalid_re",
      label: "Invalid",
      severity: "info",
      enabled: true,
      detectionMethod: "regex",
      detectionConfig: { pattern: "[bad(" },
    };
    expect(() =>
      evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM })
    ).not.toThrow();
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(0);
  });
});

describe("evaluateCustomSignals() — presence method", () => {
  it("fires for named social pattern (instagram)", () => {
    const signal: CustomAuditSignal = {
      id: "s5",
      code: "has_instagram_link",
      label: "Has Instagram link",
      severity: "low",
      enabled: true,
      detectionMethod: "presence",
      detectionConfig: { linkPattern: "instagram" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("has_instagram_link");
  });

  it("does not fire for absent social pattern (youtube)", () => {
    const signal: CustomAuditSignal = {
      id: "s6",
      code: "has_youtube",
      label: "Has YouTube",
      severity: "info",
      enabled: true,
      detectionMethod: "presence",
      detectionConfig: { linkPattern: "youtube" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(0);
  });

  it("fires for custom link pattern", () => {
    const signal: CustomAuditSignal = {
      id: "s7",
      code: "has_book_cta",
      label: "Has booking CTA",
      severity: "medium",
      enabled: true,
      detectionMethod: "presence",
      detectionConfig: { linkPattern: "calendly" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(1);
  });
});

describe("evaluateCustomSignals() — absence method", () => {
  it("fires when pattern is absent from HTML", () => {
    const signal: CustomAuditSignal = {
      id: "s8",
      code: "no_privacy_policy",
      label: "No privacy policy link",
      severity: "medium",
      enabled: true,
      detectionMethod: "absence",
      detectionConfig: { pattern: "privacy.?policy", flags: "i" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITHOUT_PRIVACY });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("no_privacy_policy");
  });

  it("does not fire when pattern is present", () => {
    const signal: CustomAuditSignal = {
      id: "s9",
      code: "no_contact_link",
      label: "No contact link",
      severity: "high",
      enabled: true,
      detectionMethod: "absence",
      detectionConfig: { pattern: "contact" },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITHOUT_PRIVACY });
    expect(findings).toHaveLength(0);
  });
});

describe("evaluateCustomSignals() — count method", () => {
  it("fires when match count meets minimum", () => {
    const signal: CustomAuditSignal = {
      id: "s10",
      code: "multiple_images",
      label: "Has multiple images",
      severity: "info",
      enabled: true,
      detectionMethod: "count",
      detectionConfig: { pattern: "<img", minCount: 2 },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("multiple_images");
  });

  it("does not fire when count is below minimum", () => {
    const signal: CustomAuditSignal = {
      id: "s11",
      code: "lots_of_images",
      label: "Lots of images",
      severity: "medium",
      enabled: true,
      detectionMethod: "count",
      detectionConfig: { pattern: "<img", minCount: 10 },
    };
    const findings = evaluateCustomSignals([signal], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(0);
  });
});

describe("evaluateCustomSignals() — multiple signals", () => {
  it("returns all firing signals", () => {
    const signals: CustomAuditSignal[] = [
      {
        id: "m1",
        code: "has_instagram",
        label: "Has Instagram",
        severity: "info",
        enabled: true,
        detectionMethod: "presence",
        detectionConfig: { linkPattern: "instagram" },
      },
      {
        id: "m2",
        code: "has_calendly",
        label: "Has Calendly",
        severity: "info",
        enabled: true,
        detectionMethod: "regex",
        detectionConfig: { pattern: "calendly" },
      },
    ];
    const findings = evaluateCustomSignals(signals, { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(2);
  });

  it("returns empty array for empty signal list", () => {
    const findings = evaluateCustomSignals([], { html: HTML_WITH_INSTAGRAM });
    expect(findings).toHaveLength(0);
  });
});
