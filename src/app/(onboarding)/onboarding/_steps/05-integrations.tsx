"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { saveOnboardingStepAction } from "@/lib/actions";
import { StepHeader } from "./_shared";
import type { OnboardingState } from "@/lib/onboarding/state";
import { cn } from "@/lib/utils";

export function IntegrationsStep({ state }: { state: OnboardingState }) {
  const [pending, startTransition] = useTransition();
  const integrations = state.data.integrations ?? {};

  const [digestFreq, setDigestFreq] = useState<"off" | "daily" | "weekly">(
    integrations.digestFrequency ?? "weekly"
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      await saveOnboardingStepAction(5, {
        digestFrequency: digestFreq,
      });
    });
  }

  return (
    <div className="space-y-8">
      <StepHeader
        step={5}
        total={5}
        title="Integrations & preferences"
        description="Connect optional services. Everything here can be skipped and configured later in Settings."
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Gmail */}
        <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                Connect Gmail
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Send approved outreach drafts and receive reply notifications from within the app.
              </p>
            </div>
            <a
              href="/api/gmail/oauth/start"
              className={cn(
                "inline-flex h-7 items-center rounded-sm border px-2.5 text-xs font-medium transition-colors",
                integrations.gmailConnected
                  ? "border-[var(--color-success-500)] bg-[var(--color-success-50)] text-[var(--color-success-700)]"
                  : "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
              )}
            >
              {integrations.gmailConnected ? "Connected ✓" : "Connect Gmail"}
            </a>
          </div>
          <p className="text-[11px] text-[var(--color-text-subtle)]">
            Uses OAuth — your email credentials are never stored. You can disconnect any time in Settings.
          </p>
        </div>

        {/* Anthropic API key */}
        <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
          <p className="text-sm font-medium text-[var(--color-text)]">
            Anthropic API key (BYO)
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Optional. Without a key, opportunity briefs and drafts use deterministic templates
            (which work well). Add your own key for AI-generated drafts with no quota limit.
          </p>
          <p className="text-[11px] text-[var(--color-text-subtle)]">
            Configure this in Settings → AI provider. Keys are stored server-side via Wrangler
            secrets — they never appear in the browser.
          </p>
        </div>

        {/* Google Places key */}
        <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
          <p className="text-sm font-medium text-[var(--color-text)]">
            Google Places API key (BYO)
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Optional. The app includes a pooled discovery quota. Add your own key for unlimited
            discovery runs.
          </p>
          <p className="text-[11px] text-[var(--color-text-subtle)]">
            Configure this in Settings → Source integrations.
          </p>
        </div>

        {/* Notification preferences */}
        <fieldset>
          <legend className="mb-2 block text-xs font-medium text-[var(--color-text-muted)]">
            Email digest frequency
          </legend>
          <div className="flex gap-2">
            {(["daily", "weekly", "off"] as const).map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => setDigestFreq(freq)}
                aria-pressed={digestFreq === freq}
                className={cn(
                  "flex-1 rounded-sm border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-600)]",
                  digestFreq === freq
                    ? "border-[var(--color-accent-600)] bg-[var(--color-accent-50)] text-[var(--color-accent-700)] font-medium"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
                )}
              >
                {freq === "off" ? "Off" : freq === "daily" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--color-text-subtle)]">
            A summary of new leads, hot leads, and tasks waiting for your attention.
          </p>
        </fieldset>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(async () => {
                await saveOnboardingStepAction(5, { _goBack: true });
              })
            }
          >
            ← Back
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  await saveOnboardingStepAction(5, { skip: true, digestFrequency: "weekly" });
                })
              }
            >
              Skip
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Finishing…" : "Finish setup →"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
