import type { ReactNode } from "react";

type Props = {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ kicker, title, description, actions }: Props) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-5">
      <div className="min-w-0">
        {kicker ? (
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
            {kicker}
          </div>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
