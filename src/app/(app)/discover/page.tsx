import type { Metadata } from "next";
import Link from "next/link";
import {
  Search,
  Globe,
  FileSpreadsheet,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { pageAdapterCapabilities, pageListCampaigns, pageListDiscoveryJobs } from "@/lib/data";
import { runDiscoveryAction } from "@/lib/actions";
import { formatRelative, sourceLabel } from "@/lib/demo/format";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage() {
  const [jobs, campaigns, adapterCaps] = await Promise.all([
    pageListDiscoveryJobs(),
    pageListCampaigns(),
    pageAdapterCapabilities(),
  ]);
  const placesStatus =
    adapterCaps.find((a) => a.name === "google_places")?.status ?? "needs-key";

  return (
    <>
      <PageHeader
        title="Discover"
        description="Run a discovery job against CSV import, manual entry, or Google Places (requires GOOGLE_PLACES_API_KEY). Field-masked, quota-aware, and dedup-aware."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>New discovery</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Shape the search. Runs against configured sources with field-masking, quota awareness, and dedup.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <form action={runDiscoveryAction} className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Campaign"
                hint="Optional — assign discovered leads to a campaign on save."
                className="sm:col-span-2"
              >
                <Select name="campaignId" defaultValue="">
                  <option value="">No campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Niche">
                <Select name="niche" defaultValue="Jewellery & luxury">
                  <option>Jewellery & luxury</option>
                  <option>D2C consumer brands</option>
                  <option>Restaurants & hospitality</option>
                  <option>Interior designers & architects</option>
                  <option>Consultants & professional services</option>
                  <option>Clinics & local services</option>
                  <option>SMB operations</option>
                </Select>
              </Field>

              <Field label="City or region">
                <Input name="city" defaultValue="Mumbai" />
              </Field>

              <Field
                label="Search keywords"
                hint="Comma-separated. Narrows provider queries."
              >
                <Input name="keywords" placeholder="e.g. heritage, zaveri bazaar" />
              </Field>

              <Field
                label="Business-type keywords"
                hint="Google Places taxonomy terms."
              >
                <Input name="businessTypes" placeholder="e.g. jewelry_store, boutique" />
              </Field>

              <Field label="Result limit">
                <Select name="limit" defaultValue="30">
                  <option>10</option>
                  <option>20</option>
                  <option>30</option>
                  <option>50</option>
                  <option>100</option>
                </Select>
              </Field>

              <Field label="Source">
                <Select name="sourceName" defaultValue={placesStatus === "ready" ? "google_places" : "manual"}>
                  <option value="manual">Manual entry</option>
                  <option value="csv_import">CSV import</option>
                  <option value="google_places" disabled={placesStatus !== "ready"}>
                    Google Places{placesStatus !== "ready" ? " (needs API key)" : ""}
                  </option>
                </Select>
              </Field>

              <div className="flex flex-wrap gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <input
                    type="checkbox"
                    name="runAudit"
                    value="1"
                    defaultChecked
                    className="h-3.5 w-3.5 accent-[var(--color-accent-600)]"
                  />
                  Run website audit on each result
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <input
                    type="checkbox"
                    name="scoreAfter"
                    value="1"
                    defaultChecked
                    className="h-3.5 w-3.5 accent-[var(--color-accent-600)]"
                  />
                  Score leads after discovery
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="text-[11px] text-[var(--color-text-subtle)]">
                  Discovery is foreground — the page waits until the job finishes. Manual entry opens the Add Lead form; CSV import opens the import flow.
                </p>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" type="submit">
                    <Search aria-hidden className="h-3.5 w-3.5" />
                    Run discovery
                  </Button>
                </div>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Available sources</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <SourceStatus
                icon={<PlusCircle aria-hidden className="h-4 w-4 text-[var(--color-accent-600)]" />}
                name="Manual entry"
                status="ready"
                description="Add one lead at a time. Fastest path to a focused list."
              />
              <SourceStatus
                icon={<FileSpreadsheet aria-hidden className="h-4 w-4 text-[var(--color-accent-600)]" />}
                name="CSV import"
                status="ready"
                description="Template, column mapping, dedup preview, and formula-injection guards (spec §14)."
              />
              <SourceStatus
                icon={<Globe aria-hidden className="h-4 w-4 text-[var(--color-accent-600)]" />}
                name="Google Places"
                status={placesStatus === "ready" ? "ready" : "needs-key"}
                description="Server-side, field-masked, quota-aware. Field mask limits payloads to the columns we store."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Policy reminders</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-[11px] text-[var(--color-text-muted)]">
              <p>
                <AlertTriangle
                  aria-hidden
                  className="mr-1 inline h-3 w-3 align-[-2px] text-[color:#8c6a00]"
                />
                No Google Search HTML scraping. No LinkedIn scraping. No CAPTCHA
                bypass or proxy rotation for evasion.
              </p>
              <p>
                Website audits run only on URLs the owner provides or that come
                from a permitted source. The audit engine applies SSRF defenses
                before every fetch.
              </p>
              <p>
                Discovery never auto-contacts. Every outreach starts as{" "}
                <code className="rounded bg-[var(--color-neutral-100)] px-1">
                  needs_review
                </code>
                .
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* --- Recent jobs ------------------------------------------------- */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent discovery jobs</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <Table className="border-0">
              <THead>
                <TR>
                  <TH>Source</TH>
                  <TH>Niche</TH>
                  <TH>City</TH>
                  <TH>Status</TH>
                  <TH>Progress</TH>
                  <TH>Results</TH>
                  <TH>Started</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((job) => (
                  <TR key={job.id}>
                    <TD className="text-xs">{sourceLabel(job.sourceName)}</TD>
                    <TD className="text-xs text-[var(--color-text-muted)]">{job.input.niche}</TD>
                    <TD className="text-xs text-[var(--color-text-muted)]">
                      {job.input.city ?? "—"}
                    </TD>
                    <TD>
                      <JobStatusBadge status={job.status} errorSummary={job.errorSummary} />
                    </TD>
                    <TD className="text-xs tabular-nums text-[var(--color-text-muted)]">
                      {job.progressCurrent} / {job.progressTotal}
                    </TD>
                    <TD className="text-xs tabular-nums">{job.resultCount}</TD>
                    <TD className="text-xs text-[var(--color-text-subtle)]">
                      {formatRelative(job.startedAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
        <p className="mt-3 text-[11px] text-[var(--color-text-subtle)]">
          Jobs record progress, dedup counts, and errors inline. Reload after
          launching to see the final state.
          <Link
            href="/settings"
            className="ml-1 text-[var(--color-accent-700)] hover:underline"
          >
            Configure sources in Settings →
          </Link>
        </p>
      </div>
    </>
  );
}

function SourceStatus({
  icon,
  name,
  status,
  description,
}: {
  icon: React.ReactNode;
  name: string;
  status: "ready" | "needs-key";
  description: string;
}) {
  const badge =
    status === "ready" ? (
      <Badge variant="success">
        <CheckCircle2 aria-hidden className="h-3 w-3" />
        Ready
      </Badge>
    ) : (
      <Badge variant="warning">
        <AlertTriangle aria-hidden className="h-3 w-3" />
        Needs key
      </Badge>
    );
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[var(--color-text)]">{name}</span>
          {badge}
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
    </div>
  );
}

function JobStatusBadge({
  status,
  errorSummary,
}: {
  status: import("@/lib/demo/types").DiscoveryJobStatus;
  errorSummary?: string;
}) {
  if (status === "completed")
    return <Badge variant="success">Completed</Badge>;
  if (status === "partial")
    return (
      <Badge variant="warning" title={errorSummary}>
        Partial
      </Badge>
    );
  if (status === "failed") return <Badge variant="danger">Failed</Badge>;
  if (status === "running") return <Badge variant="info">Running</Badge>;
  if (status === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
  return <Badge variant="muted">Queued</Badge>;
}
