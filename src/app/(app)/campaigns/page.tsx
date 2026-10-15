import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { pageCampaignMetrics, pageListCampaigns } from "@/lib/data";
import { CAMPAIGN_STATUS_LABEL, formatRelative } from "@/lib/demo/format";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const campaigns = await pageListCampaigns();
  const metricsByCampaign = new Map(
    await Promise.all(
      campaigns.map(
        async (c) => [c.id, await pageCampaignMetrics(c.id)] as const
      )
    )
  );

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="A campaign scopes an audience and offer — not an automated mass-message run. Every metric here is counted off persisted records."
        actions={
          <ButtonLink href="/campaigns/new" variant="primary" size="sm">
            <Plus aria-hidden className="h-3.5 w-3.5" />
            New campaign
          </ButtonLink>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-4 w-4" />}
          title="No campaigns yet"
          description="Define an audience, offer, and value proposition. Campaigns group related leads and let you compare conversion over time."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map((c) => {
            const m = metricsByCampaign.get(c.id) ?? {
              discovered: 0,
              qualified: 0,
              draftsPrepared: 0,
              contacted: 0,
              replies: 0,
              meetings: 0,
              wins: 0,
            };
            return (
              <Card key={c.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] hover:underline"
                    >
                      <Megaphone aria-hidden className="h-4 w-4 text-[var(--color-accent-600)]" />
                      {c.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {c.niche}
                      {c.geography.city ? ` · ${c.geography.city}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      c.status === "active"
                        ? "success"
                        : c.status === "paused"
                          ? "warning"
                          : c.status === "draft"
                            ? "muted"
                            : "default"
                    }
                  >
                    {CAMPAIGN_STATUS_LABEL[c.status]}
                  </Badge>
                </CardHeader>
                <CardBody>
                  <p className="text-xs text-[var(--color-text-muted)]">{c.offer}</p>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
                    <Metric label="Leads" value={m.discovered} />
                    <Metric label="Qualified" value={m.qualified} />
                    <Metric
                      label="Replies"
                      value={m.replies}
                      denominator={m.contacted}
                    />
                    <Metric label="Wins" value={m.wins} />
                  </dl>
                </CardBody>
                <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-text-subtle)]">
                  <span>Updated {formatRelative(c.updatedAt)}</span>
                  <div className="flex gap-1.5">
                    <ButtonLink
                      href={`/leads?campaignId=${c.id}`}
                      variant="ghost"
                      size="sm"
                    >
                      <Users aria-hidden className="h-3 w-3" />
                      Leads
                    </ButtonLink>
                    <ButtonLink
                      href={`/campaigns/${c.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      Open
                    </ButtonLink>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6 border-dashed">
        <CardBody className="flex items-start gap-3">
          <Target aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-600)]" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              Metric denominators are explicit
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              The <strong>Replies</strong> column shows{" "}
              <em>replies / contacted</em> only. When nothing has been contacted,
              the denominator stays at zero and no response rate is fabricated
              (spec §7.5).
            </p>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function Metric({
  label,
  value,
  denominator,
}: {
  label: string;
  value: number;
  denominator?: number;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-[var(--color-text)]">
        {value}
        {typeof denominator === "number" && denominator > 0 ? (
          <span className="ml-1 text-[11px] font-normal text-[var(--color-text-subtle)]">
            / {denominator}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
