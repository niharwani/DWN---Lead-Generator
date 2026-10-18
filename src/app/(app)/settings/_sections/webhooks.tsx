"use client";

/**
 * Webhooks settings section.
 *
 * CRUD surface for outbound webhooks.
 * Fields: URL, events (multi-select), test button, enabled toggle.
 *
 * NOTE: The underlying webhooks.ts repo still uses app_settings (Phase D
 * carried that shortcut over from the original spec). The UI calls through
 * to the existing Phase D actions (createWebhookAction, deleteWebhookAction,
 * testWebhookAction). A future cleanup pass should migrate the repo to the
 * real webhooks table that was added in migration 0004.
 */

import { useState, useTransition } from "react";
import {
  createWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
} from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Webhook as WebhookIcon, Trash2, Zap } from "lucide-react";
import type { WebhookConfig } from "@/lib/db/repos/webhooks";

const AVAILABLE_EVENTS = [
  "lead.created",
  "lead.stage_changed",
  "lead.scored",
  "draft.approved",
  "draft.reply_received",
  "task.completed",
  "member.invited",
  "member.removed",
];

type Props = {
  initialWebhooks: WebhookConfig[];
};

export function WebhooksSection({ initialWebhooks }: Props) {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(initialWebhooks);
  const [isPending, startTransition] = useTransition();

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Test result
  const [testedId, setTestedId] = useState<string | null>(null);

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAddError(null);
    const fd = new FormData();
    fd.set("url", url.trim());
    fd.set("events", selectedEvents.join(","));
    startTransition(async () => {
      try {
        await createWebhookAction(fd);
        // Refetch would need a server round-trip; for now reload to get fresh list
        window.location.reload();
      } catch (err) {
        setAddError((err as Error).message);
      }
    });
  }

  function handleDelete(id: string) {
    const fd = new FormData();
    fd.set("webhookId", id);
    startTransition(async () => {
      try {
        await deleteWebhookAction(fd);
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
        setConfirmDeleteId(null);
      } catch {
        setConfirmDeleteId(null);
      }
    });
  }

  function handleTest(id: string) {
    const fd = new FormData();
    fd.set("webhookId", id);
    startTransition(async () => {
      try {
        await testWebhookAction(fd);
        setTestedId(id);
        setTimeout(() => setTestedId(null), 3000);
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
            <WebhookIcon aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle>Webhooks</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Outbound webhooks for integrating with external services. Teams tier.
              Payloads are signed with HMAC-SHA256.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {/* Existing webhooks */}
        {webhooks.length === 0 ? (
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">
            No webhooks configured yet.
          </p>
        ) : (
          <ul className="mb-4 divide-y divide-[var(--color-border)]">
            {webhooks.map((wh) => (
              <li
                key={wh.id}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-[var(--color-text)]">
                      {wh.url}
                    </span>
                    <Badge variant={wh.enabled ? "success" : "muted"}>
                      {wh.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <Badge key={ev} variant="muted">
                        {ev}
                      </Badge>
                    ))}
                    {wh.events.length === 0 && (
                      <span className="text-[11px] text-[var(--color-text-subtle)]">
                        No events selected
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                    Created {new Date(wh.createdAt).toLocaleDateString()} · secret
                    auto-generated
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTest(wh.id)}
                    disabled={isPending}
                    title="Send a probe event"
                  >
                    <Zap aria-hidden className="h-3.5 w-3.5" />
                    {testedId === wh.id ? "Sent!" : "Test"}
                  </Button>

                  {confirmDeleteId === wh.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        Delete?
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(wh.id)}
                        disabled={isPending}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(wh.id)}
                      disabled={isPending}
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add webhook form */}
        {showForm ? (
          <form onSubmit={handleAdd} className="rounded-sm border border-[var(--color-border)] p-4">
            <h3 className="mb-3 text-sm font-medium text-[var(--color-text)]">
              New webhook
            </h3>
            <Field label="URL" className="mb-3">
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-service.com/webhook"
                required
                autoFocus
              />
            </Field>
            <div className="mb-3">
              <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">
                Events to subscribe to
              </p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_EVENTS.map((ev) => (
                  <label
                    key={ev}
                    className="flex cursor-pointer items-center gap-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
            {addError && (
              <p className="mb-2 text-xs text-[var(--color-danger-500)]">{addError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setUrl("");
                  setSelectedEvents([]);
                  setAddError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isPending || !url.trim()}
              >
                {isPending ? "Adding…" : "Add webhook"}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            Add webhook
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
