import { requireSuperAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { listWaitlist, countWaitlist } from "@/lib/db/repos/waitlist";
import Link from "next/link";

export const metadata = {
  title: "Admin — Waitlist",
};

const PAGE_SIZE = 50;

export default async function AdminWaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requireSuperAdmin();

  const { cursor } = await searchParams;
  const db = await getDb();

  const [rows, total] = await Promise.all([
    listWaitlist(db, { limit: PAGE_SIZE, cursor }),
    countWaitlist(db),
  ]);

  const nextCursor = rows.length === PAGE_SIZE ? rows[rows.length - 1]!.createdAt : undefined;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Waitlist</h1>
          <p className="mt-0.5 text-sm text-[var(--color-text-subtle)]">
            {total} total entr{total === 1 ? "y" : "ies"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
              {["Email", "Phone", "Plan", "Source", "Note", "Signed up"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-semibold text-[var(--color-text)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-[var(--color-text-subtle)]"
                >
                  No waitlist entries yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="bg-[var(--color-surface)] hover:bg-[var(--color-neutral-50)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                  <a
                    href={`mailto:${row.email}`}
                    className="text-[var(--color-accent-600)] hover:underline"
                  >
                    {row.email}
                  </a>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">
                  {row.phone ?? <span className="italic text-[var(--color-text-subtle)]">—</span>}
                </td>
                <td className="px-4 py-3">
                  {row.requestedPlan ? (
                    <span className="inline-flex rounded-full bg-[var(--color-info-100)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-info-500)]">
                      {row.requestedPlan}
                    </span>
                  ) : (
                    <span className="italic text-[var(--color-text-subtle)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  {row.source ?? <span className="italic text-[var(--color-text-subtle)]">—</span>}
                </td>
                <td className="max-w-xs px-4 py-3 text-xs text-[var(--color-text-muted)]">
                  {row.note ? (
                    <span className="line-clamp-2">{row.note}</span>
                  ) : (
                    <span className="italic text-[var(--color-text-subtle)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-subtle)]">
                  {row.createdAt
                    ? new Date(row.createdAt).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
        <span>{rows.length} shown</span>
        <div className="flex gap-2">
          {cursor && (
            <Link
              href="/admin/waitlist"
              className="rounded-sm border border-[var(--color-border)] px-3 py-1 hover:bg-[var(--color-neutral-100)]"
            >
              First page
            </Link>
          )}
          {nextCursor && (
            <Link
              href={`/admin/waitlist?cursor=${encodeURIComponent(nextCursor)}`}
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
