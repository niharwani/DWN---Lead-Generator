import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv/parse";
import { emitCsv, emitKeyedCsv, escapeCell } from "@/lib/csv/emit";
import { mapHeaders } from "@/lib/csv/leads";

describe("parseCsv", () => {
  it("parses a simple file with LF line endings", () => {
    const { rows, warnings } = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("parses CRLF line endings", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("preserves quoted commas, newlines, and escaped quotes", () => {
    const input = `name,note\n"Haveli, Fine Jewels","Says ""hello"""\n"Line1\nLine2","body"`;
    const { rows } = parseCsv(input);
    expect(rows).toEqual([
      ["name", "note"],
      ["Haveli, Fine Jewels", 'Says "hello"'],
      ["Line1\nLine2", "body"],
    ]);
  });

  it("strips the UTF-8 BOM from the first header", () => {
    const bom = "﻿";
    const { rows } = parseCsv(`${bom}a,b\n1,2`);
    expect(rows[0]).toEqual(["a", "b"]);
  });

  it("tolerates a trailing newline (does not emit a spurious empty row)", () => {
    const { rows } = parseCsv("a\n1\n");
    expect(rows).toEqual([["a"], ["1"]]);
  });

  it("warns on unclosed quoted field", () => {
    const { warnings } = parseCsv('a,b\n"unterminated,1');
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("escapeCell — formula-injection guard", () => {
  it('prefixes "=" formulas with a single quote', () => {
    // Plain "=1+1" has no commas / quotes / newlines so it doesn't need CSV
    // quoting after the formula guard — just the leading apostrophe.
    expect(escapeCell("=1+1")).toBe("'=1+1");
  });

  it('prefixes "+" / "-" / "@" / "|" starters', () => {
    for (const prefix of ["+", "-", "@", "|"]) {
      const out = escapeCell(`${prefix}something`);
      expect(out.startsWith("'")).toBe(true);
    }
  });

  it("prefixes tab / CR starters (both require CSV quoting because of the CR / tab)", () => {
    // "\t" and "\r" are safe characters outside of a CSV cell but need
    // quoting inside one — the output is a quoted string that starts with 'X.
    const tab = escapeCell("\thidden");
    const cr = escapeCell("\rhidden");
    expect(tab.includes("'")).toBe(true);
    expect(cr.includes("'")).toBe(true);
  });

  it("does not prefix safe cells", () => {
    expect(escapeCell("Mumbai")).toBe("Mumbai");
    expect(escapeCell("hello@example.com")).not.toBe("'hello@example.com");
  });

  it("still prefixes when the cell also needs CSV quoting", () => {
    // Starts with = AND contains a comma → both guards apply
    const out = escapeCell("=HYPERLINK(https://evil, hello)");
    expect(out.startsWith('"\'')).toBe(true);
    expect(out.endsWith('"')).toBe(true);
  });

  it("double-escapes internal quotes per RFC 4180", () => {
    expect(escapeCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes cells containing newlines", () => {
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns an empty string for null / undefined", () => {
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
  });
});

describe("emitCsv + emitKeyedCsv", () => {
  it("joins rows with CRLF", () => {
    expect(emitCsv([["a", "b"], ["1", "2"]])).toBe("a,b\r\n1,2");
  });

  it("round-trips a parsed-then-emitted file", () => {
    const input = `name,note\n"Example, Co.","Says ""hi""\nagain"\nSimple,plain`;
    const { rows } = parseCsv(input);
    const emitted = emitCsv(rows);
    const reparsed = parseCsv(emitted);
    expect(reparsed.rows).toEqual(rows);
  });

  it("emits with keyed rows", () => {
    const csv = emitKeyedCsv(
      [
        { key: "name", label: "Name" },
        { key: "value", label: "Value" },
      ],
      [{ name: "Mumbai", value: "42" }]
    );
    expect(csv).toBe("Name,Value\r\nMumbai,42");
  });
});

describe("mapHeaders — header aliasing", () => {
  it("maps canonical and alias headers", () => {
    const mapped = mapHeaders([
      "Business Name",
      "email",
      "Phone number",
      "Industry",
      "Website URL",
      "unknown column",
    ]);
    expect(mapped).toEqual([
      "business_name",
      "public_email",
      "public_phone",
      "niche",
      "website_url",
      null,
    ]);
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(mapHeaders(["  BUSINESS_NAME  "])).toEqual(["business_name"]);
    expect(mapHeaders(["company name"])).toEqual(["business_name"]);
  });
});
