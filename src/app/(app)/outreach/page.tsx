import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature, Send, Shield } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/action-button";
import {
  approveDraftAction,
  logReplyAction,
  markContactedAction,
} from "@/lib/actions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { pageGroupDraftsByStatus, pageListLeads } from "@/lib/data";
import {
  OUTREACH_CHANNEL_LABEL,
  OUTREACH_STATUS_LABEL,
  formatRelative,
} from "@/lib/demo/format";
import type { Lead, OutreachStatus } from "@/lib/demo/types";

export const metadata: Metadata = { title: "Outreach" };

const COLUMNS: OutreachStatus[] = [
  "draft",
  "needs_review",
  "approved",
  "contacted",
  "replied",
  "archived",
];

const COLUMN_TONE: Record<OutreachStatus, string> = {
  draft: "border-[var(--color-border)]",
  needs_review: "border-[var(--color-warning-100)]",
  approved: "border-[var(--color-accent-300)]",
  contacted: "border-[var(--color-info-100)]",
  replied: "border-[var(--color-success-100)]",
  archived: "border-[var(--color-border)]",
};

export default async function OutreachPage() {
  const [grouped, leads] = await Promise.all([
    pageGroupDraftsByStatus(),
    pageListLeads({}, "updated"),
  ]);
  const leadById = new Map<string, Lead>();
  for (const l of leads) leadById.set(l.id, l);

  return (
    <>
      <PageHeader
        title="Outreach"
        description='Drafts move through a lifecycle. "Approved" means approved for you to send manually — the app never sends automatically in MVP.'
      />

      <Card className="mb-5 border-dashed">
        <CardBody className="flex items-start gap-3">
          <Shield aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-600)]" />
          <div className="text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text)]">
              Human approval is mandatory.
            </span>{" "}
            Every draft starts as{" "}
            <code className="rounded bg-[var(--color-neutral-100)] px-1 py-0.5 text-[11px]">
              needs_review
            </code>
            . Approve moves it to the owner's queue for manual sending. Contact
            logging is explicit — the app never records a send it didn't make.
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((status) => {
          const items = grouped[status];
          return (
            <section
              key={status}
              className={`rounded-md border bg-[var(--color-surface)] ${COLUMN_TONE[status]}`}
            >
              <header className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {OUTREACH_STATUS_LABEL[status]}
                </h2>
                <Badge variant="muted">{items.length}</Badge>
              </header>
              <div className="space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[11px] text-[var(--color-text-subtle)]">
                    Empty
                  </p>
                ) : (
                  items.map((d) => {
                    const lead = leadById.get(d.leadId);
                    return (
                      <article
                        key={d.id}
                        className="rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 shadow-[var(--shadow-sm)]"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant="outline">
                            {OUTREACH_CHANNEL_LABEL[d.channel]}
                          </Badge>
                          <span className="text-[10px] text-[var(--color-text-subtle)]">
                            {formatRelative(d.updatedAt)}
                          </span>
                        </div>
                        {lead ? (
                          <Link
                            href={`/leads/${lead.id}`}
                            className="block truncate text-xs font-medium text-[var(--color-text)] hover:text-[var(--color-accent-700)] hover:underline"
                          >
                            {lead.businessName}
                          </Link>
                        ) : null}
                        {d.subject ? (
                          <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                            {d.subject}
                          </div>
                        ) : null}
                        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                          {d.body}
                        </p>
                        {d.personalizationEvidence.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {d.personalizationEvidence.slice(0, 2).map((e, i) => (
                              <span
                                key={i}
                                className="inline-flex rounded bg-[var(--color-neutral-100)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                                title={e}
                              >
                                {e.length > 36 ? `${e.slice(0, 36)}…` : e}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2 flex items-center gap-1">
                          {status === "needs_review" ? (
                            <ActionButton
                              action={approveDraftAction}
                              hiddenFields={{ draftId: d.id }}
                              variant="primary"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                            >
                              Approve
                            </ActionButton>
                          ) : status === "approved" ? (
                            <ActionButton
                              action={markContactedAction}
                              hiddenFields={{ draftId: d.id }}
                              variant="primary"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                            >
                              <Send aria-hidden className="h-3 w-3" />
                              Mark contacted
                            </ActionButton>
                          ) : status === "contacted" ? (
                            <ActionButton
                              action={logReplyAction}
                              hiddenFields={{ draftId: d.id }}
                              variant="secondary"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                            >
                              Log reply
                            </ActionButton>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {Object.values(grouped).every((arr) => arr.length === 0) ? (
        <div className="mt-6">
          <EmptyState
            icon={<FileSignature className="h-4 w-4" />}
            title="No drafts yet"
            description="Open a qualified lead and generate the first outreach draft from the lead detail page."
          />
        </div>
      ) : null}
    </>
  );
}
