import { describe, it, expect } from "vitest";
import {
  diffContent,
  hashContent,
  normalizeForHash,
  putSnapshotToR2,
  buildSnapshotKey,
  type ArchiveEnv,
  type R2PutLike,
} from "@/lib/intel/archive";

describe("hashContent", () => {
  it("is deterministic for identical input", async () => {
    const a = await hashContent("hello world");
    const b = await hashContent("hello world");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a different hash for different input", async () => {
    const a = await hashContent("hello world");
    const b = await hashContent("hello worlds");
    expect(a).not.toBe(b);
  });

  it("hashes the empty string without throwing", async () => {
    const a = await hashContent("");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("normalizeForHash", () => {
  it("strips script tags so cosmetic JS changes don't trigger a diff", () => {
    const a = normalizeForHash(
      "<html><body><p>Hello</p><script>var x = 1;</script></body></html>"
    );
    const b = normalizeForHash(
      "<html><body><p>Hello</p><script>var x = 2;</script></body></html>"
    );
    expect(a).toBe(b);
  });

  it("strips style tags", () => {
    const a = normalizeForHash(
      "<html><head><style>body{color:red}</style></head><body><p>Hi</p></body></html>"
    );
    const b = normalizeForHash(
      "<html><head><style>body{color:blue}</style></head><body><p>Hi</p></body></html>"
    );
    expect(a).toBe(b);
  });

  it("collapses whitespace so indentation changes don't produce a diff", async () => {
    const a = normalizeForHash("<p>Hello    World</p>");
    const b = normalizeForHash("<p>Hello World</p>");
    const c = normalizeForHash("<p>Hello\n\n\n   World</p>");
    expect(a).toBe(b);
    expect(a).toBe(c);
    // And hashes line up as well — this is the real contract.
    expect(await hashContent(a)).toBe(await hashContent(b));
    expect(await hashContent(a)).toBe(await hashContent(c));
  });

  it("lowercases content so casing-only edits don't produce a diff", () => {
    const a = normalizeForHash("<p>Hello World</p>");
    const b = normalizeForHash("<p>HELLO WORLD</p>");
    expect(a).toBe(b);
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeForHash("")).toBe("");
  });
});

describe("putSnapshotToR2", () => {
  it("returns { ok: false, reason: 'no_binding' } when env is undefined", async () => {
    const result = await putSnapshotToR2("k", "<html></html>", undefined);
    expect(result).toEqual({ ok: false, reason: "no_binding" });
  });

  it("returns { ok: false, reason: 'no_binding' } when env has no bucket", async () => {
    const env: ArchiveEnv = {};
    const result = await putSnapshotToR2("k", "<html></html>", env);
    expect(result).toEqual({ ok: false, reason: "no_binding" });
  });

  it("does not throw when the binding is missing", async () => {
    await expect(
      putSnapshotToR2("k", "<html></html>", undefined)
    ).resolves.toEqual({ ok: false, reason: "no_binding" });
  });

  it("writes to R2 and returns the key when the binding exists", async () => {
    const puts: Array<{ key: string; value: unknown; opts?: unknown }> = [];
    const bucket: R2PutLike = {
      put: async (key, value, opts) => {
        puts.push({ key, value, opts });
      },
    };
    const env: ArchiveEnv = { INTEL_SNAPSHOTS: bucket };
    const result = await putSnapshotToR2("snapshots/x.html", "<html>yo</html>", env);
    expect(result).toEqual({ ok: true, key: "snapshots/x.html" });
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBe("snapshots/x.html");
    expect(puts[0]?.value).toBe("<html>yo</html>");
  });

  it("captures R2 put errors without throwing", async () => {
    const bucket: R2PutLike = {
      put: async () => {
        throw new Error("r2 is down");
      },
    };
    const env: ArchiveEnv = { INTEL_SNAPSHOTS: bucket };
    const result = await putSnapshotToR2("k", "<html></html>", env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("r2 is down");
    }
  });
});

describe("diffContent", () => {
  it("reports unchanged when both inputs match", () => {
    const r = diffContent("same\ntext", "same\ntext");
    expect(r.changed).toBe(false);
    expect(r.summary).toBe("unchanged");
  });

  it("counts added lines", () => {
    const prev = "line one\nline two";
    const next = "line one\nline two\nline three\nline four";
    const r = diffContent(prev, next);
    expect(r.changed).toBe(true);
    expect(r.summary).toBe("2 lines added");
  });

  it("counts removed lines", () => {
    const prev = "line one\nline two\nline three";
    const next = "line one";
    const r = diffContent(prev, next);
    expect(r.changed).toBe(true);
    expect(r.summary).toBe("2 lines removed");
  });

  it("counts added and removed lines together", () => {
    const prev = "a\nb\nc";
    const next = "a\nx\ny";
    const r = diffContent(prev, next);
    expect(r.changed).toBe(true);
    expect(r.summary).toBe("2 lines added, 2 lines removed");
  });

  it("uses singular 'line' when the count is 1", () => {
    const prev = "a";
    const next = "a\nb";
    const r = diffContent(prev, next);
    expect(r.changed).toBe(true);
    expect(r.summary).toBe("1 line added");
  });

  it("reports 'lines reordered' when the strings differ but line-sets are identical", () => {
    const prev = "a\nb\nc";
    const next = "c\nb\na";
    const r = diffContent(prev, next);
    expect(r.changed).toBe(true);
    expect(r.summary).toBe("lines reordered");
  });
});

describe("buildSnapshotKey", () => {
  it("produces a namespaced key per owner/lead/hash", () => {
    const k = buildSnapshotKey("owner-1", "lead-99", "abc123");
    expect(k).toBe("snapshots/owner-1/lead-99/abc123.html");
  });

  it("uses 'unlinked' when leadId is null", () => {
    const k = buildSnapshotKey("owner-1", null, "abc123");
    expect(k).toBe("snapshots/owner-1/unlinked/abc123.html");
  });

  it("url-encodes owner and lead ids", () => {
    const k = buildSnapshotKey("owner/with slash", "lead:1", "h");
    expect(k).toBe("snapshots/owner%2Fwith%20slash/lead%3A1/h.html");
  });
});
