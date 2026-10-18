"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { saveOnboardingStepAction } from "@/lib/actions";
import { StepHeader } from "./_shared";
import { listPresets } from "@/lib/presets";
import type { OnboardingState } from "@/lib/onboarding/state";
import { cn } from "@/lib/utils";

const ALL_PRESETS = listPresets();

export function WhatStep({ state }: { state: OnboardingState }) {
  const [pending, startTransition] = useTransition();
  const what = state.data.what ?? {};

  const [selectedPresetId, setSelectedPresetId] = useState<string>(what.presetId ?? "");
  const [pitch, setPitch] = useState<string>(what.pitch ?? "");

  function selectPreset(id: string) {
    setSelectedPresetId(id);
    const preset = ALL_PRESETS.find((p) => p.id === id);
    if (preset && !pitch) {
      setPitch(preset.defaults.pitch);
    } else if (preset) {
      // Only auto-fill if pitch is still the previous preset's default
      const prevPreset = ALL_PRESETS.find((p) => p.id === what.presetId);
      if (!pitch || pitch === (prevPreset?.defaults.pitch ?? "")) {
        setPitch(preset.defaults.pitch);
      }
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPresetId) return;
    startTransition(async () => {
      await saveOnboardingStepAction(2, {
        presetId: selectedPresetId,
        pitch: pitch.trim(),
        caseStudyUrl: String(
          (e.currentTarget.elements.namedItem("caseStudyUrl") as HTMLInputElement)?.value ?? ""
        ).trim(),
      });
    });
  }

  return (
    <div className="space-y-8">
      <StepHeader
        step={2}
        total={5}
        title="What do you sell?"
        description="Pick the industry that best describes your services. We'll pre-fill everything — you can adjust later."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Preset grid */}
        <fieldset>
          <legend className="mb-3 block text-xs font-medium text-[var(--color-text-muted)]">
            Your industry
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset.id)}
                aria-pressed={selectedPresetId === preset.id}
                className={cn(
                  "rounded-sm border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-600)]",
                  selectedPresetId === preset.id
                    ? "border-[var(--color-accent-600)] bg-[var(--color-accent-50)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"
                )}
              >
                {preset.emoji && (
                  <div className="mb-1 text-lg" aria-hidden>
                    {preset.emoji}
                  </div>
                )}
                <div className="text-sm font-medium text-[var(--color-text)] leading-tight">
                  {preset.name}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--color-text-subtle)] leading-tight">
                  {preset.tagline}
                </div>
              </button>
            ))}
          </div>
          {!selectedPresetId && (
            <p className="mt-2 text-xs text-[var(--color-danger-500)]" role="alert">
              Please choose an industry to continue.
            </p>
          )}
        </fieldset>

        {/* Short pitch */}
        <Field
          label="Short pitch"
          hint="One sentence describing what you do and who you help. Used in outreach draft templates."
        >
          <Textarea
            name="pitch"
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder="A boutique studio helping local restaurants get more reservations through better websites."
            maxLength={400}
            aria-label="Short pitch"
          />
        </Field>

        {/* Case study URL */}
        <Field
          label="Case study or portfolio URL"
          hint="Optional — included in draft templates as a proof point."
        >
          <input
            type="url"
            name="caseStudyUrl"
            defaultValue={what.caseStudyUrl ?? ""}
            placeholder="https://yoursite.com/case-study"
            maxLength={500}
            className="block h-8 w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus-visible:border-[var(--color-accent-600)] focus-visible:outline-none"
            aria-label="Case study or portfolio URL"
          />
        </Field>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(async () => {
                await saveOnboardingStepAction(2, { presetId: selectedPresetId, pitch, caseStudyUrl: "" });
              })
            }
          >
            ← Back
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !selectedPresetId}>
            {pending ? "Saving…" : "Next →"}
          </Button>
        </div>
      </form>
    </div>
  );
}
