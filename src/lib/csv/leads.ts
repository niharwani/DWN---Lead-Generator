/**
 * CSV import + export mapping for the Lead entity.
 *
 * Supports common header aliases so a spreadsheet exported from Google Sheets
 * / Excel / another CRM is likely to import without manual mapping. See
 * `HEADER_ALIASES` for the full list. Unknown columns are ignored (with a
 * warning) rather than erroring.
 *
 * Import does NOT execute any imported content as a formula — the DB is
 * ordinary string storage. Formula-injection prevention happens on EXPORT, in
 * `./emit.ts`, by prefixing dangerous leading characters with `'`.
 */

import { z } from "zod";
import { normalizeDomain, normalizeName, normalizeUrl } from "@/lib/db/normalize";
import type { Lead } from "@/lib/demo/types";

/* ---------- Template ---------- */

export const CSV_COLUMNS = [
  "business_name",
  "category",
  "niche",
  "website_url",
  "public_email",
  "public_phone",
  "address",
  "city",
  "region",
  "country",
  "source_name",
  "source_url",
  "notes",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export const CSV_TEMPLATE_SAMPLE_ROW: Record<CsvColumn, string> = {
  business_name: "Example Studio",
  category: "Interior designer",
  niche: "Interior designers & architects",
  website_url: "https://example-studio.example",
  public_email: "hello@example-studio.example",
  public_phone: "+91 22 5555 0000",
  address: "123 Example Lane",
  city: "Mumbai",
  region: "Maharashtra",
  country: "India",
  source_name: "manual",
  source_url: "https://instagram.example/example-studio",
  notes: "Found via a referral. Replace this row with your own data.",
};

/* ---------- Header aliasing ---------- */

const HEADER_ALIASES: Record<string, CsvColumn> = {
  // business_name
  business_name: "business_name",
  businessname: "business_name",
  business: "business_name",
  name: "business_name",
  company: "business_name",
  "company name": "business_name",
  "business name": "business_name",

  // category
  category: "category",
  type: "category",

  // niche
  niche: "niche",
  industry: "niche",
  vertical: "niche",

  // website
  website_url: "website_url",
  website: "website_url",
  "web site": "website_url",
  url: "website_url",
  "website url": "website_url",

  // email
  public_email: "public_email",
  email: "public_email",
  "email address": "public_email",

  // phone
  public_phone: "public_phone",
  phone: "public_phone",
  mobile: "public_phone",
  "phone number": "public_phone",

  address: "address",

  // city / region / country
  city: "city",
  town: "city",
  region: "region",
  state: "region",
  country: "country",

  source_name: "source_name",
  source: "source_name",
  "source name": "source_name",

  source_url: "source_url",
  "source url": "source_url",
  "source link": "source_url",

  notes: "notes",
  note: "notes",
  comment: "notes",
};

/** Normalize a raw header string ("Business Name!") → "business name". */
function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, " ").replace(/[^\w %&-]/g, "");
}

/** Map raw headers to canonical columns. Returns `null` for unknown headers. */
export function mapHeaders(headers: string[]): Array<CsvColumn | null> {
  return headers.map((h) => {
    const n = normalizeHeader(h);
    return HEADER_ALIASES[n] ?? HEADER_ALIASES[n.replace(/ /g, "_")] ?? null;
  });
}

/* ---------- Row validation ---------- */

const rowSchema = z.object({
  business_name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).optional().default(""),
  niche: z.string().trim().min(1).max(120),
  website_url: z.string().trim().max(2000).optional().default(""),
  public_email: z.string().trim().max(320).optional().default(""),
  public_phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(400).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  region: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(80).optional().default("India"),
  source_name: z.string().trim().max(60).optional().default("csv_import"),
  source_url: z.string().trim().max(2000).optional().default(""),
  notes: z.string().trim().max(5000).optional().default(""),
});

export type ParsedRow = z.infer<typeof rowSchema>;

export type RowError = {
  rowNumber: number;
  reason: string;
};

/** Normalized row ready for insert. */
export type ImportedRow = ParsedRow & {
  normalizedDomain: string | null;
  normalizedName: string;
  canonicalWebsiteUrl: string | null;
  canonicalEmail: string | null;
};

/* ---------- Dedup classification ---------- */

export type DedupClass = "new" | "dup_domain" | "dup_name_city";

export type ClassifiedRow = {
  rowNumber: number; // 1-indexed source row (header is row 1)
  parsed: ImportedRow;
  classification: DedupClass;
  conflictLeadId?: string;
};

/* ---------- Preview result ---------- */

export type ImportPreview = {
  columns: Array<{ raw: string; mapped: CsvColumn | null }>;
  totalRows: number;
  parseWarnings: string[];
  rows: ClassifiedRow[];
  errors: RowError[];
  counts: {
    total: number;
    new: number;
    duplicatesByDomain: number;
    duplicatesByNameCity: number;
    invalid: number;
  };
};

/**
 * Convert the raw string-matrix output of `parseCsv` into a classified
 * import preview. Does not touch the DB except via the two provided lookup
 * functions (owner-scoped, injected by the caller — keeps this file pure).
 */
