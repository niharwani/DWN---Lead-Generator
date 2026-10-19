import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  FileText,
  Flag,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/forms/action-button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  approveDraftAction,
  archiveDraftAction,
  changeLeadStageAction,
  completeTaskAction,
  createTaskAction,
  generateBriefAction,
  generateDraftAction,
  generateDraftVariantsAction,
  logReplyAction,
  markContactedAction,
  runAuditAction,
  scoreLeadAction,
  toggleDoNotContactAction,
  assignLeadAction,
  sendDraftViaGmailAction,
  sendDraftViaOutlookAction,
  insertCalcomLinkIntoDraftAction,
} from "@/lib/actions";
import { EmptyState } from "@/components/ui/empty-state";
import {
  pageGetCampaign,
  pageGetLead,
  pageLatestAudit,
  pageListActivities,
  pageListBriefs,
  pageListDrafts,
  pageListTasks,
  requirePageOwner,
} from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { listMembers } from "@/lib/db/repos/workspaces";
import { getSetting } from "@/lib/db/repos/settings";
import { profiles } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import {
  CONFIDENCE_LABEL,
  OUTREACH_CHANNEL_LABEL,
  OUTREACH_STATUS_LABEL,
  SCORE_BAND_LABEL,
  STAGE_LABEL,
  SEVERITY_LABEL,
  WEBSITE_CONDITION_LABEL,
  formatBytes,
  formatCurrency,
  formatDateTime,
  formatMs,
  formatRelative,
  scoreBandClass,
  severityClass,
  sourceLabel,
  stageDotClass,
} from "@/lib/demo/format";

