import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/auth/admin";
import Link from "next/link";
import { Shield } from "lucide-react";

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  // Throws 403 (or redirects to /login) if not super-admin
  const owner = await requireSuperAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      {/* Admin header */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-14 items-center gap-4 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--color-accent-600)]" aria-hidden />
            <span className="font-semibold text-sm text-[var(--color-text)]">Admin</span>
          </div>

          <nav className="flex items-center gap-4 text-sm" aria-label="Admin navigation">
            <Link
              href="/admin/workspaces"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Workspaces
            </Link>
            <Link
              href="/admin/comp"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Comp plans
            </Link>
            <Link
              href="/admin/waitlist"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              Waitlist
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-subtle)]">{owner.email}</span>
            <Link
              href="/overview"
              className="inline-flex h-7 items-center rounded-sm border border-[var(--color-border)] px-2.5 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)]"
            >
              Back to app
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
          {children}
        </div>
      </main>
    </div>
  );
}