export async function buildImportPreview(
  rows: string[][],
  parseWarnings: string[],
  lookups: {
    findLeadByDomain: (domain: string) => Promise<Lead | undefined>;
    findLeadByNameAndCity: (
      normalizedNameValue: string,
      city: string
    ) => Promise<Lead | undefined>;
  }
): Promise<ImportPreview> {
  if (rows.length === 0) {
    return {
      columns: [],
      totalRows: 0,
      parseWarnings,
      rows: [],
      errors: [],
      counts: {
        total: 0,
        new: 0,
        duplicatesByDomain: 0,
        duplicatesByNameCity: 0,
        invalid: 0,
      },
    };
  }

  const headerRow = rows[0]!;
  const mapped = mapHeaders(headerRow);
  const columns = headerRow.map((raw, i) => ({ raw, mapped: mapped[i] ?? null }));
  const dataRows = rows.slice(1);

  const classified: ClassifiedRow[] = [];
  const errors: RowError[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNumber = i + 2; // 1-indexed, +1 for header row
    // Skip completely-empty rows silently (common in spreadsheets)
    if (row.every((cell) => cell.trim() === "")) continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < row.length; c++) {
      const col = mapped[c];
      if (!col) continue;
      // Only take the first occurrence of a mapped column
      if (record[col] === undefined) record[col] = row[c] ?? "";
    }

    const parsed = rowSchema.safeParse(record);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors.push({
        rowNumber,
        reason: first
          ? `${first.path.join(".") || "row"}: ${first.message}`
          : "Row failed validation.",
      });
      continue;
    }

    const canonicalWebsiteUrl =
      parsed.data.website_url ? normalizeUrl(parsed.data.website_url) : null;
    const normalizedDomainValue =
      parsed.data.website_url ? normalizeDomain(parsed.data.website_url) : null;
    const normalizedNameValue = normalizeName(parsed.data.business_name);
    const canonicalEmail =
      parsed.data.public_email && parsed.data.public_email.length > 0
        ? parsed.data.public_email.toLowerCase()
        : null;

    const imported: ImportedRow = {
      ...parsed.data,
      canonicalWebsiteUrl,
      normalizedDomain: normalizedDomainValue,
      normalizedName: normalizedNameValue,
      canonicalEmail,
    };

    let classification: DedupClass = "new";
    let conflictLeadId: string | undefined;

    if (normalizedDomainValue) {
      const dup = await lookups.findLeadByDomain(normalizedDomainValue);
      if (dup) {
        classification = "dup_domain";
        conflictLeadId = dup.id;
      }
    }
    if (classification === "new" && imported.city) {
      const dup = await lookups.findLeadByNameAndCity(
        normalizedNameValue,
        imported.city
      );
      if (dup) {
        classification = "dup_name_city";
        conflictLeadId = dup.id;
      }
    }

    classified.push({ rowNumber, parsed: imported, classification, conflictLeadId });
  }

  const counts = {
    total: classified.length + errors.length,
    new: classified.filter((r) => r.classification === "new").length,
    duplicatesByDomain: classified.filter((r) => r.classification === "dup_domain").length,
    duplicatesByNameCity: classified.filter((r) => r.classification === "dup_name_city").length,
    invalid: errors.length,
  };

  return {
    columns,
    totalRows: dataRows.length,
    parseWarnings,
    rows: classified,
    errors,
    counts,
  };
}

/* ---------- Export mapping ---------- */

export const EXPORT_COLUMNS: Array<{
  key: string;
  label: string;
  value: (lead: Lead) => string | number;
}> = [
  { key: "id", label: "id", value: (l) => l.id },
  { key: "business_name", label: "business_name", value: (l) => l.businessName },
  { key: "category", label: "category", value: (l) => l.category },
  { key: "niche", label: "niche", value: (l) => l.niche },
  { key: "website_url", label: "website_url", value: (l) => l.websiteUrl ?? "" },
  {
    key: "normalized_domain",
    label: "normalized_domain",
    value: (l) => l.normalizedDomain ?? "",
  },
  { key: "public_email", label: "public_email", value: (l) => l.publicEmail ?? "" },
  { key: "public_phone", label: "public_phone", value: (l) => l.publicPhone ?? "" },
  { key: "address", label: "address", value: (l) => l.address ?? "" },
  { key: "city", label: "city", value: (l) => l.city },
  { key: "region", label: "region", value: (l) => l.region ?? "" },
  { key: "country", label: "country", value: (l) => l.country },
  { key: "source_name", label: "source_name", value: (l) => l.sourceName },
  { key: "source_url", label: "source_url", value: (l) => l.sourceUrl ?? "" },
  {
    key: "website_condition",
    label: "website_condition",
    value: (l) => l.websiteCondition,
  },
  { key: "pipeline_stage", label: "pipeline_stage", value: (l) => l.pipelineStage },
  { key: "fit_score", label: "fit_score", value: (l) => l.score?.total ?? "" },
  {
    key: "score_band",
    label: "score_band",
    value: (l) => l.score?.band ?? "",
  },
  {
    key: "evidence_confidence",
    label: "evidence_confidence",
    value: (l) => l.score?.confidence ?? "insufficient",
  },
  {
    key: "estimated_deal_value",
    label: "estimated_deal_value",
    value: (l) => l.estimatedDealValue ?? "",
  },
  { key: "currency", label: "currency", value: (l) => l.currency },
  {
    key: "last_contacted_at",
    label: "last_contacted_at",
    value: (l) => l.lastContactedAt ?? "",
  },
  {
    key: "next_action_at",
    label: "next_action_at",
    value: (l) => l.nextActionAt ?? "",
  },
  { key: "created_at", label: "created_at", value: (l) => l.createdAt },
  { key: "updated_at", label: "updated_at", value: (l) => l.updatedAt },
  { key: "tags", label: "tags", value: (l) => l.tags.join("; ") },
];