type RouteParams = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const lead = await pageGetLead(id);
  return { title: lead ? lead.businessName : "Lead not found" };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = await params;
  const lead = await pageGetLead(id);
  if (!lead) notFound();

  const [audit, briefs, drafts, activities, allTasks] = await Promise.all([
    pageLatestAudit(lead.id),
    pageListBriefs(lead.id),
    pageListDrafts({ leadId: lead.id }),
    pageListActivities({ leadId: lead.id }),
    pageListTasks(),
  ]);
  const brief = briefs[0];
  const tasks = allTasks.filter((t) => t.leadId === lead.id);
  const briefCampaign = brief?.campaignId
    ? await pageGetCampaign(brief.campaignId)
    : undefined;

  // Phase F: workspace members for assignment dropdown
  const owner = await requirePageOwner();
  const db = await getDb();
  const [rawMembers, gmailTokensRaw, outlookTokensRaw] = await Promise.all([
    listMembers(db, owner.id),
    getSetting<{ accessToken?: string }>(db, owner.id, "gmail_tokens/v1"),
    getSetting<{ accessToken?: string }>(db, owner.id, "outlook_tokens/v1"),
  ]);
  const gmailConnected = !!(gmailTokensRaw?.accessToken);
  const outlookConnected = !!(outlookTokensRaw?.accessToken);

  const memberProfileIds = rawMembers.map((m) => m.profileId);
  const memberProfiles =
    memberProfileIds.length > 0
      ? await db.select().from(profiles).where(inArray(profiles.id, memberProfileIds))
      : [];
  const memberProfileMap = new Map(memberProfiles.map((p) => [p.id, p]));
  const workspaceMembers = rawMembers.map((m) => ({
    profileId: m.profileId,
    label:
      memberProfileMap.get(m.profileId)?.fullName ??
      memberProfileMap.get(m.profileId)?.email ??
      m.profileId,
  }));

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
        kicker={lead.niche}
        title={lead.businessName}
        description={`${lead.category} · ${lead.city}${lead.region ? `, ${lead.region}` : ""}`}
        actions={
          <>
            <form action={changeLeadStageAction} className="inline-flex items-center gap-1.5">
              <input type="hidden" name="leadId" value={lead.id} />
              <label className="text-[11px] text-[var(--color-text-subtle)]">Stage</label>
              <select
                name="pipelineStage"
                defaultValue={lead.pipelineStage}
                className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
              >
                {(
                  [
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
                  ] as const
                ).map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-7 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[11px] hover:bg-[var(--color-neutral-100)]"
              >
                Save
              </button>
            </form>
            {/* Assigned to — Phase F */}
            <form
              action={async (fd: FormData) => {
                "use server";
                const assignee = fd.get("assigneeProfileId");
                await assignLeadAction(
                  lead.id,
                  assignee && assignee !== "" ? String(assignee) : null
                );
              }}
              className="inline-flex items-center gap-1.5"
            >
              <label className="text-[11px] text-[var(--color-text-subtle)]">
                Assigned to
              </label>
              <select
                name="assigneeProfileId"
                defaultValue={(lead as { assignedTo?: string | null }).assignedTo ?? ""}
                className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
              >
                <option value="">Unassigned</option>
                {workspaceMembers.map((m) => (
                  <option key={m.profileId} value={m.profileId}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-7 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-[11px] hover:bg-[var(--color-neutral-100)]"
              >
                Save
              </button>
            </form>

            {lead.doNotContact.flagged ? (
              <ActionButton
                action={toggleDoNotContactAction}
                hiddenFields={{ leadId: lead.id, flagged: "0" }}
                variant="danger"
                size="sm"
                title="Clear the do-not-contact flag"
              >
                <Flag aria-hidden className="h-3 w-3" />
                Clear DNC
              </ActionButton>
            ) : (
              <ActionButton
                action={toggleDoNotContactAction}
                hiddenFields={{ leadId: lead.id, flagged: "1" }}
                variant="ghost"
                size="sm"
                title="Mark this lead as do-not-contact"
              >
                <Flag aria-hidden className="h-3 w-3" />
                Mark DNC
              </ActionButton>
            )}
          </>
        }
      />

      {/* --- Stage + stats row -------------------------------------------- */}
      <div className="mb-5 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StageCard stage={lead.pipelineStage} nextActionAt={lead.nextActionAt} />
        <ScoreCard score={lead.score} />
        <WebsiteConditionCard
          condition={lead.websiteCondition}
          websiteUrl={lead.websiteUrl}
        />
        <SourceCard
          source={lead.sourceName}
          sourceUrl={lead.sourceUrl}
          createdAt={lead.createdAt}
          lastContactedAt={lead.lastContactedAt}
          dealValue={lead.estimatedDealValue}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <WhyThisLeadSection lead={lead} />
          <WebsiteAuditSection
            audit={audit}
            leadId={lead.id}
            canAudit={Boolean(lead.websiteUrl)}
          />
          <OpportunityBriefSection
            brief={brief}
            briefCampaign={briefCampaign}
            leadId={lead.id}
          />
          <OutreachDraftsSection
            drafts={drafts}
            leadId={lead.id}
            doNotContact={lead.doNotContact.flagged}
            gmailConnected={gmailConnected}
            outlookConnected={outlookConnected}
          />
          <ActivityTimelineSection activities={activities} />
        </div>

        <div className="space-y-4">
          <BusinessProfileSection lead={lead} />
          <TasksSection tasks={tasks} leadId={lead.id} />
          <OutcomeSection lead={lead} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stage + stat tiles row
// ---------------------------------------------------------------------------

function StageCard({
  stage,
  nextActionAt,
}: {
  stage: import("@/lib/demo/types").PipelineStage;
  nextActionAt?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          Pipeline stage
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${stageDotClass(stage)}`} />
          <span className="text-base font-semibold text-[var(--color-text)]">
            {STAGE_LABEL[stage]}
          </span>
        </div>
        {nextActionAt ? (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            <Clock aria-hidden className="h-3 w-3" />
            Next action {formatRelative(nextActionAt)}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ScoreCard({ score }: { score?: import("@/lib/demo/types").ScoreBreakdown }) {
  if (!score) {
    return (
      <Card>
        <CardBody>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
            Score
          </div>
          <div className="mt-1.5 text-base font-semibold text-[var(--color-text-subtle)] italic">
            Not scored
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          Score
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-[var(--color-text)]">
            {score.band === "insufficient_evidence" ? "—" : score.total}
          </span>
          <span className="text-[11px] text-[var(--color-text-subtle)]">
            {score.band === "insufficient_evidence" ? "" : "/ 100"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${scoreBandClass(score.band)}`}
          >
            {SCORE_BAND_LABEL[score.band]}
          </span>
          <span className="text-[10px] text-[var(--color-text-subtle)]">
            {CONFIDENCE_LABEL[score.confidence]}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

function WebsiteConditionCard({
  condition,
  websiteUrl,
}: {
  condition: import("@/lib/demo/types").WebsiteCondition;
  websiteUrl?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          Website
        </div>
        <div className="mt-1.5 text-base font-semibold text-[var(--color-text)]">
          {WEBSITE_CONDITION_LABEL[condition]}
        </div>
        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--color-accent-700)] hover:underline"
          >
            {websiteUrl.replace(/^https?:\/\//, "")}
            <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        ) : (
          <div className="mt-1 text-[11px] text-[var(--color-text-subtle)] italic">
            No public site
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SourceCard({
  source,
  sourceUrl,
  createdAt,
  lastContactedAt,
  dealValue,
}: {
  source: string;
  sourceUrl?: string;
  createdAt: string;
  lastContactedAt?: string;
  dealValue?: number;
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          Source
        </div>
        <div className="mt-1.5 text-base font-semibold text-[var(--color-text)]">
          {sourceLabel(source)}
        </div>
        <dl className="mt-2 space-y-1 text-[11px] text-[var(--color-text-muted)]">
          {sourceUrl ? (
            <div className="flex items-center gap-1">
              <dt className="shrink-0">Found at</dt>
              <dd className="truncate">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent-700)] hover:underline"
                >
                  {sourceUrl.replace(/^https?:\/\//, "")}
                </a>
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <dt>Added</dt>
            <dd>{formatRelative(createdAt)}</dd>
          </div>
          {lastContactedAt ? (
            <div className="flex items-center justify-between">
              <dt>Last contacted</dt>
              <dd>{formatRelative(lastContactedAt)}</dd>
            </div>
          ) : null}
          {dealValue ? (
            <div className="flex items-center justify-between">
              <dt>Est. value</dt>
              <dd className="font-medium text-[var(--color-text)]">
                {formatCurrency(dealValue)}
              </dd>
            </div>
          ) : null}
        </dl>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Spec §7.4 sections
// ---------------------------------------------------------------------------

function BusinessProfileSection({ lead }: { lead: import("@/lib/demo/types").Lead }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2.5">
        <ProfileRow icon={Globe} label="Website">
          {lead.websiteUrl ? (
            <a
              href={lead.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-accent-700)] hover:underline"
            >
              {lead.normalizedDomain ?? lead.websiteUrl}
            </a>
          ) : (
            <span className="italic text-[var(--color-text-subtle)]">
              no public website
            </span>
          )}
        </ProfileRow>
        <ProfileRow icon={Mail} label="Email">
          {lead.publicEmail ? (
            <a
              href={`mailto:${lead.publicEmail}`}
              className="text-[var(--color-accent-700)] hover:underline"
            >
              {lead.publicEmail}
            </a>
          ) : (
            <span className="italic text-[var(--color-text-subtle)]">
              none public
            </span>
          )}
        </ProfileRow>
        <ProfileRow icon={Phone} label="Phone">
          {lead.publicPhone ? (
            <a
              href={`tel:${lead.publicPhone}`}
              className="text-[var(--color-text)] hover:underline"
            >
              {lead.publicPhone}
            </a>
          ) : (
            <span className="italic text-[var(--color-text-subtle)]">—</span>
          )}
        </ProfileRow>
        <ProfileRow icon={MapPin} label="Address">
          <span className="text-[var(--color-text-muted)]">
            {[lead.address, lead.city, lead.region, lead.country]
              .filter(Boolean)
              .join(", ")}
          </span>
        </ProfileRow>
        {lead.tags.length > 0 ? (
          <div className="pt-2">
            <div className="mb-1.5 text-[11px] text-[var(--color-text-subtle)]">
              Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {lead.tags.map((t) => (
                <Badge key={t} variant="default">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  children,
}: {
  icon: import("lucide-react").LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <Icon
        aria-hidden
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)]"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          {label}
        </div>
        <div className="mt-0.5 break-words text-[var(--color-text)]">
          {children}
        </div>
      </div>
    </div>
  );
}

function WhyThisLeadSection({ lead }: { lead: import("@/lib/demo/types").Lead }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Why this lead</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Every factor shows its evidence. Edit weights in Settings.
          </p>
          {lead.score ? (
            <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
              {lead.score.version} · {formatRelative(lead.score.computedAt)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {lead.score ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${scoreBandClass(lead.score.band)}`}
            >
              {SCORE_BAND_LABEL[lead.score.band]}
            </span>
          ) : null}
          <ActionButton
            action={scoreLeadAction}
            hiddenFields={{ leadId: lead.id }}
            variant="secondary"
            size="sm"
            title="Recompute the lead score from the latest audit and settings."
          >
            {lead.score ? "Re-score" : "Score lead"}
          </ActionButton>
        </div>
      </CardHeader>
      <CardBody>
        {!lead.score || lead.score.band === "insufficient_evidence" ? (
          <EmptyState
            icon={<AlertTriangle className="h-4 w-4" />}
            title={lead.score?.band === "insufficient_evidence" ? "Insufficient evidence to score" : "Not scored yet"}
            description="Click 'Score lead' to compute a breakdown from the latest audit, campaign match, and service fit. Insufficient-evidence leads are flagged separately."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {lead.score.factors.map((f) => (
              <li key={f.code} className="flex items-start gap-3 py-2">
                <span
                  className={`inline-flex h-6 w-12 shrink-0 items-center justify-center rounded-sm text-xs font-medium tabular-nums ${
                    f.points > 0
                      ? "bg-[var(--color-success-100)] text-[var(--color-success-700)]"
                      : f.points < 0
                        ? "bg-[var(--color-danger-100)] text-[color:#991b1b]"
                        : "bg-[var(--color-neutral-100)] text-[var(--color-text-subtle)]"
                  }`}
                >
                  {f.points > 0 ? "+" : ""}
                  {f.points}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--color-text)]">{f.label}</div>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {f.evidence}
                    {f.evidenceUrl ? (
                      <>
                        {" · "}
                        <a
                          href={f.evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--color-accent-700)] hover:underline"
                        >
                          source
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function WebsiteAuditSection({
  audit,
  leadId,
  canAudit,
}: {
  audit?: import("@/lib/demo/types").WebsiteAudit;
  leadId: string;
  canAudit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Website audit</CardTitle>
          {audit ? (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {audit.auditVersion} · {formatDateTime(audit.startedAt)} ·{" "}
              {audit.status === "success" ? (
                <span className="text-[var(--color-success-700)]">clean fetch</span>
              ) : audit.status === "unavailable" || audit.status === "failed" ? (
                <span className="text-[color:#991b1b]">{audit.status}</span>
              ) : (
                <span className="text-[color:#8c6a00]">{audit.status}</span>
              )}
            </p>
          ) : null}
        </div>
        {canAudit ? (
          <ActionButton
            action={runAuditAction}
            hiddenFields={{ leadId }}
            variant="secondary"
            size="sm"
            title="Fetch the website again and re-run the audit checks."
          >
            {audit ? "Re-run audit" : "Run audit"}
          </ActionButton>
        ) : null}
      </CardHeader>
      <CardBody>
        {!audit ? (
          <EmptyState
            icon={<Globe className="h-4 w-4" />}
            title="No audit yet"
            description="No audit has been run for this lead yet. Trigger one to populate findings and metrics."
          />
        ) : (
          <>
            <div className="mb-3 grid gap-3 text-xs sm:grid-cols-3">
              <AuditMeta label="HTTP status" value={audit.httpStatus ?? "—"} />
              <AuditMeta
                label="Page weight"
                value={formatBytes(audit.metrics?.pageWeightBytes)}
              />
              <AuditMeta label="Server-timed load" value={formatMs(audit.metrics?.loadMs)} />
            </div>
            <p className="mb-3 text-[11px] text-[var(--color-text-subtle)]">
              Static-fetch timing only — not a Core Web Vitals measurement.
            </p>
            {audit.findings.length === 0 ? (
              <p className="text-xs text-[var(--color-text-subtle)]">
                No findings recorded.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {audit.findings.map((f) => (
                  <li
                    key={f.code}
                    className="rounded-sm border border-[var(--color-border)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-medium text-[var(--color-text)]">
                        {f.title}
                      </h4>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${severityClass(f.severity)}`}
                      >
                        {SEVERITY_LABEL[f.severity]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {f.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-subtle)]">
                      <span>
                        Evidence: {f.evidence}
                        {f.evidenceUrl ? (
                          <>
                            {" · "}
                            <a
                              href={f.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--color-accent-700)] hover:underline"
                            >
                              source
                            </a>
                          </>
                        ) : null}
                      </span>
                      <span>{CONFIDENCE_LABEL[f.confidence]}</span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-text)]">
                      <span className="font-medium">Fix:</span> {f.recommendation}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function AuditMeta({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-neutral-50)] px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm tabular-nums text-[var(--color-text)]">
        {value}
      </div>
    </div>
  );
}

function OpportunityBriefSection({
  brief,
  briefCampaign,
  leadId,
}: {
  brief?: import("@/lib/demo/types").OpportunityBrief;
  briefCampaign?: import("@/lib/demo/types").Campaign;
  leadId: string;
}) {
  if (!brief) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Opportunity brief</CardTitle>
          <ActionButton
            action={generateBriefAction}
            hiddenFields={{ leadId }}
            variant="secondary"
            size="sm"
            title="Generate a brief from the current audit + score. Uses the AI provider when configured, otherwise falls back to a deterministic template."
          >
            <FileText aria-hidden className="h-3 w-3" />
            Generate brief
          </ActionButton>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={<FileText className="h-4 w-4" />}
            title="No brief yet"
            description="Click 'Generate brief' to build a grounded summary from the current audit, score, and service offerings. Templates work without AI."
          />
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Opportunity brief</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {brief.source === "ai" ? "AI-generated" : "Template-generated"} ·{" "}
            {formatRelative(brief.createdAt)}
            {briefCampaign ? ` · ${briefCampaign.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{CONFIDENCE_LABEL[brief.confidence]}</Badge>
          <ActionButton
            action={generateBriefAction}
            hiddenFields={{ leadId }}
            variant="ghost"
            size="sm"
            title="Regenerate the template brief from the latest inputs."
          >
            Regenerate
          </ActionButton>
        </div>
      </CardHeader>
      <CardBody className="space-y-3 text-sm text-[var(--color-text)]">
        <p>{brief.summary}</p>

        <div>
          <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
            Verified observations
          </h4>
          <ul className="space-y-1.5">
            {brief.observations.map((o, i) => (
              <li key={i} className="flex gap-2 text-xs text-[var(--color-text-muted)]">
                <CheckCircle2
                  aria-hidden
                  className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-success-600)]"
                />
                <div>
                  <span className="text-[var(--color-text)]">{o.observation}</span>
                  <span className="ml-1 text-[var(--color-text-subtle)]">
                    — {o.evidence}
                    {o.evidenceUrl ? (
                      <>
                        {" · "}
                        <a
                          href={o.evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--color-accent-700)] hover:underline"
                        >
                          source
                        </a>
                      </>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <BriefCell label="Possible opportunity" value={brief.possibleOpportunity} />
          <BriefCell label="Suggested deliverable" value={brief.suggestedDeliverable} />
        </div>

        <BriefCell label="Recommended service" value={brief.recommendedService} />

        {brief.unknowns.length > 0 ? (
          <div>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
              Open questions
            </h4>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-[var(--color-text-muted)]">
              {brief.unknowns.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function BriefCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-neutral-50)] px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="mt-0.5 text-xs text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function OutreachDraftsSection({
  drafts,
  leadId,
  doNotContact,
  gmailConnected,
  outlookConnected,
}: {
  drafts: import("@/lib/demo/types").OutreachDraft[];
  leadId: string;
  doNotContact: boolean;
  gmailConnected: boolean;
  outlookConnected: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Outreach drafts</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Drafts require human approval before sending — the app does not send automatically.
          </p>
        </div>
        {doNotContact ? (
          <Button variant="secondary" size="sm" disabled title="Do-not-contact flag blocks new drafts">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            New draft
          </Button>
        ) : (
          <div className="flex gap-2">
            <ActionButton
              action={generateDraftAction}
              hiddenFields={{ leadId }}
              variant="secondary"
              size="sm"
              title="Generate a single outreach draft (AI if ANTHROPIC_API_KEY is set, template otherwise)"
            >
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              New draft
            </ActionButton>
            <ActionButton
              action={generateDraftVariantsAction}
              hiddenFields={{ leadId }}
              variant="secondary"
              size="sm"
              title="Generate A/B variants (two drafts to compare reply rates)"
            >
              A/B pair
            </ActionButton>
          </div>
        )}
      </CardHeader>
      <CardBody>
        {drafts.length === 0 ? (
          <EmptyState
            icon={<Send className="h-4 w-4" />}
            title="No drafts yet"
            description={
              doNotContact
                ? "This lead is marked do-not-contact. Drafts are blocked."
                : "Click 'New draft' to generate one from the current brief, audit, and services."
            }
          />
        ) : (
          <ul className="space-y-3">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="rounded-sm border border-[var(--color-border)] p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">{OUTREACH_CHANNEL_LABEL[d.channel]}</Badge>
                  <Badge
                    variant={
                      d.status === "replied"
                        ? "success"
                        : d.status === "contacted" || d.status === "approved"
                          ? "accent"
                          : d.status === "needs_review"
                            ? "warning"
                            : "muted"
                    }
                  >
                    {OUTREACH_STATUS_LABEL[d.status]}
                  </Badge>
                  {d.variantLabel ? (
                    <Badge variant="outline">Variant {d.variantLabel}</Badge>
                  ) : null}
                  {d.replySentiment ? (
                    <Badge
                      variant={
                        d.replySentiment === "interested"
                          ? "success"
                          : d.replySentiment === "not_a_fit" || d.replySentiment === "unsubscribe"
                            ? "muted"
                            : "accent"
                      }
                    >
                      {d.replySentiment.replace("_", " ")}
                    </Badge>
                  ) : null}
                  <span className="text-[11px] text-[var(--color-text-subtle)]">
                    Updated {formatRelative(d.updatedAt)}
                  </span>
                </div>
                {d.subject ? (
                  <div className="mb-1 text-sm font-medium text-[var(--color-text)]">
                    {d.subject}
                  </div>
                ) : null}
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {d.body}
                </p>
                {d.personalizationEvidence.length > 0 ? (
                  <div className="mt-2 border-t border-[var(--color-border)] pt-2">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
                      Personalization evidence
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {d.personalizationEvidence.map((e, i) => (
                        <li key={i} className="text-[11px] text-[var(--color-text-muted)]">
                          · {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {d.status === "needs_review" ? (
                    <>
                      <ActionButton
                        action={approveDraftAction}
                        hiddenFields={{ draftId: d.id }}
                        variant="primary"
                        size="sm"
                      >
                        Approve
                      </ActionButton>
                      {/* Insert Cal.com booking link — only on needs_review drafts */}
                      <ActionButton
                        action={insertCalcomLinkIntoDraftAction}
                        hiddenFields={{ draftId: d.id }}
                        variant="secondary"
                        size="sm"
                        title="Append your Cal.com booking link to this draft. Configure your link in Settings → Integrations first."
                      >
                        Insert booking link
                      </ActionButton>
                    </>
                  ) : null}
                  {d.status === "approved" ? (
                    <>
                      <ActionButton
                        action={markContactedAction}
                        hiddenFields={{ draftId: d.id }}
                        variant="primary"
                        size="sm"
                      >
                        <Send aria-hidden className="h-3 w-3" />
                        Mark contacted
                      </ActionButton>
                      {/* Send via Gmail — only for email channel, only when connected */}
                      {d.channel === "email" && gmailConnected ? (
                        <ActionButton
                          action={sendDraftViaGmailAction}
                          hiddenFields={{ draftId: d.id }}
                          variant="secondary"
                          size="sm"
                          title="Send this draft via your connected Gmail account."
                        >
                          <Mail aria-hidden className="h-3 w-3" />
                          Send via Gmail
                        </ActionButton>
                      ) : d.channel === "email" && !gmailConnected ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          title="Connect Gmail in Settings → Integrations to enable this."
                        >
                          <Mail aria-hidden className="h-3 w-3" />
                          Send via Gmail
                        </Button>
                      ) : null}
                      {/* Send via Outlook — only for email channel, only when connected */}
                      {d.channel === "email" && outlookConnected ? (
                        <ActionButton
                          action={sendDraftViaOutlookAction}
                          hiddenFields={{ draftId: d.id }}
                          variant="secondary"
                          size="sm"
                          title="Send this draft via your connected Outlook account."
                        >
                          <Mail aria-hidden className="h-3 w-3" />
                          Send via Outlook
                        </ActionButton>
                      ) : d.channel === "email" && !outlookConnected ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          title="Connect Outlook in Settings → Integrations to enable this."
                        >
                          <Mail aria-hidden className="h-3 w-3" />
                          Send via Outlook
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {d.status === "contacted" ? (
                    <form action={logReplyAction} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="draftId" value={d.id} />
                      <select
                        name="sentiment"
                        defaultValue=""
                        className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-[11px]"
                        aria-label="Reply sentiment"
                      >
                        <option value="">Sentiment…</option>
                        <option value="interested">Interested</option>
                        <option value="needs_info">Needs info</option>
                        <option value="not_a_fit">Not a fit</option>
                        <option value="unsubscribe">Unsubscribe</option>
                        <option value="unclear">Unclear</option>
                      </select>
                      <Button variant="secondary" size="sm" type="submit">
                        Log reply
                      </Button>
                    </form>
                  ) : null}
                  {d.status === "replied" ||
                  d.status === "approved" ||
                  d.status === "contacted" ? (
                    <ActionButton
                      action={archiveDraftAction}
                      hiddenFields={{ draftId: d.id }}
                      variant="ghost"
                      size="sm"
                      title="Archive this draft"
                    >
                      Archive
                    </ActionButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-[var(--color-text-subtle)]">
          Lead ID: {leadId}
        </p>
      </CardBody>
    </Card>
  );
}

function ActivityTimelineSection({
  activities,
}: {
  activities: import("@/lib/demo/types").Activity[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity timeline</CardTitle>
      </CardHeader>
      <CardBody>
        {activities.length === 0 ? (
          <p className="text-xs text-[var(--color-text-subtle)]">
            No activity recorded yet.
          </p>
        ) : (
          <ol className="relative ml-2 space-y-3 border-l border-[var(--color-border)] pl-4">
            {activities.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--color-accent-500)] ring-2 ring-[var(--color-surface)]" />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-[var(--color-text)]">{a.title}</span>
                  <span className="shrink-0 text-[11px] text-[var(--color-text-subtle)]">
                    {formatRelative(a.createdAt)}
                  </span>
                </div>
                {a.description ? (
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {a.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function TasksSection({
  tasks,
  leadId,
}: {
  tasks: import("@/lib/demo/types").Task[];
  leadId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <ButtonLink href="/tasks" variant="ghost" size="sm">
          All →
        </ButtonLink>
      </CardHeader>
      <CardBody className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-xs text-[var(--color-text-subtle)]">
            No tasks on this lead.
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-2 rounded-sm bg-[var(--color-neutral-50)] p-2"
              >
                {t.status === "done" ? (
                  <CheckCircle2
                    aria-hidden
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success-600)]"
                  />
                ) : (
                  <ActionButton
                    action={completeTaskAction}
                    hiddenFields={{ taskId: t.id }}
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 border border-[var(--color-border-strong)] px-0 py-0"
                    title="Mark complete"
                  >
                    <span className="sr-only">Complete</span>
                  </ActionButton>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs ${t.status === "done" ? "line-through text-[var(--color-text-subtle)]" : "text-[var(--color-text)]"}`}
                  >
                    {t.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-text-subtle)]">
                    <span>{t.priority} priority</span>
                    {t.dueAt ? <span>· {formatRelative(t.dueAt)}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs">
          <summary className="cursor-pointer select-none text-[var(--color-accent-700)] hover:underline">
            Add task
          </summary>
          <form action={createTaskAction} className="mt-2 space-y-2">
            <input type="hidden" name="leadId" value={leadId} />
            <input
              name="title"
              required
              maxLength={200}
              placeholder="Task title"
              className="h-7 w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                name="priority"
                defaultValue="normal"
                className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <select
                name="taskType"
                defaultValue="follow_up"
                className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
              >
                <option value="review_lead">Review lead</option>
                <option value="verify_contact">Verify contact</option>
                <option value="send_approved_message">Send approved</option>
                <option value="follow_up">Follow up</option>
                <option value="prepare_proposal">Prepare proposal</option>
                <option value="book_meeting">Book meeting</option>
                <option value="other">Other</option>
              </select>
              <input
                type="date"
                name="dueAt"
                className="h-7 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="h-7 rounded-sm bg-[var(--color-accent-600)] px-3 text-xs font-medium text-white hover:bg-[var(--color-accent-700)]"
            >
              Add
            </button>
          </form>
        </details>
      </CardBody>
    </Card>
  );
}

function OutcomeSection({ lead }: { lead: import("@/lib/demo/types").Lead }) {
  const terminal =
    lead.pipelineStage === "won" ||
    lead.pipelineStage === "lost" ||
    lead.pipelineStage === "not_a_fit";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outcome</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2 text-xs">
        {terminal ? (
          <>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
                Status
              </div>
              <div className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
                {STAGE_LABEL[lead.pipelineStage]}
              </div>
            </div>
            {lead.estimatedDealValue ? (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
                  Deal value
                </div>
                <div className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
                  {formatCurrency(lead.estimatedDealValue, lead.currency)}
                </div>
              </div>
            ) : null}
            {lead.lossReason ? (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
                  Loss reason
                </div>
                <p className="mt-0.5 text-[var(--color-text-muted)]">
                  {lead.lossReason}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-[var(--color-text-subtle)]">
            Not yet closed. Mark as Won, Lost, or Not a fit from the stage selector when the
            conversation reaches a conclusion.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
