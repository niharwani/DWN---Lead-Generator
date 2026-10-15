import { Search } from "lucide-react";

export function Topbar() {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      <div className="relative flex-1 max-w-md">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-subtle)]"
        />
        <input
          type="search"
          placeholder="Search leads, campaigns, tasks…"
          aria-label="Global search"
          className="h-8 w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-3 text-sm placeholder:text-[var(--color-text-subtle)] focus-visible:border-[var(--color-accent-600)] focus-visible:outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
        <span className="hidden sm:inline">owner@dwn.local</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-neutral-200)] text-[11px] font-semibold text-[var(--color-text-muted)]">
          N
        </div>
      </div>
    </header>
  );
}
