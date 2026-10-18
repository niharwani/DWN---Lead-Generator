/**
 * Audit log read helpers.
 *
 * All writes go through `src/lib/audit-log/writer.ts`.
 * These helpers are for the Settings page audit log feed and dashboard chips.
 */

import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import type { Db } from "../client";
import { auditLog } from "../schema";
import type { AuditAction, AuditEntityType } from "@/lib/audit-log/writer";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type AuditLogFilter = {
  /** Max number of entries to return. Defaults to 50. */
  limit?: number;
  /**
   * Cursor for keyset pagination.
   * Pass the `createdAt` of the last row from the previous page.
   */
  cursor?: string;
  /** Filter to a specific entity type. */
  entityType?: AuditEntityType;
  /** Filter to a specific actor. */
  actorProfileId?: string;
};

export type AuditLogEntry = {
  id: string;
  workspaceId: string;
  actorProfileId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

/* --------------------------------------------------------------------------
 * List (paginated, newest-first)
 * -------------------------------------------------------------------------- */

export async function listAuditLog(
  db: Db,
  workspaceId: string,
  filter: AuditLogFilter = {}
): Promise<AuditLogEntry[]> {
  const { limit = 50, cursor, entityType, actorProfileId } = filter;

  const conditions = [eq(auditLog.workspaceId, workspaceId)];

  if (cursor) {
    // Keyset pagination: entries older than cursor (strictly less than)
    conditions.push(lt(auditLog.createdAt, cursor));
  }

  if (entityType) {
    conditions.push(eq(auditLog.entityType, entityType));
  }

  if (actorProfileId) {
    conditions.push(eq(auditLog.actorProfileId, actorProfileId));
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    actorProfileId: r.actorProfileId ?? null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId ?? null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    ipAddress: r.ipAddress ?? null,
    userAgent: r.userAgent ?? null,
    createdAt: r.createdAt,
  }));
}

/* --------------------------------------------------------------------------
 * Single entry
 * -------------------------------------------------------------------------- */

export async function getAuditEntry(
  db: Db,
  workspaceId: string,
  id: string
): Promise<AuditLogEntry | undefined> {
  const [row] = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.workspaceId, workspaceId), eq(auditLog.id, id)))
    .limit(1);

  if (!row) return undefined;

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actorProfileId: row.actorProfileId ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    createdAt: row.createdAt,
  };
}

/* --------------------------------------------------------------------------
 * Count (for dashboard chip)
 * -------------------------------------------------------------------------- */

export async function countAuditLog(
  db: Db,
  workspaceId: string,
  options: { since?: Date } = {}
): Promise<number> {
  const conditions = [eq(auditLog.workspaceId, workspaceId)];

  if (options.since) {
    conditions.push(gte(auditLog.createdAt, options.since.toISOString()));
  }

  const [row] = await db
    .select({ total: count() })
    .from(auditLog)
    .where(and(...conditions));

  return row?.total ?? 0;
}
