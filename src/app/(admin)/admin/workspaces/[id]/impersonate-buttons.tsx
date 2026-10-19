"use client";

import { useRouter } from "next/navigation";

/* ============================================================================
 * Impersonate / stop-impersonate buttons.
 *
 * "Impersonation" here is NOT a real session takeover — it is a URL query-flag
 * (?impersonating=1) that puts the admin view into a read-only support-viewer
 * mode. The admin's own session and workspace remain active.
 * ========================================================================== */

export function ImpersonateButton({
  workspaceId,
  adminEmail,
}: {
  workspaceId: string;
  adminEmail: string;
}) {
  const router = useRouter();
  const label = `View as support agent (read-only) — ${adminEmail}`;

  function handleClick() {
    router.push(`/admin/workspaces/${workspaceId}?impersonating=1`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      className="inline-flex h-9 items-center rounded-md bg-[var(--color-accent-600)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-700)]"
    >
      Start view-only mode
    </button>
  );
}

export function StopImpersonateButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();

  function handleClick() {
    router.push(`/admin/workspaces/${workspaceId}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md border border-[var(--color-warning-500)] px-3 py-1.5 text-xs font-medium text-[var(--color-warning-500)] hover:bg-[var(--color-warning-100)]"
    >
      Exit view-only mode
    </button>
  );
}
