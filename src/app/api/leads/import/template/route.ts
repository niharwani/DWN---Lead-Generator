import { buildImportTemplate } from "@/lib/csv/template";
import { requireOwner } from "@/lib/auth/session";
import { withErrorHandling } from "../../../_lib/response";

/**
 * GET /api/leads/import/template — download the CSV import template.
 * Owner-gated so an unauthenticated anonymous download isn't exposed from the
 * app (the template is tiny and non-sensitive, but keeping it behind auth
 * matches every other endpoint).
 */
export const GET = withErrorHandling(async () => {
  await requireOwner();
  const csv = buildImportTemplate();
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="dwn-leads-template.csv"',
      "cache-control": "no-store",
    },
  });
});
