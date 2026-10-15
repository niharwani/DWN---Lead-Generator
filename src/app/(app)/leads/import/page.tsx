import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CsvImportFlow } from "./import-form";

export const metadata: Metadata = { title: "Import CSV" };

export default function ImportCsvPage() {
  return (
    <>
      <div className="mb-2">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft aria-hidden className="h-3 w-3" />
          Back to Leads
        </Link>
      </div>

      <PageHeader
        kicker="Import"
        title="Import leads from CSV"
        description="Upload a CSV, review what will be inserted or updated, then commit. Nothing is written until you click Commit."
      />

      <div className="max-w-4xl">
        <CsvImportFlow />
      </div>

      <p className="mt-4 max-w-4xl text-[11px] text-[var(--color-text-subtle)]">
        Imported cells are stored as plain text — no code is ever executed from
        a CSV. On export, cells beginning with
        {" "}
        <code className="rounded bg-[var(--color-neutral-100)] px-1">=</code>,
        {" "}
        <code className="rounded bg-[var(--color-neutral-100)] px-1">+</code>,
        {" "}
        <code className="rounded bg-[var(--color-neutral-100)] px-1">-</code>,
        {" "}
        or <code className="rounded bg-[var(--color-neutral-100)] px-1">@</code>
        {" "}
        are prefixed with a single quote so Excel and Sheets do not evaluate
        them as formulas (spec §14).
      </p>
    </>
  );
}
