import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

export type TabDef<Href extends string = string> = {
  label: string;
  href: Href;
  count?: number;
};

/**
 * Server-rendered tabs. Uses URL links so each tab is a navigable page — works
 * without client JS and preserves back/forward semantics.
 */
export function Tabs<Href extends string>({
  tabs,
  active,
}: {
  tabs: TabDef<Href>[];
  active: string;
}) {
  return (
    <div className="border-b border-[var(--color-border)]">
      <nav className="-mb-px flex gap-4 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.href === active;
          return (
            <Link
              key={tab.href}
              href={tab.href as Route}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 py-2 text-sm transition-colors whitespace-nowrap",
                isActive
                  ? "border-[var(--color-accent-600)] text-[var(--color-text)] font-medium"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    isActive
                      ? "bg-[var(--color-accent-100)] text-[var(--color-accent-700)]"
                      : "bg-[var(--color-neutral-100)] text-[var(--color-text-subtle)]"
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
