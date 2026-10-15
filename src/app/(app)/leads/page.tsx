import type { Metadata } from "next";
import Link from "next/link";
import { Search, Upload, Plus, Download, Filter, ArrowUpDown, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  pageDistinctCities,
  pageDistinctNiches,
  pageListLeads,
  type LeadFilter,
  type LeadSortKey,
} from "@/lib/data";
import {
  SCORE_BAND_LABEL,
  STAGE_LABEL,
  WEBSITE_CONDITION_LABEL,
  formatRelative,
  scoreBandClass,
  sourceLabel,
  stageDotClass,
} from "@/lib/demo/format";
import type {
  PipelineStage,
  WebsiteCondition,
} from "@/lib/demo/types";

export const metadata: Metadata = { title: "Leads" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const stageOptions: PipelineStage[] = [
  "new",
  "reviewing",
  "qualified",
  "contacted",
  "replied",
  "meeting_booked",
  "proposal_sent",
  "won",
  "lost",
  "not_a_fit",
];

const conditionOptions: WebsiteCondition[] = [
  "no_website",
  "inaccessible",
  "outdated",
  "weak",
  "acceptable",
  "strong",
  "unknown",
];

const sortOptions: Array<{ key: LeadSortKey; label: string }> = [
  { key: "score", label: "Score (highest first)" },
  { key: "updated", label: "Last updated" },
  { key: "created", label: "Date added" },
  { key: "name", label: "Business name" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const toStr = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const filter: LeadFilter = {
    q: toStr(params.q),
    niche: toStr(params.niche),
    city: toStr(params.city),
    stage: toStr(params.stage) as PipelineStage | undefined,
    condition: toStr(params.condition) as WebsiteCondition | undefined,
    source: toStr(params.source),
  };
  const sort = (toStr(params.sort) as LeadSortKey) ?? "score";

  const [leads, niches, cities] = await Promise.all([
    pageListLeads(filter, sort),
    pageDistinctNiches(),
    pageDistinctCities(),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every business in the pipeline. Filters are URL-driven — bookmark a view and come back to it."
        actions={
          <>
            <a
              href={`/api/leads/export${new URLSearchParams(
                Object.entries(filter).filter(([, v]) => v != null && v !== "") as [string, string][]
              ).toString() ? `?${new URLSearchParams(
                Object.entries(filter).filter(([, v]) => v != null && v !== "") as [string, string][]
              ).toString()}` : ""}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]"
            >
              <Download aria-hidden className="h-3.5 w-3.5" />
              Export CSV
            </a>
            <ButtonLink href="/leads/import" variant="secondary" size="sm">
              <Upload aria-hidden className="h-3.5 w-3.5" />
              Import CSV
            </ButtonLink>
            <ButtonLink href="/leads/new" variant="primary" size="sm">
              <Plus aria-hidden className="h-3.5 w-3.5" />
              Add lead
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-4">
        <form className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-7">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-subtle)]"
            />
            <Input
              type="search"
              name="q"
              defaultValue={filter.q ?? ""}
              placeholder="Search business, city, website…"
              className="pl-7"
            />
          </div>

          <Select name="niche" defaultValue={filter.niche ?? ""}>
            <option value="">All niches</option>
            {niches.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>

          <Select name="city" defaultValue={filter.city ?? ""}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select name="stage" defaultValue={filter.stage ?? ""}>
            <option value="">All stages</option>
            {stageOptions.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </Select>

          <Select name="condition" defaultValue={filter.condition ?? ""}>
            <option value="">All conditions</option>
            {conditionOptions.map((c) => (
              <option key={c} value={c}>
                {WEBSITE_CONDITION_LABEL[c]}
              </option>
            ))}
          </Select>

          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-sm bg-[var(--color-accent-600)] px-3 text-xs font-medium text-white hover:bg-[var(--color-accent-700)]"
            >
              <Filter aria-hidden className="h-3.5 w-3.5" />
              Apply
            </button>
            <Link
              href="/leads"
              className="inline-flex h-8 items-center justify-center rounded-sm border border-[var(--color-border-strong)] px-2.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)]"
            >
              Clear
            </Link>
          </div>
        </form>
      </Card>

      {/* --- Sort control + count ---------------------------------------- */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text)]">
            {leads.length}
          </span>{" "}
          {leads.length === 1 ? "lead" : "leads"} match current filters.
        </p>
        <form className="flex items-center gap-2">
          {/* Preserve filter params on sort change */}
          {Object.entries(filter).map(([k, v]) =>
            v ? <input key={k} type="hidden" name={k} value={v} /> : null
          )}
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <ArrowUpDown aria-hidden className="h-3 w-3" />
            Sort
          </label>
          <Select name="sort" defaultValue={sort} className="h-7 text-xs">
            {sortOptions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            className="inline-flex h-7 items-center justify-center rounded-sm border border-[var(--color-border-strong)] px-2.5 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)]"
          >
            Apply
          </button>
        </form>
      </div>

      {/* --- Table ------------------------------------------------------- */}
      {leads.length === 0 ? (
        <EmptyState
          icon={<Search className="h-4 w-4" />}
          title="No leads match these filters"
          description="Try clearing a filter, broadening the search, or importing more leads."
          actions={
            <ButtonLink href="/leads" variant="secondary" size="sm">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-[26%]">Business</TH>
              <TH>Niche</TH>
              <TH>Location</TH>
              <TH>Website</TH>
              <TH className="w-[110px]">Score</TH>
              <TH>Condition</TH>
              <TH>Source</TH>
              <TH>Stage</TH>
              <TH className="whitespace-nowrap">Updated</TH>
            </TR>
          </THead>
          <TBody>
            {leads.map((lead) => (
              <TR key={lead.id}>
                <TD>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-medium text-[var(--color-text)] hover:text-[var(--color-accent-700)] hover:underline"
                  >
                    {lead.businessName}
                  </Link>
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                    {lead.publicEmail ?? lead.publicPhone ?? "—"}
                  </div>
                </TD>
                <TD className="text-xs text-[var(--color-text-muted)]">
                  {lead.niche}
                </TD>
                <TD className="text-xs text-[var(--color-text-muted)]">
                  {lead.city}
                </TD>
                <TD className="text-xs">
                  {lead.websiteUrl ? (
                    <a
                      href={lead.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-700)] hover:underline"
                    >
                      {lead.normalizedDomain ?? lead.websiteUrl}
                      <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-[var(--color-text-subtle)] italic">
                      no site
                    </span>
                  )}
                </TD>
                <TD>
                  {lead.score ? (
                    <span
                      className={`inline-flex items-baseline gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium ${scoreBandClass(lead.score.band)}`}
                      title={SCORE_BAND_LABEL[lead.score.band]}
                    >
                      {lead.score.band === "insufficient_evidence" ? (
                        <span>Insufficient</span>
                      ) : (
                        <>
                          <span className="font-semibold tabular-nums">
                            {lead.score.total}
                          </span>
                          <span className="text-[10px] opacity-70">
                            / 100
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-text-subtle)] italic">
                      not scored
                    </span>
                  )}
                </TD>
                <TD>
                  <Badge variant="outline">
                    {WEBSITE_CONDITION_LABEL[lead.websiteCondition]}
                  </Badge>
                </TD>
                <TD className="text-xs text-[var(--color-text-muted)]">
                  {sourceLabel(lead.sourceName)}
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${stageDotClass(lead.pipelineStage)}`}
                    />
                    {STAGE_LABEL[lead.pipelineStage]}
                  </span>
                </TD>
                <TD className="whitespace-nowrap text-xs text-[var(--color-text-subtle)]">
                  {formatRelative(lead.updatedAt)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <p className="mt-3 text-[11px] text-[var(--color-text-subtle)]">
        Export respects your current filters. Multi-select bulk operations
        land in a later phase.
      </p>
    </>
  );
}
