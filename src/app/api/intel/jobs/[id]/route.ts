import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { getCrawlJob, listCrawlPages } from "@/lib/db/repos";
import { jsonError, jsonOk, withErrorHandling } from "../../../_lib/response";

/**
 * GET /api/intel/jobs/[id] — poll a crawl job's current state.
 *
 * Returns the job row plus all crawl_pages rows so a UI can show live
 * progress without refreshing the entire detail page. Owner-scoped.
 */
export const GET = withErrorHandling(async (_req, ctx) => {
  const owner = await requireOwner();
  const db = await getDb();
  const { params } = ctx as { params: Promise<{ id: string }> };
  const { id } = await params;
  const job = await getCrawlJob(db, owner.id, id);
  if (!job) {
    return jsonError(404, { code: "not_found", message: "Crawl job not found." });
  }
  const pages = await listCrawlPages(db, owner.id, id);
  return jsonOk({ job, pages });
});
