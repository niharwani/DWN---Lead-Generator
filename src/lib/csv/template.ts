import { emitCsv } from "./emit";
import { CSV_COLUMNS, CSV_TEMPLATE_SAMPLE_ROW, type CsvColumn } from "./leads";

/**
 * Build the downloadable CSV import template. Two rows:
 *   - Header
 *   - One demonstrative sample row with the owner-expected columns filled in
 */
export function buildImportTemplate(): string {
  const header: string[] = [...CSV_COLUMNS];
  const sample: string[] = CSV_COLUMNS.map(
    (c: CsvColumn) => CSV_TEMPLATE_SAMPLE_ROW[c]
  );
  return emitCsv([header, sample]);
}
