"use client";

/**
 * Custom Audit Signals settings section.
 *
 * Teams-tier feature — shown to all with a muted badge until Phase E/F.
 * Each signal appends an AuditFinding when the detection method fires.
 */

import { useTransition, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  createCustomSignalAction,
  updateCustomSignalAction,
  deleteCustomSignalAction,
} from "@/lib/actions";
import type { CustomAuditSignal, SignalDetectionMethod, SignalSeverity } from "@/lib/audit/custom-signals";
import { Globe, Plus, Trash2, Pencil } from "lucide-react";

type Props = {
  initialSignals: CustomAuditSignal[];
};

const DETECTION_METHODS: { value: SignalDetectionMethod; label: string }[] = [
  { value: "regex", label: "Regex (match HTML)" },
  { value: "presence", label: "Presence (social / link)" },
  { value: "absence", label: "Absence (pattern not found)" },
  { value: "count", label: "Count (minimum matches)" },
];

const SEVERITIES: { value: SignalSeverity; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const EMPTY_FORM = {
  code: "",
  label: "",
  severity: "info" as SignalSeverity,
  enabled: true,
  detectionMethod: "regex" as SignalDetectionMethod,
  detectionConfig: "",
};

export function CustomSignalsSection({ initialSignals }: Props) {
  const [signals, setSignals] = useState<CustomAuditSignal[]>(initialSignals);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setError(null);
  }

  function openEdit(s: CustomAuditSignal) {
    setEditingId(s.id);
    setForm({
      code: s.code,
      label: s.label,
      severity: s.severity,
      enabled: s.enabled,
      detectionMethod: s.detectionMethod,
      detectionConfig: s.detectionConfig ? JSON.stringify(s.detectionConfig) : "",
    });
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setError(null);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        if (editingId === "new") {
          const result = await createCustomSignalAction(fd);
          setSignals((prev) => [...prev, result]);
        } else if (editingId) {
          fd.set("signalId", editingId);
          const result = await updateCustomSignalAction(fd);
          setSignals((prev) => prev.map((s) => (s.id === editingId ? result : s)));
        }
        setEditingId(null);
      } catch (err) {
        setError((err as Error).message ?? "Save failed.");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("signalId", id);
        await deleteCustomSignalAction(fd);
        setSignals((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        setError((err as Error).message ?? "Delete failed.");
      }
    });
  }

  const severityBadgeVariant = (sev: SignalSeverity): "success" | "warning" | "danger" | "muted" => {
    switch (sev) {
      case "high": return "danger";
      case "medium": return "warning";
      case "low": return "muted";
      default: return "muted";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <Globe aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>Custom audit signals</CardTitle>
              <Badge variant="muted">Teams tier</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Add checks that run alongside the 8 baseline audit checks.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {signals.length === 0 && editingId === null ? (
          <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
            No custom audit signals yet. Add one to extend the audit engine for your niche.
          </p>
        ) : null}

        {signals.length > 0 ? (
          <ul className="mb-4 divide-y divide-[var(--color-border)]">
            {signals.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {s.label}
                    </span>
                    <Badge variant={severityBadgeVariant(s.severity)}>
                      {s.severity}
                    </Badge>
                    <Badge variant={s.enabled ? "success" : "muted"}>
                      {s.enabled ? "Active" : "Off"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                    code: <code className="rounded bg-[var(--color-neutral-100)] px-1">{s.code}</code>
                    {" · "}method: {s.detectionMethod}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(s.id)}
                    disabled={isPending}
                  >
                    <Trash2 aria-hidden className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {editingId !== null ? (
          <form onSubmit={handleSave} className="rounded-sm border border-[var(--color-border)] p-4">
            <p className="mb-3 text-sm font-medium text-[var(--color-text)]">
              {editingId === "new" ? "New signal" : "Edit signal"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code" hint="Unique identifier, snake_case.">
                <Input
                  name="code"
                  defaultValue={form.code}
                  placeholder="has_booking_widget"
                  pattern="[a-z0-9_]+"
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="Label" hint="Shown in audit findings.">
                <Input
                  name="label"
                  defaultValue={form.label}
                  placeholder="Has booking widget"
                  required
                  maxLength={200}
                />
              </Field>
              <Field label="Severity">
                <Select name="severity" defaultValue={form.severity}>
                  {SEVERITIES.map((sv) => (
                    <option key={sv.value} value={sv.value}>{sv.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Detection method">
                <Select name="detectionMethod" defaultValue={form.detectionMethod}>
                  {DETECTION_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Detection config (JSON)"
                className="sm:col-span-2"
                hint={
                  'regex: {"pattern":"booking|calendly","flags":"i"} · ' +
                  'presence: {"linkPattern":"instagram"} · ' +
                  'absence: {"pattern":"privacy-policy"} · ' +
                  'count: {"pattern":"<img","minCount":5}'
                }
              >
                <Textarea
                  name="detectionConfig"
                  defaultValue={form.detectionConfig}
                  placeholder='{"pattern":"booking|calendly","flags":"i"}'
                />
              </Field>
              <Field label="Enabled">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={form.enabled}
                    value="1"
                  />
                  Active
                </label>
              </Field>
            </div>
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save signal"}
              </Button>
              <Button variant="secondary" size="sm" type="button" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {editingId === null ? (
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={openNew}>
              <Plus aria-hidden className="h-3.5 w-3.5" />
              Add signal
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
