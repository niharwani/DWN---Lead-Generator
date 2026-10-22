import type { Metadata } from "next";
import Link from "next/link";
import {
  Globe,
  Search,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { pageListCampaigns, pageListCrawlJobs } from "@/lib/data";
import { runIntelCrawlAction } from "@/lib/actions";
import { formatRelative } from "@/lib/demo/format";

export const metadata: Metadata = { title: "Web Intelligence" };

export default async function WebIntelligencePage() {
  const [jobs, campaigns] = await Promise.all([
    pageListCrawlJobs(25),
    pageListCampaigns(),
  ]);

  return (
    <>
      <PageHeader
        title="Web Intelligence"
        description="Paste a company URL and the crawler visits public corporate pages — About, Team, Contact, Services, Products — then extracts intel into the lead database. SSRF-hardened, deduped by canonical domain, and additive — never overwrites verified lead data."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>New crawl</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Paste a company URL. The crawler visits public corporate pages
                (About, Team, Contact, Services, Products…) under a strict page / depth / byte budget.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <form action={runIntelCrawlAction} className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Seed URL"
                hint="A single company homepage. Internal / private / localhost addresses are rejected."
                className="sm:col-span-2"
              >
                <Input
                  name="seedUrl"
                  placeholder="example.com or https://example.com"
                  required
                />
              </Field>

              <Field label="Company name (optional override)">
                <Input name="seedLabel" placeholder="e.g. Zaveri Bazaar Jewels" />
              </Field>

              <Field label="Campaign (optional)">
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
                <Input name="niche" defaultValue="Jewellery & luxury" />
              </Field>

              <Field label="City">
                <Input name="city" defaultValue="Mumbai" />
              </Field>

              <Field label="Region (state)">
                <Input name="region" placeholder="Maharashtra" />
              </Field>

              <Field label="Country">
                <Input name="country" defaultValue="India" />
              </Field>

              <Field label="Max pages (1–50)">
                <Input
                  name="maxPages"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={15}
                />
              </Field>

              <Field label="Max depth (0–3)">
                <Input
                  name="maxDepth"
                  type="number"
                  min={0}
                  max={3}
                  defaultValue={2}
                />
              </Field>

              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="text-[11px] text-[var(--color-text-subtle)]">
                  The crawl runs inline. Expect ~5–30s for a typical site. Progress persists per page.
                </p>
                <Button variant="primary" size="sm" type="submit">
                  <Search aria-hidden className="h-3.5 w-3.5" />
                  Discover & crawl
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Providers</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <ProviderStatus
                name="Web crawler"
                status="ready"
                description="SSRF-hardened fetch · bounded (byte cap, timeout, max redirects) · reuses the website audit engine."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Policy</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-[11px] text-[var(--color-text-muted)]">
              <p>
                <ShieldAlert
                  aria-hidden
                  className="mr-1 inline h-3 w-3 align-[-2px] text-[color:#8c6a00]"
                />
                No Google Search HTML scraping. No LinkedIn scraping. No bypass of CAPTCHAs, auth, or
                anti-bot systems.
              </p>
              <p>
                Only public corporate pages are fetched. People found on those pages are stored with
                the source URL and confidence level. Nothing is guessed — missing fields stay blank.
              </p>
              <p>
                Discovered companies are merged into the existing Leads database by canonical domain.
                User-verified fields are never overwritten.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Recent crawl jobs */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent crawls</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {jobs.length === 0 ? (
              <div className="px-4 py-6 text-xs text-[var(--color-text-muted)]">
                No crawls yet. Start by pasting a seed URL above.
              </div>
            ) : (
              <Table className="border-0">
                <THead>
                  <TR>
                    <TH>Seed</TH>
                    <TH>Status</TH>
                    <TH>Pages</TH>
                    <TH>People</TH>
                    <TH>Findings</TH>
                    <TH>Started</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {jobs.map((job) => (
                    <TR key={job.id}>
                      <TD className="max-w-sm truncate text-xs">
                        <div className="flex items-center gap-2">
                          <Globe
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)]"
                          />
                          <span className="truncate font-medium">
                            {job.seedLabel ?? job.seedUrl}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-[var(--color-text-subtle)]">
                          {job.seedUrl}
                        </div>
                      </TD>
                      <TD>
                        <JobStatus status={job.status} note={job.errorSummary ?? undefined} />
                      </TD>
                      <TD className="text-xs tabular-nums">
                        {job.pagesFetched}
                        {job.pagesFailed > 0 ? (
                          <span className="ml-1 text-[var(--color-text-subtle)]">
                            / {job.pagesFailed} fail
                          </span>
                        ) : null}
                      </TD>
                      <TD className="text-xs tabular-nums">{job.peopleFound}</TD>
                      <TD className="text-xs tabular-nums">{job.findingsCount}</TD>
                      <TD className="text-xs text-[var(--color-text-subtle)]">
                        {formatRelative(job.startedAt ?? job.createdAt)}
                      </TD>
                      <TD>
                        <Link
                          href={`/intelligence/${job.id}`}
                          className="text-xs text-[var(--color-accent-700)] hover:underline"
                        >
                          View →
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function ProviderStatus({
  name,
  status,
  description,
}: {
  name: string;
  status: "ready" | "needs-key" | "disabled";
  description: string;
}) {
  const badge =
    status === "ready" ? (
      <Badge variant="success">
        <CheckCircle2 aria-hidden className="h-3 w-3" />
        Ready
      </Badge>
    ) : status === "disabled" ? (
      <Badge variant="muted">Disabled</Badge>
    ) : (
      <Badge variant="warning">
        <AlertTriangle aria-hidden className="h-3 w-3" />
        Needs key
      </Badge>
    );
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-[var(--color-text)]">{name}</span>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{description}</p>
      </div>
      {badge}
    </div>
  );
}

function JobStatus({
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

// Silence unused warning — kept available for future "View on web" buttons.
void ExternalLink;
