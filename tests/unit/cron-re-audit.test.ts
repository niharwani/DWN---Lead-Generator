import { describe, expect, it } from "vitest";
import { compareWebsiteConditions } from "@/lib/cron/re-audit";
import type { WebsiteCondition } from "@/lib/demo/types";

describe("compareWebsiteConditions", () => {
  it("marks worsening (strong -> weak) as a regression", () => {
    expect(compareWebsiteConditions("strong", "weak")).toBe("regression");
  });

  it("marks acceptable -> outdated as a regression", () => {
    expect(compareWebsiteConditions("acceptable", "outdated")).toBe("regression");
  });

  it("marks weak -> strong as an improvement", () => {
    expect(compareWebsiteConditions("weak", "strong")).toBe("improvement");
  });

  it("marks outdated -> acceptable as an improvement", () => {
    expect(compareWebsiteConditions("outdated", "acceptable")).toBe(
      "improvement"
    );
  });

  it("marks same condition as same", () => {
    expect(compareWebsiteConditions("weak", "weak")).toBe("same");
  });

  it("treats transitions touching unknown as same (evidence problem, not quality)", () => {
    expect(compareWebsiteConditions("unknown", "weak")).toBe("same");
    expect(compareWebsiteConditions("strong", "unknown")).toBe("same");
  });

  it("marks inaccessible -> no_website as regression (worse rank)", () => {
    const before: WebsiteCondition = "inaccessible";
    const after: WebsiteCondition = "no_website";
    expect(compareWebsiteConditions(before, after)).toBe("regression");
  });
});
