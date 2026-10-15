/**
 * RFC 4180 CSV emitter with spreadsheet formula-injection defense.
 *
 * Spec §14: "Prevent spreadsheet formula injection on export (e.g. values
 * beginning with `=`, `+`, `-`, or `@` where applicable)."
 *
 * We prefix any string that starts with a dangerous character with a single
 * quote `'`. Excel + Google Sheets both treat that leading quote as a text
 * literal and will not evaluate the following cell content as a formula. The
 * quote is visible when viewed as text but invisible when the cell is
 * interpreted as a value.
 *
 * We also prefix tab, carriage return, and vertical pipe `|` — the full OWASP
 * CSV injection reference includes these as Excel-dangerous.
 */

const DANGEROUS = new Set(["=", "+", "-", "@", "\t", "\r", "|"]);

/** Quote a single cell for CSV output. */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  // Guard against formula injection first — this prefixing is cheap and makes
  // the next quoting step unambiguous.
  const guarded = DANGEROUS.has(raw.charAt(0)) ? `'${raw}` : raw;
  // RFC 4180: double every internal quote and wrap in quotes if the cell
  // contains a comma / quote / CR / LF.
  if (
    guarded.includes('"') ||
    guarded.includes(",") ||
    guarded.includes("\n") ||
    guarded.includes("\r")
  ) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Serialize a list of rows to a CSV string. CRLF line endings per RFC 4180. */
export function emitCsv(rows: Array<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** Convenience: emit with a header row. Useful for keyed row objects. */
export function emitKeyedCsv<T extends Record<string, unknown>>(
  columns: ReadonlyArray<{ key: keyof T & string; label: string }>,
  rows: ReadonlyArray<T>
): string {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => r[c.key] as unknown));
  return emitCsv([header, ...body]);
}
