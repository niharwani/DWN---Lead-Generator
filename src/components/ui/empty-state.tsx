import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function EmptyState({ icon, title, description, actions }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-10 text-center">
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-text-subtle)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-[var(--color-text-muted)]">
          {description}
        </p>
      ) : null}
      {actions ? <div className="mt-4 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
