"use client";

import { useEffect, useTransition } from "react";
import { ButtonLink } from "@/components/ui/button";
import { completeOnboardingAction } from "@/lib/actions";

/**
 * Success state shown after step 5 is submitted.
 * Triggers `completeOnboardingAction` on mount (idempotent) and shows
 * a "Go to overview" button.
 */
export function DoneStep() {
  const [, startTransition] = useTransition();

  // Trigger completion and demo seed on mount — idempotent if already done.
  useEffect(() => {
    startTransition(async () => {
      await completeOnboardingAction();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center space-y-6 py-12 text-center">
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-100)] text-3xl"
      >
        🎉
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          You're all set!
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md">
          Your workspace is configured. We've seeded a demo campaign with sample leads
          so you can explore the app before adding your real prospects.
        </p>
      </div>

      <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left max-w-sm w-full space-y-2">
        <p className="text-xs font-medium text-[var(--color-text-muted)]">
          Next steps
        </p>
        <ul className="space-y-1.5">
          {[
            "Review your demo campaign and leads",
            "Import your first real leads",
            "Approve your first outreach draft",
            "Connect Gmail in Settings",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-[var(--color-text)]">
              <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--color-border)]" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <ButtonLink href="/overview" variant="primary">
        Go to overview →
      </ButtonLink>
    </div>
  );
}
