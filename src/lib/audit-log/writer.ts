/**
 * Audit-log write-side primitive.
 *
 * `recordAuditLog` is fail-silent: if the DB write throws, the error is
 * logged but never re-thrown so that audit log failures can never break the
 * parent mutation.
 *
 * All writes go directly to the real `audit_log` table (NOT app_settings).
 */

import { getDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "approved"
  | "contacted"
  | "archived"
  | "invited"
  | "member_removed"
  | "role_changed"
  | "exported"
  | "login"
  | "logout"
  | "billing_changed";

export type AuditEntityType =
  | "lead"
  | "campaign"
  | "draft"
  | "task"
  | "activity"
  | "member"
  | "invite"
  | "webhook"
  | "cadence"
  | "session";

/* --------------------------------------------------------------------------
 * Writer
 * -------------------------------------------------------------------------- */

/**
 * Write an audit log entry.
 *
 * @param workspaceId     - The workspace (tenant) this event belongs to.
 * @param actorProfileId  - The profile id of the user performing the action.
 *                          May be null for system-initiated events.
 * @param action          - What happened.
 * @param entityType      - The kind of entity that was acted on.
 * @param entityId        - The specific entity id (optional).
 * @param metadata        - Additional context stored as JSON (optional).
 * @param ipAddress       - Caller IP for security-relevant events (optional).
 * @param userAgent       - Caller user-agent (optional).
 *
 * Fail-silent: errors are swallowed after console.warn.
 */
export async function recordAuditLog(
  workspaceId: string,
  actorProfileId: string | null,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId?: string | null,
  metadata?: Record<string, unknown> | null,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      workspaceId,
      actorProfileId: actorProfileId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: metadata ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Audit log failures must never break the caller.
    console.warn("[audit-log] Failed to write audit entry:", {
      workspaceId,
      actorProfileId,
      action,
      entityType,
      entityId,
      reason: (err as Error).message,
    });
  }
}
