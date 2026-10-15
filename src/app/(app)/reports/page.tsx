import type { Metadata } from "next";
import Link from "next/link";
import { Download, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  pageBestCampaigns,
  pageCityBreakdown,
  pageNicheBreakdown,
  pageOverviewMetrics,
  pagePipelineFunnel,
  pageScoreBandBreakdown,
  pageSourceBreakdown,
} from "@/lib/data";
import {
  SCORE_BAND_LABEL,
  STAGE_LABEL,
  formatCurrency,
  scoreBandClass,
  sourceLabel,
  stageDotClass,
} from "@/lib/demo/format";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const [funnel, sources, niches, bands, cities, campaigns, metrics] =
    await Promise.all([
      pagePipelineFunnel(),
      pageSourceBreakdown(),
      pageNicheBreakdown(),
      pageScoreBandBreakdown(),
      pageCityBreakdown(),
      pageBestCampaigns(),
      pageOverviewMetrics(),
    ]);
  const funnelMax = Math.max(1, ...funnel.map((f) => f.count));

  const nicheMax = Math.max(1, ...niches.map((n) => n.count));
  const bandMax = Math.max(1, ...bands.map((b) => b.count));
  const cityMax = Math.max(1, ...cities.map((c) => c.count));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Funnel, source, niche, and campaign-level breakdowns — counted off persisted records only."
        actions={
          <ButtonLink href="/reports?export=csv" variant="secondary" size="sm">
            <Download aria-hidden className="h-3.5 w-3.5" />
            Export CSV
          </ButtonLink>
        }
      />

      <Card className="mb-5 border-dashed">
        <CardBody className="flex items-start gap-3 text-xs text-[var(--color-text-muted)]">
          <Info
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-600)]"
          />
          <div>
            Every conversion metric explicitly shows its numerator and
            denominator. Rates with a zero denominator are not fabricated — the
            denominator stays visible instead.
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline funnel</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2.5">
            {funnel.map((row) => (
              <div key={row.stage} className="flex items-center gap-3">
                <div className="flex w-40 shrink-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <span className={`h-2 w-2 rounded-full ${stageDotClass(row.stage)}`} />
                  {STAGE_LABEL[row.stage]}
                </div>
                <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-[var(--color-neutral-100)]">
                  <div
                    className="h-full rounded-sm bg-[var(--color-accent-500)]/70"
                    style={{ width: `${(row.count / funnelMax) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-[var(--color-text-muted)]">
                  {row.count}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcomes</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <OutcomeRow label="Deals won" value={metrics.dealsWon} />
            <OutcomeRow
              label="Recorded revenue"
              value={formatCurrency(metrics.recordedRevenue)}
            />
            <OutcomeRow label="Meetings booked" value={metrics.meetingsBooked} />
            <OutcomeRow label="Proposals sent" value={metrics.proposalsSent} />
            <p className="pt-2 text-[11px] text-[var(--color-text-subtle)]">
              Revenue counts entered deal values on leads marked Won.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {bands.map((b) => (
              <div key={b.band}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${scoreBandClass(b.band)}`}
                  >
                    {SCORE_BAND_LABEL[b.band]}
                  </span>
                  <span className="tabular-nums text-[var(--color-text-muted)]">
                    {b.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent-500)]/80"
                    style={{ width: `${(b.count / bandMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Niche breakdown</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {niches.map((n) => (
              <div key={n.niche}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-[var(--color-text-muted)]">
                    {n.niche}
                  </span>
                  <span className="tabular-nums text-[var(--color-text)]">
                    {n.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent-500)]/80"
                    style={{ width: `${(n.count / nicheMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead sources</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {sources.map((s) => (
              <div
                key={s.source}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-[var(--color-text-muted)]">
                  {sourceLabel(s.source)}
                </span>
                <span className="tabular-nums font-medium text-[var(--color-text)]">
                  {s.count}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>City breakdown</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((c) => (
              <div key={c.city}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-[var(--color-text-muted)]">
                    {c.city}
                  </span>
                  <span className="tabular-nums text-[var(--color-text)]">
                    {c.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent-500)]/80"
                    style={{ width: `${(c.count / cityMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* --- Campaign comparison ----------------------------------------- */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Campaign comparison</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-neutral-50)] text-[11px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                  <tr>
                    <th className="px-4 py-2 text-left">Campaign</th>
                    <th className="px-3 py-2 text-right">Leads</th>
                    <th className="px-3 py-2 text-right">Qualified</th>
                    <th className="px-3 py-2 text-right">Drafts</th>
                    <th className="px-3 py-2 text-right">Replies / Contacted</th>
                    <th className="px-3 py-2 text-right">Wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {campaigns.map(({ campaign, metrics: m }) => (
                    <tr
                      key={campaign.id}
                      className="hover:bg-[var(--color-neutral-50)]"
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="font-medium text-[var(--color-text)] hover:text-[var(--color-accent-700)] hover:underline"
                        >
                          {campaign.name}
                        </Link>
                        <div className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                          {campaign.niche}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.discovered}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.qualified}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.draftsPrepared}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-[var(--color-text-muted)]">
                        {m.replies}
                        <span className="text-[var(--color-text-subtle)]">
                          {" / "}
                          {m.contacted}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--color-success-700)]">
                        {m.wins}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function OutcomeRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <span className="font-medium tabular-nums text-[var(--color-text)]">
        {value}
      </span>
    </div>
  );
}
