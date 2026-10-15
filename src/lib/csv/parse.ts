/**
 * Minimal RFC 4180 CSV parser.
 *
 * Supports:
 *   - CRLF or LF line separators
 *   - Fields quoted with " ... "
 *   - Escaped quotes inside quoted fields ("" → ")
 *   - UTF-8 BOM stripping on the first byte
 *
 * Does NOT support:
 *   - Streaming (whole input is held in memory — fine for Phase 3 CSVs up to
 *     a few MB; swap for a streaming parser when imports grow)
 *   - Custom delimiters (hardcoded comma)
 *   - Comments / escape backslashes / numeric parsing
 *
 * Returning `string[][]` lets the caller decide how to interpret rows (header,
 * data, errors). Lead-specific logic lives in `./leads.ts`.
 */

export type ParseResult = {
  rows: string[][];
  warnings: string[];
};

/**
 * Parse the full CSV text into rows. Each row is a flat array of raw string
 * values (no trim, no case normalization). The caller is responsible for
 * mapping headers → columns and validating cells.
 */
export function parseCsv(input: string): ParseResult {
  const rows: string[][] = [];
  const warnings: string[] = [];

  // Strip UTF-8 BOM so the first header cell doesn't carry invisible bytes.
  const src =
    input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  let i = 0;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const len = src.length;

  while (i < len) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" inside quotes = literal "
        if (i + 1 < len && src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // closing quote
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // not in quotes
    if (ch === '"') {
      if (field.length > 0) {
        warnings.push(
          `Row ${rows.length + 1}: a quoted field must appear at the start of a cell, not after other text.`
        );
      }
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      // End of row — handle CRLF, CR-alone, or LF-alone
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      if (ch === "\r" && src[i] === "\n") i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (inQuotes) {
    warnings.push(
      "File ended inside a quoted field — the quote was never closed."
    );
  }

  // Flush the trailing field / row (no trailing newline is valid CSV)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop a trailing empty row that comes from "data\n" (the last \n flushed an
  // empty row). This is a very common source of spurious "validation failed on
  // empty row N+1" errors.
  if (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0] === "") rows.pop();
  }

  return { rows, warnings };
}
