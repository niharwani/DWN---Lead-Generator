/**
 * Shared UI primitives for the onboarding wizard steps.
 * Keeps each step file lean by centralising progress indicator + header.
 */

import { cn } from "@/lib/utils";

export function StepHeader({
  step,
  total,
  title,
  description,
}: {
  step: number;
  total: number;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <StepProgress current={step} total={total} />
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
      </div>
    </div>
  );
}

function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div aria-label={`Step ${current} of ${total}`} className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-subtle)]">
          Step {current} of {total}
        </span>
        <span className="text-xs text-[var(--color-text-subtle)]">
          {Math.round((current / total) * 100)}%
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < current
                ? "bg-[var(--color-accent-600)]"
                : "bg-[var(--color-neutral-200)]"
            )}
          />
        ))}
      </div>
    </div>
  );
}
