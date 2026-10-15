import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Calendar, CheckCircle2, Plus } from "lucide-react";
// (CheckCircle2 used both in header stats and in the row's completed state)
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/action-button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { completeTaskAction, createTaskAction } from "@/lib/actions";
import { pageGroupedTasks, pageListLeads } from "@/lib/data";
import {
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  formatRelative,
} from "@/lib/demo/format";
import type { Lead, Task } from "@/lib/demo/types";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const [groups, leads] = await Promise.all([
    pageGroupedTasks(),
    pageListLeads({}, "updated"),
  ]);
  const leadById = new Map<string, Lead>();
  for (const l of leads) leadById.set(l.id, l);
  const total =
    groups.overdue.length +
    groups.today.length +
    groups.thisWeek.length +
    groups.upcoming.length;
  const done = groups.completed.length;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Follow-ups, reviews, verifications, and manual sends. Grouped by when they're due."
        actions={null}
      />

      <Card className="mb-5 max-w-3xl">
        <CardBody>
          <form
            action={createTaskAction}
            className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]"
          >
            <input
              name="title"
              required
              maxLength={200}
              placeholder="New task — e.g. Follow up with Rani Heritage"
              className="h-8 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm"
            />
            <select
              name="priority"
              defaultValue="normal"
              className="h-8 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <select
              name="taskType"
              defaultValue="follow_up"
              className="h-8 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
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
              className="h-8 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs"
            />
            <button
              type="submit"
              className="h-8 rounded-sm bg-[var(--color-accent-600)] px-3 text-xs font-medium text-white hover:bg-[var(--color-accent-700)]"
            >
              <Plus aria-hidden className="inline h-3.5 w-3.5" /> Add
            </button>
          </form>
        </CardBody>
      </Card>

      <div className="mb-5 grid gap-3 md:grid-cols-5">
        <HeaderStat
          label="Overdue"
          value={groups.overdue.length}
          icon={<AlertTriangle aria-hidden className="h-3.5 w-3.5 text-[color:#8c6a00]" />}
          tone="warning"
        />
        <HeaderStat
          label="Today"
          value={groups.today.length}
          icon={<Calendar aria-hidden className="h-3.5 w-3.5 text-[var(--color-accent-600)]" />}
        />
        <HeaderStat label="This week" value={groups.thisWeek.length} />
        <HeaderStat label="Upcoming" value={groups.upcoming.length} />
        <HeaderStat
          label="Completed"
          value={done}
          icon={<CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-[var(--color-success-600)]" />}
        />
      </div>

      {total === 0 && done === 0 ? (
        <EmptyState
          icon={<Calendar className="h-4 w-4" />}
          title="No tasks on the board"
          description="Add a task from a lead detail page, or create one here."
        />
      ) : (
        <div className="space-y-4">
          {groups.overdue.length > 0 ? (
            <TaskGroup
              label="Overdue"
              tone="warning"
              items={groups.overdue}
              emptyMessage="Nothing is overdue — nice."
              leadById={leadById}
            />
          ) : null}
          <TaskGroup
            label="Today"
            items={groups.today}
            emptyMessage="Nothing due today."
            leadById={leadById}
          />
          <TaskGroup
            label="This week"
            items={groups.thisWeek}
            emptyMessage="This week is clear."
            leadById={leadById}
          />
          <TaskGroup
            label="Upcoming"
            items={groups.upcoming}
            emptyMessage="No scheduled work beyond this week."
            leadById={leadById}
          />
          <TaskGroup
            label="Completed"
            items={groups.completed}
            emptyMessage="No tasks closed yet."
            muted
            leadById={leadById}
          />
        </div>
      )}
    </>
  );
}

function HeaderStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "warning";
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        tone === "warning"
          ? "border-[var(--color-warning-100)] bg-[var(--color-warning-100)]/40"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--color-text)]">
        {value}
      </div>
    </div>
  );
}

function TaskGroup({
  label,
  items,
  emptyMessage,
  tone,
  muted,
  leadById,
}: {
  label: string;
  items: Task[];
  emptyMessage: string;
  tone?: "warning";
  muted?: boolean;
  leadById: Map<string, Lead>;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle
            className={tone === "warning" ? "text-[color:#8c6a00]" : ""}
          >
            {label}
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {items.length} {items.length === 1 ? "task" : "tasks"}
          </p>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {items.length === 0 ? (
          <p className="px-4 py-4 text-xs text-[var(--color-text-subtle)]">
            {emptyMessage}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((t) => {
              const lead = t.leadId ? leadById.get(t.leadId) : undefined;
              return (
                <li
                  key={t.id}
                  className={`flex items-start gap-3 px-4 py-2.5 ${muted ? "opacity-70" : ""}`}
                >
                  {t.status === "done" ? (
                    <CheckCircle2
                      aria-hidden
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-success-600)]"
                    />
                  ) : (
                    <ActionButton
                      action={completeTaskAction}
                      hiddenFields={{ taskId: t.id }}
                      variant="ghost"
                      size="sm"
                      className="mt-0.5 h-4 w-4 shrink-0 border border-[var(--color-border-strong)] px-0 py-0"
                      title="Mark complete"
                    >
                      <span className="sr-only">Complete</span>
                    </ActionButton>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm ${t.status === "done" ? "line-through text-[var(--color-text-subtle)]" : "text-[var(--color-text)]"}`}>
                        {t.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--color-text-subtle)]">
                        {t.status === "done"
                          ? `Done ${formatRelative(t.completedAt)}`
                          : formatRelative(t.dueAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                      {lead ? (
                        <Link
                          href={`/leads/${lead.id}`}
                          className="hover:text-[var(--color-accent-700)] hover:underline"
                        >
                          {lead.businessName}
                        </Link>
                      ) : (
                        <span className="italic text-[var(--color-text-subtle)]">
                          No lead attached
                        </span>
                      )}
                      <Badge
                        variant={
                          t.priority === "high"
                            ? "danger"
                            : t.priority === "normal"
                              ? "muted"
                              : "default"
                        }
                      >
                        {TASK_PRIORITY_LABEL[t.priority]}
                      </Badge>
                      <Badge variant="outline">
                        {TASK_STATUS_LABEL[t.status]}
                      </Badge>
                      {t.notes ? <span className="truncate">· {t.notes}</span> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
