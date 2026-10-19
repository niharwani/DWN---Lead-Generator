import { requireSuperAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { adminCompPlanAction } from "@/lib/actions";
import Link from "next/link";

export const metadata = {
  title: "Admin — Comp plan upgrade",
};

export default async function AdminCompPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; success?: string }>;
}) {
  await requireSuperAdmin();
  const { workspaceId, success } = await searchParams;

  const db = await getDb();

  // If workspaceId is pre-filled (from workspace detail page), load it
  let prefilledWorkspace: { id: string; name: string; plan: string } | null = null;
  if (workspaceId) {
    const [ws] = await db
      .select({ id: workspaces.id, name: workspaces.name, plan: workspaces.plan })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    prefilledWorkspace = ws ?? null;
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link
          href="/admin/workspaces"
          className="text-sm text-[var(--color-accent-600)] hover:text-[var(--color-accent-700)]"
        >
          &larr; Back to workspaces
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-semibold text-[var(--color-text)]">
        Comp plan upgrade
      </h1>
      <p className="mb-8 text-sm text-[var(--color-text-muted)]">
        Manually set a workspace&apos;s plan without going through billing. Use for beta users,
        comped accounts, and support escalations.
      </p>

      {success === "1" && (
        <div className="mb-6 rounded-lg border border-[var(--color-success-500)] bg-[var(--color-success-50)] px-4 py-3 text-sm text-[var(--color-success-700)]">
          Plan updated successfully.
        </div>
      )}

      <form
        action={adminCompPlanAction}
        className="space-y-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
      >
        <div>
          <label
            htmlFor="workspaceId"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            Workspace ID
          </label>
          <input
            id="workspaceId"
            name="workspaceId"
            type="text"
            required
            defaultValue={prefilledWorkspace?.id ?? ""}
            placeholder="workspace UUID"
            className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus-visible:border-[var(--color-accent-600)] focus-visible:outline-none"
          />
          {prefilledWorkspace && (
            <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
              {prefilledWorkspace.name} &mdash; currently on {prefilledWorkspace.plan}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="plan"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            New plan
          </label>
          <select
            id="plan"
            name="plan"
            required
            className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] focus-visible:border-[var(--color-accent-600)] focus-visible:outline-none"
          >
            <option value="">— select a plan —</option>
            <option value="free">Free</option>
            <option value="freelancer">Freelancer</option>
            <option value="teams">Teams</option>
            <option value="studio">Studio</option>
          </select>
        </div>

        <div className="rounded-md bg-[var(--color-warning-100)] px-3 py-2 text-xs text-[var(--color-warning-500)]">
          This bypasses the billing system entirely. The workspace will have the selected plan
          with no associated subscription. Ensure you have tracked this comp separately.
        </div>

        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-[var(--color-accent-600)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-700)]"
        >
          Apply comp plan
        </button>
      </form>
    </div>
  );
}
