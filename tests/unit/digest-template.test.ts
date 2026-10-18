import { describe, it, expect } from "vitest";
import {
  buildWeeklyDigestHtml,
  buildWeeklyDigestText,
  type DigestData,
} from "@/lib/notifications/digest-template";

const BASE_DATA: DigestData = {
  weekOf: "Oct 11, 2026",
  ownerName: "Nihar",
  hotLeads: [],
  stuckContacts: [],
  followUpsDue: [],
  recentReplies: [],
  totalLeads: 42,
};

describe("buildWeeklyDigestHtml", () => {
  it("renders heading with hot leads count", () => {
    const html = buildWeeklyDigestHtml(BASE_DATA);
    expect(html).toContain("Hot leads (0)");
  });

  it("renders stuck contacts count", () => {
    const html = buildWeeklyDigestHtml(BASE_DATA);
    expect(html).toContain("Stuck contacts (0)");
  });

  it("renders follow-ups due count", () => {
    const html = buildWeeklyDigestHtml(BASE_DATA);
    expect(html).toContain("Follow-ups due (0)");
  });

  it("renders recent replies count", () => {
    const html = buildWeeklyDigestHtml(BASE_DATA);
    expect(html).toContain("Recent replies (0)");
  });

  it("renders total leads in footer", () => {
    const html = buildWeeklyDigestHtml(BASE_DATA);
    expect(html).toContain("42");
  });

  it("includes lead names when hot leads present", () => {
    const data: DigestData = {
      ...BASE_DATA,
      hotLeads: [{ id: "l1", businessName: "Acme Corp", stage: "replied", score: 80 }],
    };
    const html = buildWeeklyDigestHtml(data);
    expect(html).toContain("Hot leads (1)");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("score 80");
  });

  it("escapes HTML special characters in business names", () => {
    const data: DigestData = {
      ...BASE_DATA,
      stuckContacts: [{ id: "l2", businessName: "<Script>Alert</Script>", daysSinceContact: 5 }],
    };
    const html = buildWeeklyDigestHtml(data);
    expect(html).not.toContain("<Script>");
    expect(html).toContain("&lt;Script&gt;");
  });
});

describe("buildWeeklyDigestText", () => {
  it("contains section headers", () => {
    const text = buildWeeklyDigestText(BASE_DATA);
    expect(text).toContain("HOT LEADS (0)");
    expect(text).toContain("STUCK CONTACTS (0)");
    expect(text).toContain("FOLLOW-UPS DUE (0)");
    expect(text).toContain("RECENT REPLIES (0)");
  });

  it("includes the week date", () => {
    const text = buildWeeklyDigestText(BASE_DATA);
    expect(text).toContain("Oct 11, 2026");
  });

  it("includes owner name in greeting", () => {
    const text = buildWeeklyDigestText(BASE_DATA);
    expect(text).toContain("Hi Nihar");
  });
});
