import type { ReactNode } from "react";

/**
 * Minimal shell for the onboarding wizard.
 * No sidebar, no topbar — just a centred content column with the app theme.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      {/* Slim header bar */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            Lead Engine
          </span>
          <span className="text-xs text-[var(--color-text-subtle)]">Setup wizard</span>
        </div>
      </header>

      {/* Centred content */}
      <main className="flex flex-1 flex-col items-center justify-start px-4 py-8 md:py-12">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
