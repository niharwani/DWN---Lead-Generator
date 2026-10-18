"use client";

/**
 * Audit log settings section.
 *
 * Paginated activity feed with filters for entity type and date range.
 * Each row shows: timestamp, actor, action verb, entity type/id, metadata preview.
 */

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import type { AuditLogEntry } from "@/lib/db/repos/audit-log";
import type { AuditEntityType } from "@/lib/audit-log/writer";

type Props = {
  initialEntries: AuditLogEntry[];
  hasMore: boolean;
  members: Array<{ profileId: string; email: string; fullName: string | null }>;
};

const ACTION_LABELS: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  approved: "approved",
  contacted: "contacted",
  archived: "archived",
  invited: "invited",
  member_removed: "removed member",
  role_changed: "changed role",
  exported: "exported",
  login: "signed in",
  logout: "signed out",
  billing_changed: "changed billing",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  lead: "Lead",
  campaign: "Campaign",
  draft: "Draft",
  task: "Task",
  activity: "Activity",
  member: "Member",
  invite: "Invite",
  webhook: "Webhook",
  cadence: "Cadence",
  session: "Session",
};

const ENTITY_TYPES: AuditEntityType[] = [
  "lead",
  "campaign",
  "draft",
  "task",
  "activity",
  "member",
  "invite",
  "webhook",
  "cadence",
  "session",
];

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function MetadataPreview({
  metadata,
}: {
  metadata: Record<string, unknown> | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!metadata || Object.keys(metadata).length === 0) return null;

  const preview = Object.entries(metadata)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");

  const full = JSON.stringify(metadata, null, 2);

  return (
    <span className="ml-1 text-[11px] text-[var(--color-text-subtle)]">
      {expanded ? (
        <>
          <code className="whitespace-pre-wrap rounded bg-[var(--color-neutral-100)] px-1 py-0.5 text-[10px]">
            {full}
          </code>{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setExpanded(false)}
          >
            less
          </button>
        </>
      ) : (
        <>
          {preview.length > 80 ? preview.slice(0, 80) + "…" : preview}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setExpanded(true)}
          >
            details
          </button>
        </>
      )}
    </span>
  );
}

export function AuditLogSection({ initialEntries, hasMore, members }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>(initialEntries);
  const [cursor, setCursor] = useState<string | undefined>(
    initialEntries.length > 0 ? initialEntries[initialEntries.length - 1]?.createdAt : undefined
  );
  const [canLoadMore, setCanLoadMore] = useState(hasMore);
  const [filterEntityType, setFilterEntityType] = useState<string>("");
  const [filterActor, setFilterActor] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const profileMap = new Map(members.map((m) => [m.profileId, m]));

  function actorLabel(actorProfileId: string | null): string {
    if (!actorProfileId) return "System";
    const m = profileMap.get(actorProfileId);
    return m ? (m.fullName ?? m.email) : actorProfileId.slice(0, 8) + "…";
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const params = new URLSearchParams({ cursor });
      if (filterEntityType) params.set("entityType", filterEntityType);
      if (filterActor) params.set("actorProfileId", filterActor);

      try {
        const res = await fetch(`/api/audit-log?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          entries: AuditLogEntry[];
          hasMore: boolean;
          cursor?: string;
        };
        setEntries((prev) => [...prev, ...data.entries]);
        setCanLoadMore(data.hasMore);
        setCursor(data.cursor);
      } catch {
        // noop
      }
    });
  }

  function applyFilters() {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (filterEntityType) params.set("entityType", filterEntityType);
      if (filterActor) params.set("actorProfileId", filterActor);

      try {
        const res = await fetch(`/api/audit-log?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          entries: AuditLogEntry[];
          hasMore: boolean;
          cursor?: string;
        };
        setEntries(data.entries);
        setCanLoadMore(data.hasMore);
        setCursor(data.cursor);
      } catch {
        // noop
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <Shield aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle>Audit log</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Immutable record of all workspace activity. Teams tier.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-subtle)]">
              Entity type
            </label>
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
            >
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ENTITY_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[var(--color-text-subtle)]">
              Actor
            </label>
            <select
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
              className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
            >
              <option value="">All members</option>
              {members.map((m) => (
                <option key={m.profileId} value={m.profileId}>
                  {m.fullName ?? m.email}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={applyFilters}
            disabled={isPending}
          >
            Filter
          </Button>
        </div>

        {/* Entries */}
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            No audit log entries yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {entries.map((entry) => (
              <li key={entry.id} className="py-2.5">
                <div className="flex items-start gap-2">
                  <time
                    dateTime={entry.createdAt}
                    className="shrink-0 text-[11px] text-[var(--color-text-subtle)]"
                  >
                    {formatTimestamp(entry.createdAt)}
                  </time>
                  <div className="min-w-0 flex-1 text-sm text-[var(--color-text)]">
                    <span className="font-medium">
                      {actorLabel(entry.actorProfileId)}
                    </span>{" "}
                    <span className="text-[var(--color-text-muted)]">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>{" "}
                    <Badge variant="muted">
                      {ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType}
                    </Badge>
                    {entry.entityId && (
                      <span className="ml-1 text-[11px] text-[var(--color-text-subtle)]">
                        #{entry.entityId.slice(0, 8)}
                      </span>
                    )}
                    <MetadataPreview metadata={entry.metadata} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canLoadMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadMore}
              disabled={isPending}
            >
              {isPending ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
