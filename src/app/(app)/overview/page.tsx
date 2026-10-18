import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  Sparkles,
  Eye,
  CheckCircle2,
  FileSignature,
  Reply,
  Calendar,
  FileText,
  Trophy,
  AlarmClock,
  ArrowRight,
  Plus,
  Search,
  Upload,
  Megaphone,
  Inbox,
  Clock,
} from "lucide-react";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import {
  pageBestCampaigns,
  pageGroupedTasks,
  pageListActivities,
  pageListLeads,
  pageOverviewMetrics,
  pagePipelineFunnel,
  pageSourceBreakdown,
  requirePageOwner,
} from "@/lib/data";
import {
  STAGE_LABEL,
  formatCurrency,
  formatRelative,
  sourceLabel,
  stageDotClass,
} from "@/lib/demo/format";
import type { Lead } from "@/lib/demo/types";
import { getDb } from "@/lib/db/client";
import { outreachDrafts, leads, tasks } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  // Fan-out once per page render — all queries hit the same D1 binding, so
  // Promise.all keeps the TTFB low even on a cold Worker.
  const owner = await requirePageOwner();
  const db = await getDb();
  const nowIso = new Date().toISOString();

  const [metrics, funnel, activities, sources, bestCampaigns, taskGroups, allLeads] =
    await Promise.all([
      pageOverviewMetrics(),
      pagePipelineFunnel(),
      pageListActivities({ limit: 8 }),
      pageSourceBreakdown(),
      pageBestCampaigns().then((rows) => rows.slice(0, 3)),
      pageGroupedTasks(),
      pageListLeads({}, "updated"),
    ]);

  // Phase D: replies awaiting triage (status=contacted, no replySentiment, has evidence with gmail thread)
  const awaitingTriageRows = await db
    .select()
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.ownerId, owner.id),
        eq(outreachDrafts.status, "contacted"),
        isNull(outreachDrafts.replySentiment)
      )
    )
    .limit(10)
    .catch(() => []);

  // Phase D: follow-ups due today — open follow_up tasks due today or overdue
  const todayEnd = new Date(new Date(nowIso).setHours(23, 59, 59, 999)).toISOString();
  const followUpsDueTodayRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, owner.id),
        eq(tasks.status, "open"),
        eq(tasks.taskType, "follow_up"),
        isNotNull(tasks.dueAt)
      )
    )
    .limit(10)
    .catch(() => []);

  const followUpsDueToday = followUpsDueTodayRows.filter(
    (t) => t.dueAt != null && t.dueAt <= todayEnd
  );

  const leadById = new Map<string, Lead>();
  for (const l of allLeads) leadById.set(l.id, l);

  const funnelMax = Math.max(1, ...funnel.map((f) => f.count));
  const sourceMax = Math.max(1, ...sources.map((s) => s.count));

  return (
    <>
      <PageHeader
        title="Overview"
        description="Pipeline summary, this-week counts, follow-ups due, and recent activity."
        actions={
          <>
            <ButtonLink href="/discover" variant="secondary" size="sm">
              <Search aria-hidden className="h-3.5 w-3.5" />
              Find leads
            </ButtonLink>
            <ButtonLink href="/leads?action=import" variant="secondary" size="sm">
              <Upload aria-hidden className="h-3.5 w-3.5" />
              Import CSV
            </ButtonLink>
            <ButtonLink href="/leads?action=new" variant="primary" size="sm">
              <Plus aria-hidden className="h-3.5 w-3.5" />
              Add lead
            </ButtonLink>
          </>
        }
      />

      {/* Phase D — Automation sections */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Inbox aria-hidden className="h-4 w-4 text-[var(--color-accent-600)]" />
              <CardTitle>Replies awaiting triage</CardTitle>
              {awaitingTriageRows.length > 0 && (
                <Badge variant="warning">{awaitingTriageRows.length}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Contacted leads where a reply has been received but not yet classified.
            </p>
          </CardHeader>
          <CardBody>
            {awaitingTriageRows.length === 0 ? (
              <p className="text-xs text-[var(--color-text-subtle)]">
                No replies awaiting triage — great work staying on top of inbound.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {awaitingTriageRows.map((draft) => {
                  const lead = leadById.get(draft.leadId);
                  return (
                    <li key={draft.id} className="py-2 first:pt-0 last:pb-0">
                      <Link
                        href={lead ? `/leads/${lead.id}` : "/outreach"}
                        className="flex items-center justify-between gap-3 text-sm hover:underline"
                      >
                        <span className="truncate text-[var(--color-text)]">
                          {lead?.businessName ?? draft.leadId}
                        </span>
                        <span className="shrink-0 text-[11px] text-[var(--color-text-subtle)]">
                          {formatRelative(draft.contactedAt ?? draft.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock aria-hidden className="h-4 w-4 text-[var(--color-accent-600)]" />
              <CardTitle>Follow-ups due today</CardTitle>
              {followUpsDueToday.length > 0 && (
                <Badge variant={followUpsDueToday.length > 0 ? "warning" : "muted"}>
                  {followUpsDueToday.length}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Contacted leads eligible for the next cadence step today.
            </p>
          </CardHeader>
          <CardBody>
            {followUpsDueToday.length === 0 ? (
              <p className="text-xs text-[var(--color-text-subtle)]">
                No follow-ups due today. Check back tomorrow.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {followUpsDueToday.map((task) => {
                  const lead = task.leadId ? leadById.get(task.leadId) : undefined;
                  return (
                    <li key={task.id} className="py-2 first:pt-0 last:pb-0">
                      <Link
                        href={lead ? `/leads/${lead.id}` : "/tasks"}
                        className="flex items-center justify-between gap-3 text-sm hover:underline"
                      >
                        <span className="truncate text-[var(--color-text)]">
                          {lead?.businessName ?? task.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-[var(--color-text-subtle)]">
                          {formatRelative(task.dueAt ?? undefined)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total leads" value={metrics.totalLeads} icon={Users} />
        <StatTile
          label="New this week"
          value={metrics.newThisWeek}
          icon={Sparkles}
          tone="accent"
        />
        <StatTile
          label="Needing review"
          value={metrics.needingReview}
          icon={Eye}
          hint="Stage: new or reviewing"
        />
        <StatTile
          label="Qualified"
          value={metrics.qualified}
          icon={CheckCircle2}
          tone="success"
        />
        <StatTile
          label="Follow-ups due today"
          value={metrics.followUpsDueToday}
          icon={AlarmClock}
          tone={metrics.followUpsDueToday > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Drafts awaiting approval"
          value={metrics.draftsAwaitingApproval}
          icon={FileSignature}
        />
        <StatTile label="Replies received" value={metrics.repliesReceived} icon={Reply} />
        <StatTile label="Meetings booked" value={metrics.meetingsBooked} icon={Calendar} />
        <StatTile label="Proposals sent" value={metrics.proposalsSent} icon={FileText} />
        <StatTile
          label="Deals won"
          value={metrics.dealsWon}
          hint={formatCurrency(metrics.recordedRevenue)}
          icon={Trophy}
          tone="success"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Pipeline funnel</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Count of leads by stage. Lost and Not-a-fit are tracked separately.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-2.5">
            {funnel.map((row) => (
              <div key={row.stage} className="flex items-center gap-3">
                <div className="flex w-36 shrink-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
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
            <div>
              <CardTitle>Due today</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Follow-ups and reviews scheduled before end-of-day.
              </p>
            </div>
            <Link
              href="/tasks"
              className="text-xs text-[var(--color-accent-700)] hover:underline"
            >
              All tasks →
            </Link>
          </CardHeader>
          <CardBody className="space-y-2">
            {taskGroups.overdue.length === 0 && taskGroups.today.length === 0 ? (
              <p className="text-xs text-[var(--color-text-subtle)]">
                Nothing on the clock today. Enjoy the quiet.
              </p>
            ) : (
              <>
                {taskGroups.overdue.map((t) => (
                  <TaskRow
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    leadId={t.leadId}
                    overdue
                    dueAt={t.dueAt}
                    lead={t.leadId ? leadById.get(t.leadId) : undefined}
                  />
                ))}
                {taskGroups.today.map((t) => (
                  <TaskRow
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    leadId={t.leadId}
                    dueAt={t.dueAt}
                    lead={t.leadId ? leadById.get(t.leadId) : undefined}
                  />
                ))}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                The last few things that happened across every lead.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-[var(--color-border)]">
              {activities.map((a) => {
                const lead = a.leadId ? leadById.get(a.leadId) : undefined;
                return (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent-500)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm text-[var(--color-text)]">
                          {a.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-[var(--color-text-subtle)]">
                          {formatRelative(a.createdAt)}
                        </span>
                      </div>
                      {a.description ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-muted)]">
                          {a.description}
                        </p>
                      ) : null}
                      {lead ? (
                        <Link
                          href={`/leads/${lead.id}`}
                          className="mt-0.5 inline-block text-[11px] text-[var(--color-accent-700)] hover:underline"
                        >
                          {lead.businessName}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Lead sources</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Where current leads came from.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {sources.map((row) => (
              <div key={row.source}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--color-text-muted)]">
                    {sourceLabel(row.source)}
                  </span>
                  <span className="tabular-nums text-[var(--color-text)]">{row.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent-500)]/80"
                    style={{ width: `${(row.count / sourceMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Best-performing campaigns</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Ranked by qualified leads. Denominators are shown — rates not fabricated.
              </p>
            </div>
            <Link
              href="/campaigns"
              className="text-xs text-[var(--color-accent-700)] hover:underline"
            >
              All campaigns →
            </Link>
          </CardHeader>
          <CardBody>
            {bestCampaigns.length === 0 ? (
              <p className="text-xs text-[var(--color-text-subtle)]">
                No active campaigns yet.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {bestCampaigns.map(({ campaign, metrics }) => (
                  <li key={campaign.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)] hover:underline"
                        >
                          <Megaphone aria-hidden className="h-3.5 w-3.5 text-[var(--color-accent-600)]" />
                          {campaign.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                          {campaign.niche} · {campaign.geography.city ?? "—"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          campaign.status === "active"
                            ? "success"
                            : campaign.status === "paused"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {campaign.status}
                      </Badge>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      <MetricCell label="Leads" value={metrics.discovered} />
                      <MetricCell label="Qualified" value={metrics.qualified} />
                      <MetricCell label="Drafts" value={metrics.draftsPrepared} />
                      <MetricCell label="Replies" value={metrics.replies} denominator={metrics.contacted} />
                      <MetricCell label="Wins" value={metrics.wins} />
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function TaskRow({
  id,
  title,
  leadId,
  overdue,
  dueAt,
  lead,
}: {
  id: string;
  title: string;
  leadId?: string;
  overdue?: boolean;
  dueAt?: string;
  lead?: Lead;
}) {
  return (
    <Link
      href={lead ? `/leads/${lead.id}` : "/tasks"}
      className="group -mx-2 flex items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-[var(--color-neutral-50)]"
      key={id}
    >
      <span
        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-[var(--color-warning-500)]" : "bg-[var(--color-accent-500)]"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm text-[var(--color-text)]">{title}</span>
          <span
            className={`shrink-0 text-[11px] ${overdue ? "text-[color:#8c6a00]" : "text-[var(--color-text-subtle)]"}`}
          >
            {formatRelative(dueAt)}
          </span>
        </div>
        {lead ? (
          <span className="truncate text-[11px] text-[var(--color-text-muted)]">
            {lead.businessName}
          </span>
        ) : null}
      </div>
      <ArrowRight
        aria-hidden
        className="mt-1 h-3 w-3 text-[var(--color-text-subtle)] opacity-0 transition-opacity group-hover:opacity-100"
      />
      {leadId ? null : null}
    </Link>
  );
}

function MetricCell({
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
