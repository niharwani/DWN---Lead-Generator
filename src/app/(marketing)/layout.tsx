import type { ReactNode } from "react";
import Link from "next/link";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-[var(--color-accent-600)] text-xs font-bold text-white">
              L
            </div>
            <span className="font-semibold tracking-tight text-[var(--color-text)]">
              Lead Engine
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden items-center gap-5 md:flex" aria-label="Marketing navigation">
            <Link
              href="/features"
              className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              Pricing
            </Link>
          </nav>

          {/* CTA */}
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-neutral-100)]"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-sm bg-[var(--color-accent-600)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-700)]"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[var(--color-accent-600)] text-[10px] font-bold text-white">
                  L
                </div>
                <span className="text-sm font-semibold text-[var(--color-text)]">Lead Engine</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)]">
                Built by{" "}
                <a
                  href="https://designwithnihar.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-[var(--color-text-muted)]"
                >
                  Design with Nihar
                </a>
                {" · "}Based in India
              </p>
            </div>

            <nav className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-subtle)]" aria-label="Footer navigation">
              <Link href="/legal/terms" className="hover:text-[var(--color-text-muted)]">
                Terms
              </Link>
              <Link href="/legal/privacy" className="hover:text-[var(--color-text-muted)]">
                Privacy
              </Link>
              <Link href="/legal/dpa" className="hover:text-[var(--color-text-muted)]">
                DPA
              </Link>
              <span className="text-[var(--color-border-strong)]">·</span>
              <span>{year}</span>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
