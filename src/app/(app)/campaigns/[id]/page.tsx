import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Megaphone, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  pageCampaignMetrics,
  pageGetCampaign,
  pageListLeadsByCampaign,
} from "@/lib/data";
import {
  CAMPAIGN_STATUS_LABEL,
  STAGE_LABEL,
  SCORE_BAND_LABEL,
  formatRelative,
  scoreBandClass,
  stageDotClass,
} from "@/lib/demo/format";

type RouteParams = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await pageGetCampaign(id);
  return { title: c ? c.name : "Campaign not found" };
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = await params;
  const campaign = await pageGetCampaign(id);
  if (!campaign) notFound();

  const [leads, m] = await Promise.all([
    pageListLeadsByCampaign(id),
    pageCampaignMetrics(id),
  ]);

  return (
    <>
      <div className="mb-2">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft aria-hidden className="h-3 w-3" />
          Back to Campaigns
        </Link>
      </div>

      <PageHeader
        kicker={campaign.niche}
        title={campaign.name}
        description={campaign.offer}
        actions={
          <>
            <Badge
              variant={
                campaign.status === "active"
                  ? "success"
                  : campaign.status === "paused"
                    ? "warning"
                    : "muted"
              }
              className="h-7 px-2.5"
            >
              {CAMPAIGN_STATUS_LABEL[campaign.status]}
            </Badge>
            <Button variant="secondary" size="sm">
              Edit campaign
            </Button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Leads" value={m.discovered} />
        <StatTile label="Qualified" value={m.qualified} tone="success" />
        <StatTile label="Drafts" value={m.draftsPrepared} />
        <StatTile label="Contacted" value={m.contacted} />
        <StatTile label="Replies" value={m.replies} />
        <StatTile label="Wins" value={m.wins} tone="accent" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Audience & offer</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-xs">
            <Row label="Target customer">
              <p className="text-[var(--color-text)]">
                {campaign.idealCustomerDescription}
              </p>
            </Row>
            <Row label="Value proposition">
              <p className="text-[var(--color-text)]">
                {campaign.valueProposition}
              </p>
            </Row>
            <Row label="Minimum score to qualify">
              <span className="text-[var(--color-text)]">
                {campaign.minimumScore} / 100
              </span>
            </Row>
            <Row label="Geography">
              <span className="text-[var(--color-text)]">
                {[campaign.geography.city, campaign.geography.region, campaign.geography.country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </Row>
            {campaign.caseStudyUrl ? (
              <Row label="Case study">
                <a
                  href={campaign.caseStudyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--color-accent-700)] hover:underline"
                >
                  {campaign.caseStudyUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink aria-hidden className="h-3 w-3" />
                </a>
              </Row>
            ) : null}
            {campaign.notes ? (
              <Row label="Notes">
                <p className="text-[var(--color-text-muted)]">{campaign.notes}</p>
              </Row>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-xs text-[var(--color-text-muted)]">
            <div className="flex items-center justify-between">
              <span>Created</span>
              <span className="text-[var(--color-text)]">
                {formatRelative(campaign.createdAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last updated</span>
              <span className="text-[var(--color-text)]">
                {formatRelative(campaign.updatedAt)}
              </span>
            </div>
            <p className="pt-2 text-[11px] text-[var(--color-text-subtle)]">
              {campaign.status === "active" ? (
                <>Active campaigns surface in Overview and in the dashboard funnel.</>
              ) : campaign.status === "paused" ? (
                <>Paused campaigns stop appearing in Overview but keep their lead associations.</>
              ) : campaign.status === "draft" ? (
                <>Draft campaigns are not shown to the dashboard. Move to Active when ready.</>
              ) : (
                <>Completed campaigns archive to Reports.</>
              )}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* --- Associated leads ----------------------------------------- */}
      <div className="mt-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Associated leads</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {leads.length} {leads.length === 1 ? "lead" : "leads"} in this campaign.
              </p>
            </div>
            <ButtonLink
              href={`/leads?campaignId=${campaign.id}`}
              variant="secondary"
              size="sm"
            >
              <Users aria-hidden className="h-3.5 w-3.5" />
              View in Leads
            </ButtonLink>
          </CardHeader>
          <CardBody className="p-0">
            {leads.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[var(--color-text-subtle)]">
                No leads associated with this campaign yet.
              </div>
            ) : (
              <Table className="border-0">
                <THead>
                  <TR>
                    <TH>Business</TH>
                    <TH>City</TH>
                    <TH>Score</TH>
                    <TH>Stage</TH>
                    <TH>Updated</TH>
                  </TR>
                </THead>
                <TBody>
                  {leads.slice(0, 15).map((lead) => (
                    <TR key={lead.id}>
                      <TD>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium text-[var(--color-text)] hover:text-[var(--color-accent-700)] hover:underline"
                        >
                          {lead.businessName}
                        </Link>
                      </TD>
                      <TD className="text-xs text-[var(--color-text-muted)]">
                        {lead.city}
                      </TD>
                      <TD>
                        {lead.score ? (
                          <span
                            className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium ${scoreBandClass(lead.score.band)}`}
                            title={SCORE_BAND_LABEL[lead.score.band]}
                          >
                            {lead.score.band === "insufficient_evidence"
                              ? "Insufficient"
                              : lead.score.total}
                          </span>
                        ) : (
                          <span className="text-xs italic text-[var(--color-text-subtle)]">
                            not scored
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                          <span className={`h-1.5 w-1.5 rounded-full ${stageDotClass(lead.pipelineStage)}`} />
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
          </CardBody>
        </Card>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--color-text-subtle)]">
          <Megaphone aria-hidden className="h-3 w-3" />
          Phase 1 associates leads loosely via niche. Phase 3 adds explicit
          campaign-to-lead junction records.
        </p>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
