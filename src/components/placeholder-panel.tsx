import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  phase: string;
  checklist?: string[];
  children?: ReactNode;
};

/**
 * Phase 0 placeholder for routes whose real UI arrives in later phases.
 * Shows the phase that will build this screen and what to expect, so the app
 * doesn't look dead while the shell is in place.
 */
export function PlaceholderPanel({
  title,
  description,
  phase,
  checklist,
  children,
}: Props) {
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent-100)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-accent-700)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-600)]" />
        {phase}
      </div>
      <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
      {checklist && checklist.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm text-[var(--color-text-muted)]">
          {checklist.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-neutral-400)]"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
