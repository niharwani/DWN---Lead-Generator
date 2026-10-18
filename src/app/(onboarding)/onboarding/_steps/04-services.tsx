"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { saveOnboardingStepAction } from "@/lib/actions";
import { StepHeader } from "./_shared";
import { listPresets } from "@/lib/presets";
import { buildWeightMapFromPreset } from "@/lib/onboarding/apply-preset";
import { FACTOR_LABELS, DEFAULT_WEIGHTS, type ScoreFactorCode } from "@/lib/scoring/engine";
import type { OnboardingState } from "@/lib/onboarding/state";
import { cn } from "@/lib/utils";

const ALL_PRESETS = listPresets();

type ServiceEntry = {
  name: string;
  description: string;
  idealCustomer: string;
  valueProposition: string;
};

function getPresetForState(state: OnboardingState) {
  const presetId = state.data.what?.presetId;
  return presetId ? ALL_PRESETS.find((p) => p.id === presetId) : undefined;
}

export function ServicesStep({ state }: { state: OnboardingState }) {
  const [pending, startTransition] = useTransition();
  const [showWeights, setShowWeights] = useState(false);

  const preset = getPresetForState(state);

  // Services: use step 4 data if previously saved, else fall back to preset
  const initialServices: ServiceEntry[] =
    (state.data.services?.services as ServiceEntry[] | undefined) ??
    preset?.services.map((s) => ({ ...s })) ??
    [];

  const [services, setServices] = useState<ServiceEntry[]>(initialServices);

  // Scoring weights
  const presetWeights =
    state.data.services?.scoringOverrides ??
    (preset ? buildWeightMapFromPreset(preset) : DEFAULT_WEIGHTS);

  const [weights, setWeights] = useState<Record<string, { points: number; enabled: boolean }>>(
    presetWeights as Record<string, { points: number; enabled: boolean }>
  );

  function addService() {
    setServices((prev) => [
      ...prev,
      { name: "", description: "", idealCustomer: "", valueProposition: "" },
    ]);
  }

  function removeService(idx: number) {
    setServices((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateService(idx: number, field: keyof ServiceEntry, value: string) {
    setServices((prev) =>
      prev.map((svc, i) => (i === idx ? { ...svc, [field]: value } : svc))
    );
  }

  function updateWeight(code: string, field: "points" | "enabled", value: number | boolean) {
    setWeights((prev) => {
      const current = prev[code] ?? { points: 0, enabled: true };
      return {
        ...prev,
        [code]: { ...current, [field]: value },
      };
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      await saveOnboardingStepAction(4, {
        services,
        scoringOverrides: weights,
      });
    });
  }

  return (
    <div className="space-y-8">
      <StepHeader
        step={4}
        total={5}
        title="Services & evaluation"
        description="Review and edit your services. Scoring weights are tuned to your industry — adjust if needed."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Services list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Your services
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={addService}>
              + Add service
            </Button>
          </div>

          {services.map((svc, idx) => (
            <div
              key={idx}
              className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-text-muted)]">
                  Service {idx + 1}
                </span>
                {services.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeService(idx)}
                    aria-label={`Remove service ${idx + 1}`}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Service name">
                  <Input
                    value={svc.name}
                    onChange={(e) => updateService(idx, "name", e.target.value)}
                    placeholder="Brand Website"
                    maxLength={120}
                    required
                    aria-label={`Service ${idx + 1} name`}
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={svc.description}
                    onChange={(e) => updateService(idx, "description", e.target.value)}
                    placeholder="Short description"
                    maxLength={300}
                    aria-label={`Service ${idx + 1} description`}
                  />
                </Field>
                <Field label="Ideal customer">
                  <Textarea
                    value={svc.idealCustomer}
                    onChange={(e) => updateService(idx, "idealCustomer", e.target.value)}
                    placeholder="Who is this service for?"
                    maxLength={300}
                    className="min-h-[60px]"
                    aria-label={`Service ${idx + 1} ideal customer`}
                  />
                </Field>
                <Field label="Value proposition">
                  <Textarea
                    value={svc.valueProposition}
                    onChange={(e) => updateService(idx, "valueProposition", e.target.value)}
                    placeholder="What outcome does it deliver?"
                    maxLength={300}
                    className="min-h-[60px]"
                    aria-label={`Service ${idx + 1} value proposition`}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>

        {/* Collapsible scoring weights */}
        <div className="rounded-sm border border-[var(--color-border)]">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setShowWeights(!showWeights)}
            aria-expanded={showWeights}
          >
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Scoring weights
            </span>
            <span className="text-[11px] text-[var(--color-text-subtle)]">
              {showWeights ? "▲ Hide" : "▼ Show"}{" "}
              {preset ? `(tuned for ${preset.name})` : "(defaults)"}
            </span>
          </button>

          {showWeights && (
            <div className="border-t border-[var(--color-border)] px-4 py-3">
              <p className="mb-3 text-[11px] text-[var(--color-text-subtle)]">
                These weights are pre-tuned for your industry. Adjust if you know certain
                signals are more or less important for your niche.
              </p>
              <ul className="divide-y divide-[var(--color-border)]">
                {(Object.keys(FACTOR_LABELS) as ScoreFactorCode[]).map((code) => {
                  const w = weights[code] ?? DEFAULT_WEIGHTS[code];
                  return (
                    <li
                      key={code}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-[var(--color-text)]">
                          {FACTOR_LABELS[code]}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-subtle)]">
                          {code}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                          <input
                            type="checkbox"
                            checked={w?.enabled ?? true}
                            onChange={(e) =>
                              updateWeight(code, "enabled", e.target.checked)
                            }
                            aria-label={`Enable ${FACTOR_LABELS[code]}`}
                          />
                          on
                        </label>
                        <input
                          type="number"
                          value={w?.points ?? 0}
                          onChange={(e) =>
                            updateWeight(code, "points", Number(e.target.value))
                          }
                          className="h-7 w-20 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-right text-sm focus-visible:border-[var(--color-accent-600)] focus-visible:outline-none"
                          aria-label={`Points for ${FACTOR_LABELS[code]}`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(async () => {
                await saveOnboardingStepAction(4, { _goBack: true });
              })
            }
          >
            ← Back
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Next →"}
          </Button>
        </div>
      </form>
    </div>
  );
}
