import { requireSuperAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { workspaces, workspaceMembers, profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImpersonateButton, StopImpersonateButton } from "./impersonate-buttons";

export const metadata = {
  title: "Admin — Workspace detail",
};

export default async function AdminWorkspaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ impersonating?: string }>;
}) {
  const owner = await requireSuperAdmin();
  const { id } = await params;
  const { impersonating } = await searchParams;
  const isImpersonating = impersonating === "1";

  const db = await getDb();

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);

  if (!workspace) notFound();

  // Members with profile info
  const members = await db
    .select({
      profileId: workspaceMembers.profileId,
      role: workspaceMembers.role,
      acceptedAt: workspaceMembers.acceptedAt,
      email: profiles.email,
      fullName: profiles.fullName,
    })
    .from(workspaceMembers)
    .innerJoin(profiles, eq(workspaceMembers.profileId, profiles.id))
    .where(eq(workspaceMembers.workspaceId, id));

  const roleColors: Record<string, string> = {
    owner: "bg-[var(--color-accent-100)] text-[var(--color-accent-600)]",
    admin: "bg-[var(--color-info-100)] text-[var(--color-info-500)]",
    member: "bg-[var(--color-neutral-100)] text-[var(--color-text-muted)]",
    viewer: "bg-[var(--color-neutral-100)] text-[var(--color-text-subtle)]",
  };

  return (
    <div className="space-y-8">
      {/* Impersonation banner */}
      {isImpersonating && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-[var(--color-warning-500)] bg-[var(--color-warning-100)] px-4 py-3"
        >
          <p className="text-sm font-medium text-[var(--color-warning-500)]">
            View-only impersonation mode — you are viewing this workspace as a support agent.
            No mutations are permitted.
          </p>
          <StopImpersonateButton workspaceId={id} />
        </div>
      )}

      {/* Back */}
      <div>
        <Link
          href="/admin/workspaces"
          className="text-sm text-[var(--color-accent-600)] hover:text-[var(--color-accent-700)]"
        >
          ← Back to workspaces
        </Link>
      </div>

      {/* Workspace info */}
      <section>
        <h1 className="mb-4 text-2xl font-semibold text-[var(--color-text)]">
          {workspace.name}
        </h1>
        <div className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:grid-cols-2">
          {[
            ["ID", workspace.id],
            ["Slug", workspace.slug],
            ["Plan", workspace.plan],
            ["Stripe customer ID", workspace.stripeCustomerId ?? "—"],
            ["Stripe subscription ID", workspace.stripeSubscriptionId ?? "—"],
            ["Trial ends at", workspace.trialEndsAt ?? "—"],
            ["Created", workspace.createdAt],
            ["Updated", workspace.updatedAt],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                {label}
              </p>
              <p className="mt-0.5 break-all font-mono text-xs text-[var(--color-text-muted)]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Members */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
          Members ({members.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                {["Name", "Email", "Role", "Joined"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-[var(--color-text)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {members.map((m) => (
                <tr key={m.profileId} className="bg-[var(--color-surface)]">
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    {m.fullName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {m.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleColors[m.role] ?? roleColors.member}`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-subtle)]">
                    {m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Actions */}
      <section className="flex flex-wrap gap-3">
        {!isImpersonating && (
          <ImpersonateButton workspaceId={id} adminEmail={owner.email} />
        )}
        <Link
          href={`/admin/comp?workspaceId=${id}`}
          className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-neutral-100)]"
        >
          Comp plan upgrade
        </Link>
      </section>
    </div>
  );
}
