/**
 * GET /api/audit-log
 *
 * Returns paginated audit log entries for the current workspace.
 * Used by the audit-log settings section client component to load more and filter.
 *
 * Query params:
 *   cursor       - ISO timestamp of last entry for keyset pagination
 *   entityType   - filter by entity type
 *   actorProfileId - filter by actor
 *   limit        - max rows (default 50, max 100)
 */

import { requireOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listAuditLog } from "@/lib/db/repos/audit-log";
import { jsonOk, withErrorHandling } from "@/app/api/_lib/response";
import type { AuditEntityType } from "@/lib/audit-log/writer";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export const GET = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  const db = await getDb();

  const url = new URL(req.url);
  const p = url.searchParams;

  const rawLimit = parseInt(p.get("limit") ?? String(PAGE_SIZE), 10);
  const limit = Math.min(isNaN(rawLimit) ? PAGE_SIZE : rawLimit, MAX_PAGE_SIZE);
  const cursor = p.get("cursor") ?? undefined;
  const entityType = (p.get("entityType") ?? undefined) as AuditEntityType | undefined;
  const actorProfileId = p.get("actorProfileId") ?? undefined;

  // Fetch one extra to determine if there are more pages
  const entries = await listAuditLog(db, owner.id, {
    limit: limit + 1,
    cursor,
    entityType,
    actorProfileId,
  });

  const hasMore = entries.length > limit;
  const page = entries.slice(0, limit);
  const nextCursor = hasMore ? page[page.length - 1]?.createdAt : undefined;

  return jsonOk({
    entries: page,
    hasMore,
    cursor: nextCursor,
  });
});
