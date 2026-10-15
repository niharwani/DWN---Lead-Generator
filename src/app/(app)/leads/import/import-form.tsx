"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

type RowError = { rowNumber: number; reason: string };

type Preview = {
  columns: Array<{ raw: string; mapped: string | null }>;
  totalRows: number;
  parseWarnings: string[];
  rows: Array<{
    rowNumber: number;
    classification: "new" | "dup_domain" | "dup_name_city";
    conflictLeadId?: string;
    parsed: {
      business_name: string;
      niche: string;
      city: string;
      website_url?: string;
    };
  }>;
  errors: RowError[];
  counts: {
    total: number;
    new: number;
    duplicatesByDomain: number;
    duplicatesByNameCity: number;
    invalid: number;
  };
};

type CommitSummary = {
  summary: {
    inserted: number;
    updated: number;
    skippedDuplicate: number;
    invalid: number;
    total: number;
  };
  errors: RowError[];
};

export function CsvImportFlow() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filename, setFilename] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [strategy, setStrategy] = useState<"skip" | "update_existing">("skip");
  const [commitResult, setCommitResult] = useState<CommitSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCommitResult(null);
    try {
      const text = await file.text();
      setFilename(file.name);
      setContent(text);
      await fetchPreview(text);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function fetchPreview(csv: string) {
    const res = await fetch("/api/leads/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "preview", content: csv }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      setError(body?.error?.message ?? `Preview failed (${res.status}).`);
      setPreview(null);
      return;
    }
    const data = (await res.json()) as { preview: Preview };
    setPreview(data.preview);
  }

  function reset() {
    setFilename(null);
    setContent(null);
    setPreview(null);
    setCommitResult(null);
    setError(null);
  }

  function commit() {
    if (!content) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "commit",
          content,
          duplicateStrategy: strategy,
          sourceName: "csv_import",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(body?.error?.message ?? `Commit failed (${res.status}).`);
        return;
      }
      const data = (await res.json()) as CommitSummary;
      setCommitResult(data);
      router.refresh();
    });
  }

  if (commitResult) {
    const s = commitResult.summary;
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Import complete</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {s.inserted + s.updated} rows written, {s.skippedDuplicate} skipped,{" "}
              {s.invalid} invalid.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={reset}>
            <Upload aria-hidden className="h-3.5 w-3.5" />
            Import another
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-4 gap-3 text-xs">
            <SummaryCell label="Inserted" value={s.inserted} tone="success" />
            <SummaryCell label="Updated" value={s.updated} tone="info" />
            <SummaryCell label="Skipped (duplicates)" value={s.skippedDuplicate} />
            <SummaryCell label="Invalid" value={s.invalid} tone="warning" />
          </div>
          {commitResult.errors.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
                Rows that failed
              </h3>
              <ul className="divide-y divide-[var(--color-border)] rounded-sm border border-[var(--color-border)] text-xs">
                {commitResult.errors.slice(0, 20).map((e) => (
                  <li
                    key={`${e.rowNumber}-${e.reason}`}
                    className="flex items-start gap-2 px-3 py-2"
                  >
                    <span className="w-10 shrink-0 text-[var(--color-text-subtle)]">
                      row {e.rowNumber}
                    </span>
                    <span className="text-[var(--color-text)]">{e.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Upload a CSV</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Download the template below to see the expected columns. Common
              aliases (name / company / email / phone / industry) are mapped
              automatically.
            </p>
          </div>
          <a
            href="/api/leads/import/template"
            className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
          >
            <FileSpreadsheet aria-hidden className="h-3 w-3" />
            Template
          </a>
        </CardHeader>
        <CardBody>
          <label className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--color-border-strong)] bg-[var(--color-neutral-50)] p-6 text-center hover:bg-[var(--color-neutral-100)]">
            <Upload aria-hidden className="h-5 w-5 text-[var(--color-text-subtle)]" />
            <span className="text-sm text-[var(--color-text)]">
              {filename ? filename : "Choose a .csv file"}
            </span>
            <span className="text-[11px] text-[var(--color-text-subtle)]">
              Max 5 MB. UTF-8 preferred.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={onFile}
            />
          </label>
          {error ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-[color:#991b1b]">
              <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  const totalDup =
    preview.counts.duplicatesByDomain + preview.counts.duplicatesByNameCity;
  const commitDisabled = preview.counts.new === 0 && (strategy === "skip" || totalDup === 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Preview</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {filename} · {preview.totalRows}{" "}
              {preview.totalRows === 1 ? "row" : "rows"}. Nothing has been
              written yet.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            <X aria-hidden className="h-3.5 w-3.5" />
            Start over
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-4 gap-3 text-xs">
            <SummaryCell label="New" value={preview.counts.new} tone="success" />
            <SummaryCell
              label="Duplicate (domain)"
              value={preview.counts.duplicatesByDomain}
              tone="info"
            />
            <SummaryCell
              label="Duplicate (name + city)"
              value={preview.counts.duplicatesByNameCity}
              tone="info"
            />
            <SummaryCell
              label="Invalid"
              value={preview.counts.invalid}
              tone="warning"
            />
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-neutral-50)] p-3 text-xs text-[var(--color-text-muted)]">
            <div className="mb-1 font-medium text-[var(--color-text)]">
              Column mapping
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {preview.columns.map((c, i) => (
                <li key={`${c.raw}-${i}`} className="flex items-center gap-1.5">
                  <code className="rounded bg-[var(--color-neutral-100)] px-1">
                    {c.raw || "(blank)"}
                  </code>
                  <span>→</span>
                  {c.mapped ? (
                    <span className="font-medium text-[var(--color-text)]">
                      {c.mapped}
                    </span>
                  ) : (
                    <span className="italic text-[var(--color-text-subtle)]">
                      ignored
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {preview.errors.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
                Row errors ({preview.errors.length})
              </h3>
              <ul className="divide-y divide-[var(--color-border)] rounded-sm border border-[var(--color-border)] text-xs">
                {preview.errors.slice(0, 15).map((e) => (
                  <li
                    key={`${e.rowNumber}-${e.reason}`}
                    className="flex items-start gap-2 px-3 py-2"
                  >
                    <span className="w-10 shrink-0 text-[var(--color-text-subtle)]">
                      row {e.rowNumber}
                    </span>
                    <span className="text-[var(--color-text)]">{e.reason}</span>
                  </li>
                ))}
              </ul>
              {preview.errors.length > 15 ? (
                <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
                  … {preview.errors.length - 15} more. Fix the file and
                  re-upload to see the full list.
                </p>
              ) : null}
            </div>
          ) : null}

          {preview.rows.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
                Rows (first 10)
              </h3>
              <div className="overflow-x-auto rounded-sm border border-[var(--color-border)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--color-neutral-50)] text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Row</th>
                      <th className="px-2 py-1.5 text-left">Classification</th>
                      <th className="px-2 py-1.5 text-left">Business</th>
                      <th className="px-2 py-1.5 text-left">Niche</th>
                      <th className="px-2 py-1.5 text-left">City</th>
                      <th className="px-2 py-1.5 text-left">Website</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {preview.rows.slice(0, 10).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-2 py-1.5 text-[var(--color-text-subtle)]">
                          {r.rowNumber}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.classification === "new" ? (
                            <Badge variant="success">New</Badge>
                          ) : r.classification === "dup_domain" ? (
                            <Badge variant="info">Duplicate (domain)</Badge>
                          ) : (
                            <Badge variant="info">Duplicate (name + city)</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-text)]">
                          {r.parsed.business_name}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-text-muted)]">
                          {r.parsed.niche}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-text-muted)]">
                          {r.parsed.city}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-text-muted)]">
                          {r.parsed.website_url ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commit</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <fieldset className="space-y-2 text-xs">
            <legend className="mb-1 font-medium text-[var(--color-text)]">
              Duplicate handling
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="dupstrategy"
                value="skip"
                checked={strategy === "skip"}
                onChange={() => setStrategy("skip")}
              />
              <span>
                Skip duplicates (default — leave existing leads untouched)
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="dupstrategy"
                value="update_existing"
                checked={strategy === "update_existing"}
                onChange={() => setStrategy("update_existing")}
              />
              <span>
                Update existing leads (email, phone, address, category, niche)
              </span>
            </label>
          </fieldset>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
            <p className="text-[11px] text-[var(--color-text-subtle)]">
              {commitDisabled
                ? "Nothing to insert or update with the current strategy."
                : `Will write ${preview.counts.new} new row${preview.counts.new === 1 ? "" : "s"}` +
                  (strategy === "update_existing" && totalDup > 0
                    ? ` + update ${totalDup} existing lead${totalDup === 1 ? "" : "s"}.`
                    : ".")}
            </p>
            <Button
              type="button"
              variant="primary"
              onClick={commit}
              disabled={commitDisabled || isPending}
            >
              <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
              {isPending ? "Committing…" : "Commit import"}
            </Button>
          </div>
          {error ? (
            <p className="flex items-start gap-1.5 text-xs text-[color:#991b1b]">
              <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-[var(--color-success-100)] bg-[var(--color-success-100)]/40"
      : tone === "warning"
        ? "border-[var(--color-warning-100)] bg-[var(--color-warning-100)]/40"
        : tone === "info"
          ? "border-[var(--color-info-100)] bg-[var(--color-info-100)]/40"
          : "border-[var(--color-border)] bg-[var(--color-surface)]";
  return (
    <div className={`rounded-sm border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--color-text)]">
        {value}
      </div>
    </div>
  );
}
