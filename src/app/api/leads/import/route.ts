import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import {
  createActivity,
  createLead,
  findLeadByDomain,
  findLeadByNameAndCity,
  updateLead,
} from "@/lib/db/repos";
import { parseCsv } from "@/lib/csv/parse";
import {
  buildImportPreview,
  type ImportedRow,
} from "@/lib/csv/leads";
import {
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "../../_lib/response";

/**
 * POST /api/leads/import
 *
 * Modes:
 *   - preview : parse + classify (new / duplicate / invalid) without writing
 *   - commit  : re-parse and insert according to the chosen `duplicateStrategy`
 *
 * The browser carries the raw CSV text between preview and commit so there's
 * no server-side temp storage. Payload is JSON (not multipart) because the
 * client reads the file into a string before POSTing — simpler than multipart
 * handling in the Workers runtime.
 */

const importSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("preview"),
    content: z.string().max(5_000_000, "CSV too large (5 MB max)."),
  }),
  z.object({
    mode: z.literal("commit"),
    content: z.string().max(5_000_000, "CSV too large (5 MB max)."),
    duplicateStrategy: z.enum(["skip", "update_existing"]).default("skip"),
    sourceName: z.string().trim().max(60).default("csv_import"),
  }),
]);

export const POST = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  const db = await getDb();

  const parsed = await parseJson(req, importSchema);
  if (parsed instanceof Response) return parsed;

  const { rows, warnings } = parseCsv(parsed.content);
  const preview = await buildImportPreview(rows, warnings, {
    findLeadByDomain: (d) => findLeadByDomain(db, owner.id, d),
    findLeadByNameAndCity: (n, c) => findLeadByNameAndCity(db, owner.id, n, c),
  });

  if (parsed.mode === "preview") {
    return jsonOk({ preview });
  }

  // Narrow explicitly — after the early return above, `parsed` is the commit
  // branch of the discriminated union.
  const commitInput = parsed;

  // commit: insert or update per the chosen strategy
  if (preview.errors.length === preview.counts.total) {
    return jsonError(400, {
      code: "no_valid_rows",
      message: "No valid rows to import.",
      details: { errors: preview.errors },
    });
  }

  let inserted = 0;
  let updated = 0;
  let skippedDuplicate = 0;
  const failedRows: Array<{ rowNumber: number; reason: string }> = [...preview.errors];

  const sourceName = commitInput.sourceName ?? "csv_import";
  const duplicateStrategy = commitInput.duplicateStrategy ?? "skip";
  for (const row of preview.rows) {
    try {
      if (row.classification === "new") {
        const lead = await createLead(db, owner.id, mapImportedToCreate(row.parsed, sourceName));
        await createActivity(db, owner.id, {
          leadId: lead.id,
          activityType: "lead_created",
          title: `Imported ${lead.businessName}`,
          description: `From CSV import (${sourceName}).`,
        });
        inserted += 1;
      } else if (duplicateStrategy === "update_existing" && row.conflictLeadId) {
        await updateLead(db, owner.id, row.conflictLeadId, {
          publicEmail: row.parsed.canonicalEmail ?? undefined,
          publicPhone: row.parsed.public_phone || undefined,
          address: row.parsed.address || undefined,
          region: row.parsed.region || undefined,
          country: row.parsed.country,
          category: row.parsed.category,
          niche: row.parsed.niche,
        });
        await createActivity(db, owner.id, {
          leadId: row.conflictLeadId,
          activityType: "lead_updated",
          title: `Updated from CSV import`,
          description: `Row ${row.rowNumber} matched by ${row.classification === "dup_domain" ? "domain" : "name + city"}.`,
        });
        updated += 1;
      } else {
        skippedDuplicate += 1;
      }
    } catch (err) {
      failedRows.push({
        rowNumber: row.rowNumber,
        reason: (err as Error).message,
      });
    }
  }

  return jsonOk({
    summary: {
      inserted,
      updated,
      skippedDuplicate,
      invalid: failedRows.length,
      total: preview.counts.total,
    },
    errors: failedRows,
  });
});

function mapImportedToCreate(row: ImportedRow, defaultSource: string) {
  return {
    businessName: row.business_name,
    category: row.category,
    niche: row.niche,
    city: row.city,
    websiteUrl: row.canonicalWebsiteUrl ?? undefined,
    publicEmail: row.canonicalEmail ?? undefined,
    publicPhone: row.public_phone || undefined,
    address: row.address || undefined,
    region: row.region || undefined,
    country: row.country || "India",
    sourceName: row.source_name || defaultSource,
    sourceUrl: row.source_url || undefined,
  };
}
