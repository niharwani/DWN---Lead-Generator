import { Search, ChevronDown, LogOut, Settings, ChevronsUpDown } from "lucide-react";
import { getOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getWorkspacesForProfile } from "@/lib/db/repos/workspaces";

export async function Topbar() {
  const owner = await getOwner();
  const workspaces = owner
    ? await getWorkspacesForProfile(await getDb(), owner.profileId)
    : [];

  const initials = owner?.fullName
    ? owner.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : owner?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      {/* Search */}
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

      <div className="ml-auto flex items-center gap-2">
        {/* Workspace switcher */}
        {owner && workspaces.length > 0 && (
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]">
              <span className="max-w-[120px] truncate">{owner.workspace.name}</span>
              <ChevronsUpDown className="h-3 w-3 text-[var(--color-text-subtle)]" aria-hidden />
            </summary>
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-md">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                Workspaces
              </p>
              {workspaces.map((ws) => (
                <form
                  key={ws.id}
                  action="/api/workspaces/switch"
                  method="POST"
                  className="block"
                >
                  <input type="hidden" name="workspaceId" value={ws.id} />
                  <button
                    type="submit"
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-neutral-100)] ${
                      ws.id === owner.workspace.id
                        ? "font-semibold text-[var(--color-accent-600)]"
                        : "text-[var(--color-text)]"
                    }`}
                  >
                    <span className="flex-1 truncate">{ws.name}</span>
                    {ws.id === owner.workspace.id && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-600)]" />
                    )}
                  </button>
                </form>
              ))}
              <hr className="my-1 border-[var(--color-border)]" />
              <a
                href="/settings"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]"
              >
                Create workspace
              </a>
            </div>
          </details>
        )}

        {/* User menu */}
        {owner ? (
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-neutral-200)] text-[11px] font-semibold text-[var(--color-text-muted)]"
                title={owner.email}
              >
                {initials}
              </div>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-md">
              <div className="px-3 py-2 border-b border-[var(--color-border)]">
                <p className="truncate text-xs font-medium text-[var(--color-text)]">
                  {owner.fullName ?? owner.email}
                </p>
                {owner.fullName && (
                  <p className="truncate text-[11px] text-[var(--color-text-subtle)]">
                    {owner.email}
                  </p>
                )}
              </div>
              <a
                href="/settings"
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]"
              >
                <Settings className="h-3 w-3" aria-hidden />
                Settings
              </a>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]"
                >
                  <LogOut className="h-3 w-3" aria-hidden />
                  Log out
                </button>
              </form>
            </div>
          </details>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-neutral-200)] text-[11px] font-semibold text-[var(--color-text-muted)]">
            ?
          </div>
        )}
      </div>
    </header>
  );
}
