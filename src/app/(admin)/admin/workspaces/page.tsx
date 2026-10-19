import { requireSuperAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";
import Link from "next/link";

export const metadata = {
  title: "Admin — Workspaces",
};

const PAGE_SIZE = 50;

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSuperAdmin();

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const db = await getDb();

  // Fetch workspaces with member count
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      createdAt: workspaces.createdAt,
      stripeCustomerId: workspaces.stripeCustomerId,
    })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Get member counts per workspace
  const memberCounts = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      memberCount: count(workspaceMembers.profileId),
    })
    .from(workspaceMembers)
    .groupBy(workspaceMembers.workspaceId);

  const countMap = new Map(memberCounts.map((r) => [r.workspaceId, r.memberCount]));

  const planBadge = (plan: string) => {
    const styles: Record<string, string> = {
      free: "bg-[var(--color-neutral-100)] text-[var(--color-text-subtle)]",
      freelancer: "bg-[var(--color-info-100)] text-[var(--color-info-500)]",
      teams: "bg-[var(--color-success-100)] text-[var(--color-success-700)]",
      studio: "bg-[var(--color-accent-100)] text-[var(--color-accent-600)]",
    };
    return styles[plan] ?? styles.free;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Workspaces</h1>
        <span className="text-sm text-[var(--color-text-subtle)]">
          Page {page}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
              {["ID", "Name", "Plan", "Members", "Created", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-[var(--color-text)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-text-subtle)]">
                  No workspaces found.
                </td>
              </tr>
            )}
            {rows.map((ws) => (
              <tr key={ws.id} className="bg-[var(--color-surface)] hover:bg-[var(--color-neutral-50)]">
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-subtle)]">
                  {ws.id.slice(0, 8)}…
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--color-text)]">{ws.name}</p>
                  <p className="text-xs text-[var(--color-text-subtle)]">{ws.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${planBadge(ws.plan)}`}
                  >
                    {ws.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">
                  {countMap.get(ws.id) ?? 0}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-subtle)]">
                  {ws.createdAt ? new Date(ws.createdAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/workspaces/${ws.id}`}
                    className="text-xs font-medium text-[var(--color-accent-600)] hover:text-[var(--color-accent-700)] hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
        <span>{rows.length} workspaces shown</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/workspaces?page=${page - 1}`}
              className="rounded-sm border border-[var(--color-border)] px-3 py-1 hover:bg-[var(--color-neutral-100)]"
            >
              Previous
            </Link>
          )}
          {rows.length === PAGE_SIZE && (
            <Link
              href={`/admin/workspaces?page=${page + 1}`}
              className="rounded-sm border border-[var(--color-border)] px-3 py-1 hover:bg-[var(--color-neutral-100)]"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
