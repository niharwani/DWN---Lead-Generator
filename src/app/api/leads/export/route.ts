import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { listLeads, type LeadFilter, type LeadSortKey } from "@/lib/db/repos";
import { emitCsv } from "@/lib/csv/emit";
import { EXPORT_COLUMNS } from "@/lib/csv/leads";
import { withErrorHandling } from "../../_lib/response";
import type { PipelineStage, WebsiteCondition } from "@/lib/demo/types";

/**
 * GET /api/leads/export — stream a CSV of the owner's current leads.
 * Query params match /api/leads so filtered views export the matching rows.
 * Every cell runs through the formula-injection guard in `emitCsv`.
 */
export const GET = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  const db = await getDb();

  const url = new URL(req.url);
  const p = url.searchParams;
  const filter: LeadFilter = {
    q: p.get("q") ?? undefined,
    niche: p.get("niche") ?? undefined,
    city: p.get("city") ?? undefined,
    stage: (p.get("stage") as PipelineStage) ?? undefined,
    condition: (p.get("condition") as WebsiteCondition) ?? undefined,
    source: p.get("source") ?? undefined,
    minScore: p.get("minScore") ? Number(p.get("minScore")) : undefined,
    maxScore: p.get("maxScore") ? Number(p.get("maxScore")) : undefined,
  };
  const sort = (p.get("sort") as LeadSortKey) || "score";

  const leads = await listLeads(db, owner.id, filter, sort);

  const header = EXPORT_COLUMNS.map((c) => c.label);
  const body = leads.map((l) => EXPORT_COLUMNS.map((c) => c.value(l)));
  const csv = emitCsv([header, ...body]);

  const date = new Date().toISOString().slice(0, 10);
  const filename = `dwn-leads-${date}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
