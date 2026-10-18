import { describe, it, expect } from "vitest";
import { generateSlug } from "@/lib/db/repos/workspaces";

/**
 * Workspace utility tests.
 *
 * The CRUD functions that require a real D1 database are covered by the
 * cross-workspace-isolation integration test. Here we test the pure utility
 * functions that have no external dependencies.
 */

describe("generateSlug", () => {
  it("lowercases the input", () => {
    expect(generateSlug("My Workspace")).toBe("my-workspace");
  });

  it("replaces spaces and special chars with hyphens", () => {
    // Trailing hyphens are stripped by the slug generator
    expect(generateSlug("Hello World!")).toBe("hello-world");
    expect(generateSlug("Acme Corp.")).toBe("acme-corp");
  });

  it("handles email local parts", () => {
    expect(generateSlug("nihar.wani")).toBe("nihar-wani");
  });

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("---foo---")).toBe("foo");
  });

  it("truncates to 48 characters", () => {
    const long = "a".repeat(60);
    expect(generateSlug(long).length).toBe(48);
  });

  it("handles empty string gracefully", () => {
    expect(generateSlug("")).toBe("");
  });

  it("preserves numbers", () => {
    expect(generateSlug("Workspace 123")).toBe("workspace-123");
  });

  it("collapses consecutive separators into one hyphen", () => {
    expect(generateSlug("one  two   three")).toBe("one-two-three");
  });
});

describe("workspace slug uniqueness logic", () => {
  it("base slug is a valid URL-safe string", () => {
    const slug = generateSlug("Fitness Coach LLC");
    expect(slug).toMatch(/^[a-z0-9-]*$/);
    expect(slug).not.toMatch(/^-/);
    expect(slug).not.toMatch(/-$/);
  });

  it("generates distinct slugs for distinct names", () => {
    const a = generateSlug("Agency A");
    const b = generateSlug("Agency B");
    expect(a).not.toBe(b);
  });
});
