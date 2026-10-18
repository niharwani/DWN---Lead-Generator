"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-[var(--color-border)] md:bg-[var(--color-surface)]">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-[var(--color-accent-600)] text-xs font-bold text-white">
          D
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">
            Lead Engine
          </span>
          <span className="text-[11px] text-[var(--color-text-subtle)]">
            Your workspace
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-[var(--color-neutral-100)] font-medium text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive
                    ? "text-[var(--color-accent-600)]"
                    : "text-[var(--color-text-subtle)] group-hover:text-[var(--color-text-muted)]"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        <div className="rounded-sm bg-[var(--color-neutral-100)] px-3 py-2 text-[11px] text-[var(--color-text-subtle)]">
          <span className="font-medium text-[var(--color-text-muted)]">
            Demo mode
          </span>{" "}
          — no external keys required.
        </div>
      </div>
    </aside>
  );
}
