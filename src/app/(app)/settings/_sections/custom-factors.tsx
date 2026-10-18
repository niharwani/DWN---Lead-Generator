"use client";

/**
 * Custom Scoring Factors settings section.
 *
 * Teams-tier feature. Currently shown to all users with a muted badge until
 * full RBAC / billing lands in Phase E/F. Each factor fires additional
 * ScoreFactor entries when the configured detection method matches.
 */

import { useTransition, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  createCustomFactorAction,
  updateCustomFactorAction,
  deleteCustomFactorAction,
} from "@/lib/actions";
import type { CustomScoreFactor, DetectionMethod } from "@/lib/scoring/custom-factors";
import { SlidersHorizontal, Plus, Trash2, Pencil } from "lucide-react";

type Props = {
  initialFactors: CustomScoreFactor[];
};

const DETECTION_METHODS: { value: DetectionMethod; label: string }[] = [
  { value: "presence", label: "Presence (field is non-empty)" },
  { value: "regex", label: "Regex (match audit evidence)" },
  { value: "count", label: "Count (numeric threshold)" },
  { value: "manual", label: "Manual (always fires)" },
];

const EMPTY_FORM = {
  code: "",
  label: "",
  points: "10",
  enabled: true,
  detectionMethod: "presence" as DetectionMethod,
  detectionConfig: "",
};

export function CustomFactorsSection({ initialFactors }: Props) {
  const [factors, setFactors] = useState<CustomScoreFactor[]>(initialFactors);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setError(null);
  }

  function openEdit(f: CustomScoreFactor) {
    setEditingId(f.id);
    setForm({
      code: f.code,
      label: f.label,
      points: String(f.points),
      enabled: f.enabled,
      detectionMethod: f.detectionMethod,
      detectionConfig: f.detectionConfig ? JSON.stringify(f.detectionConfig) : "",
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
          const result = await createCustomFactorAction(fd);
          setFactors((prev) => [...prev, result]);
        } else if (editingId) {
          fd.set("factorId", editingId);
          const result = await updateCustomFactorAction(fd);
          setFactors((prev) => prev.map((f) => (f.id === editingId ? result : f)));
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
        fd.set("factorId", id);
        await deleteCustomFactorAction(fd);
        setFactors((prev) => prev.filter((f) => f.id !== id));
      } catch (err) {
        setError((err as Error).message ?? "Delete failed.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <SlidersHorizontal aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>Custom scoring factors</CardTitle>
              <Badge variant="muted">Teams tier</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Add industry-specific scoring rules on top of the built-in factors.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {factors.length === 0 && editingId === null ? (
          <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
            No custom factors yet. Add one to extend lead scoring for your niche.
          </p>
        ) : null}

        {factors.length > 0 ? (
          <ul className="mb-4 divide-y divide-[var(--color-border)]">
            {factors.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {f.label}
                    </span>
                    <Badge variant={f.enabled ? "success" : "muted"}>
                      {f.enabled ? "Active" : "Off"}
                    </Badge>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {f.points > 0 ? "+" : ""}{f.points} pts
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                    code: <code className="rounded bg-[var(--color-neutral-100)] px-1">{f.code}</code>
                    {" · "}method: {f.detectionMethod}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(f.id)}
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
              {editingId === "new" ? "New factor" : "Edit factor"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code" hint="Unique identifier, snake_case.">
                <Input
                  name="code"
                  defaultValue={form.code}
                  placeholder="has_instagram"
                  pattern="[a-z0-9_]+"
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="Label" hint="Human-readable name.">
                <Input
                  name="label"
                  defaultValue={form.label}
                  placeholder="Has Instagram link"
                  required
                  maxLength={200}
                />
              </Field>
              <Field label="Points" hint="Positive adds, negative subtracts.">
                <Input
                  type="number"
                  name="points"
                  defaultValue={form.points}
                  min={-100}
                  max={100}
                  required
                />
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
                  'presence: {"field":"publicEmail"} · regex: {"pattern":"instagram"} · ' +
                  'count: {"field":"auditFindingsCount","operator":">=","threshold":2} · manual: {}'
                }
              >
                <Textarea
                  name="detectionConfig"
                  defaultValue={form.detectionConfig}
                  placeholder='{"field":"publicEmail"}'
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
                {isPending ? "Saving…" : "Save factor"}
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
              Add factor
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
