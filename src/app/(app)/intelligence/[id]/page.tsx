import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Globe,
  Users,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  pageGetCrawlJob,
  pageGetLead,
  pageLatestAudit,
  pageListCrawlPages,
  pageListPeopleForLead,
} from "@/lib/data";
import { cancelIntelCrawlAction } from "@/lib/actions";
import { formatDateTime, formatRelative } from "@/lib/demo/format";

export const metadata: Metadata = { title: "Crawl" };

type Params = { params: Promise<{ id: string }> };

export default async function CrawlJobDetail({ params }: Params) {
  const { id } = await params;
  const job = await pageGetCrawlJob(id);
  if (!job) notFound();

  const pages = await pageListCrawlPages(job.id);
  const [lead, people, audit] = await Promise.all([
    job.leadId ? pageGetLead(job.leadId) : Promise.resolve(undefined),
    job.leadId ? pageListPeopleForLead(job.leadId) : Promise.resolve([]),
    job.leadId ? pageLatestAudit(job.leadId) : Promise.resolve(undefined),
  ]);

  const successful = pages.filter((p) => p.status === "fetched");
  const failed = pages.filter((p) => p.status === "failed" || p.status === "blocked");

  return (
    <>
      <PageHeader
        title={job.seedLabel ?? job.seedUrl}
        description={`Crawl of ${job.seedUrl} · ${pages.length} page(s) processed · ${job.findingsCount} website finding(s)`}
        actions={
          <Link
            href="/intelligence"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft aria-hidden className="h-3 w-3" />
            Back
          </Link>
        }
      />

      {/* Summary strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Status" value={<StatusBadge status={job.status} note={job.errorSummary ?? undefined} />} />
        <SummaryTile
          label="Pages fetched"
          value={<span className="text-xl font-semibold tabular-nums">{successful.length}</span>}
          hint={failed.length > 0 ? `${failed.length} failed` : undefined}
        />
        <SummaryTile
          label="People found"
          value={<span className="text-xl font-semibold tabular-nums">{job.peopleFound}</span>}
          hint="public, cited to source URL"
        />
        <SummaryTile
          label="Website findings"
          value={<span className="text-xl font-semibold tabular-nums">{job.findingsCount}</span>}
          hint="opportunities to lead outreach with"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Lead card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lead</CardTitle>
          </CardHeader>
          <CardBody>
            {lead ? (
              <div className="space-y-2 text-sm">
                <Link
                  href={`/leads/${lead.id}`}
                  className="text-[var(--color-accent-700)] font-medium hover:underline"
                >
                  {lead.businessName}
                </Link>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {lead.niche}
                  {lead.city ? ` · ${lead.city}` : ""}
                  {lead.region ? `, ${lead.region}` : ""}
                </div>
                {lead.websiteUrl ? (
                  <a
                    href={lead.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--color-accent-700)] hover:underline"
                  >
                    <Globe aria-hidden className="h-3 w-3" />
                    {lead.websiteUrl.replace(/^https?:\/\//, "")}
                  </a>
                ) : null}
                {lead.publicEmail ? (
                  <div className="text-xs">
                    <span className="text-[var(--color-text-subtle)]">Email:</span>{" "}
                    {lead.publicEmail}
                  </div>
                ) : null}
                {lead.publicPhone ? (
                  <div className="text-xs">
                    <span className="text-[var(--color-text-subtle)]">Phone:</span>{" "}
                    {lead.publicPhone}
                  </div>
                ) : null}
                <div className="pt-2">
                  <Badge variant="muted">Score {lead.score?.total ?? "—"}</Badge>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">
                No lead association recorded — the seed URL may have been invalid.
              </p>
            )}
          </CardBody>
        </Card>

        {/* People card */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users aria-hidden className="h-4 w-4 text-[var(--color-accent-600)]" />
              <CardTitle>Publicly documented decision-makers</CardTitle>
            </div>
            <Badge variant="muted">{people.length}</Badge>
          </CardHeader>
          <CardBody className="p-0">
            {people.length === 0 ? (
              <div className="px-4 py-6 text-xs text-[var(--color-text-muted)]">
                No decision-maker names could be extracted from the crawled pages. This is normal when
                the site has no public team / leadership page.
              </div>
            ) : (
              <Table className="border-0">
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Title</TH>
                    <TH>Confidence</TH>
                    <TH>Source</TH>
                  </TR>
                </THead>
                <TBody>
                  {people.map((p) => (
                    <TR key={p.id}>
                      <TD className="text-xs font-medium">{p.fullName}</TD>
                      <TD className="text-xs text-[var(--color-text-muted)]">
                        {p.jobTitle ?? "—"}
                      </TD>
                      <TD>
                        <ConfidenceBadge confidence={p.confidence} />
                      </TD>
                      <TD className="text-xs">
                        <a
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--color-accent-700)] hover:underline"
                        >
                          Page
                          <ExternalLink aria-hidden className="h-3 w-3" />
                        </a>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Pages card */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Pages processed</CardTitle>
            <Badge variant="muted">{pages.length}</Badge>
          </CardHeader>
          <CardBody className="p-0">
            {pages.length === 0 ? (
              <div className="px-4 py-6 text-xs text-[var(--color-text-muted)]">
                No pages recorded yet. If the crawl is still running, refresh in a few seconds.
              </div>
            ) : (
              <Table className="border-0">
                <THead>
                  <TR>
                    <TH>URL</TH>
                    <TH>Status</TH>
                    <TH>HTTP</TH>
                    <TH>Bytes</TH>
                    <TH>Via</TH>
                    <TH>Depth</TH>
                    <TH>When</TH>
                  </TR>
                </THead>
                <TBody>
                  {pages.map((p) => (
                    <TR key={p.id}>
                      <TD className="max-w-md truncate text-xs">
                        <a
                          href={p.finalUrl ?? p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-accent-700)] hover:underline"
                          title={p.title ?? p.url}
                        >
                          {p.title ?? p.url.replace(/^https?:\/\/[^/]+/, "")}
                        </a>
                      </TD>
                      <TD>
                        <PageStatus status={p.status} reason={p.errorReason ?? undefined} />
                      </TD>
                      <TD className="text-xs tabular-nums">{p.httpStatus ?? "—"}</TD>
                      <TD className="text-xs tabular-nums text-[var(--color-text-muted)]">
                        {p.bytes != null ? `${Math.round(p.bytes / 1024)} KB` : "—"}
                      </TD>
                      <TD className="text-xs text-[var(--color-text-muted)]">
                        {p.discoveredVia}
                      </TD>
                      <TD className="text-xs tabular-nums">{p.depth}</TD>
                      <TD className="text-xs text-[var(--color-text-subtle)]">
                        {formatRelative(p.fetchedAt ?? p.createdAt)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Findings card */}
        {audit ? (
          <Card className="lg:col-span-5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle aria-hidden className="h-4 w-4 text-[color:#8c6a00]" />
                <CardTitle>Website findings</CardTitle>
              </div>
              <Badge variant="muted">{audit.findings.length}</Badge>
            </CardHeader>
            <CardBody>
              {audit.findings.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  No findings — the crawled pages passed the baseline intelligence checks.
                </p>
              ) : (
                <ul className="space-y-3">
                  {audit.findings.map((f, idx) => (
                    <li
                      key={`${f.code}-${idx}`}
                      className="rounded border border-[var(--color-border)] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <SeverityBadge severity={f.severity} />
                            <span className="text-sm font-medium">{f.title}</span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {f.description}
                          </p>
                          {f.evidence ? (
                            <p className="mt-1 font-mono text-[11px] text-[var(--color-text-subtle)]">
                              {f.evidence}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-[var(--color-text)]">
                            <span className="text-[var(--color-text-subtle)]">Fix:</span>{" "}
                            {f.recommendation}
                          </p>
                        </div>
                        {f.evidenceUrl ? (
                          <a
                            href={f.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--color-accent-700)] hover:underline"
                          >
                            Source
                            <ExternalLink aria-hidden className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ) : null}

        {/* Diagnostics */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Job diagnostics</CardTitle>
          </CardHeader>
          <CardBody className="text-xs text-[var(--color-text-muted)]">
            <dl className="grid gap-2 sm:grid-cols-3">
              <Row k="Job ID" v={<code className="font-mono text-[11px]">{job.id}</code>} />
              <Row k="Created" v={formatDateTime(job.createdAt)} />
              <Row k="Started" v={job.startedAt ? formatDateTime(job.startedAt) : "—"} />
              <Row k="Completed" v={job.completedAt ? formatDateTime(job.completedAt) : "—"} />
              <Row k="Max pages" v={String(job.maxPages)} />
              <Row k="Max depth" v={String(job.maxDepth)} />
            </dl>
            {job.errorSummary ? (
              <p className="mt-3 rounded bg-[var(--color-neutral-100)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-text)]">
                <ShieldAlert
                  aria-hidden
                  className="mr-1 inline h-3 w-3 align-[-2px] text-[color:#8c6a00]"
                />
                {job.errorSummary}
              </p>
            ) : null}
            {(job.status === "queued" || job.status === "running") ? (
              <form action={cancelIntelCrawlAction} className="mt-3">
                <input type="hidden" name="jobId" value={job.id} />
                <Button variant="secondary" size="sm" type="submit">
                  Cancel crawl
                </Button>
              </form>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="mt-1">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">{hint}</div> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-[var(--color-text-subtle)]">{k}</dt>
      <dd className="text-xs text-[var(--color-text)]">{v}</dd>
    </div>
  );
}

function StatusBadge({
  status,
  note,
}: {
  status: "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  note?: string;
}) {
  if (status === "completed") return <Badge variant="success">Completed</Badge>;
  if (status === "partial")
    return (
      <Badge variant="warning" title={note}>
        Partial
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="danger" title={note}>
        Failed
      </Badge>
    );
  if (status === "running") return <Badge variant="info">Running</Badge>;
  if (status === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
  return <Badge variant="muted">Queued</Badge>;
}

function PageStatus({ status, reason }: { status: string; reason?: string }) {
  if (status === "fetched")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[color:#1d6a3a]">
        <CheckCircle2 aria-hidden className="h-3 w-3" />
        Fetched
      </span>
    );
  if (status === "blocked")
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-[color:#8c6a00]"
        title={reason}
      >
        <ShieldAlert aria-hidden className="h-3 w-3" />
        Blocked
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[color:#a3221c]" title={reason}>
        <XCircle aria-hidden className="h-3 w-3" />
        Failed
      </span>
    );
  if (status === "skipped")
    return <span className="text-xs text-[var(--color-text-subtle)]">Skipped</span>;
  return <span className="text-xs text-[var(--color-text-subtle)]">{status}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: "low" | "medium" | "high" }) {
  if (confidence === "high") return <Badge variant="success">High</Badge>;
  if (confidence === "medium") return <Badge variant="info">Medium</Badge>;
  return <Badge variant="muted">Low</Badge>;
}

function SeverityBadge({ severity }: { severity: "info" | "low" | "medium" | "high" }) {
  if (severity === "high") return <Badge variant="danger">High</Badge>;
  if (severity === "medium") return <Badge variant="warning">Medium</Badge>;
  if (severity === "low") return <Badge variant="info">Low</Badge>;
  return <Badge variant="muted">Info</Badge>;
}
