"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { saveOnboardingStepAction } from "@/lib/actions";
import { StepHeader } from "./_shared";
import { listPresets } from "@/lib/presets";
import type { OnboardingState } from "@/lib/onboarding/state";
import { cn } from "@/lib/utils";

const ALL_PRESETS = listPresets();

function getPresetForState(state: OnboardingState) {
  const presetId = state.data.what?.presetId;
  return presetId ? ALL_PRESETS.find((p) => p.id === presetId) : undefined;
}

export function IcpStep({ state }: { state: OnboardingState }) {
  const [pending, startTransition] = useTransition();
  const preset = getPresetForState(state);
  const icp = state.data.icp ?? {};

  const defaultNiches = preset?.suggestedNiches ?? [];
  const [selectedNiches, setSelectedNiches] = useState<string[]>(
    icp.niches ?? (defaultNiches.length > 0 ? [defaultNiches[0] as string] : [])
  );
  const [dealMin, setDealMin] = useState<number>(
    icp.dealMin ?? preset?.defaults.estimatedDealValueRange.min ?? 1000
  );
  const [dealMax, setDealMax] = useState<number>(
    icp.dealMax ?? preset?.defaults.estimatedDealValueRange.max ?? 10000
  );

  function toggleNiche(niche: string) {
    setSelectedNiches((prev) =>
      prev.includes(niche) ? prev.filter((n) => n !== niche) : [...prev, niche]
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await saveOnboardingStepAction(3, {
        icpDescription: String(fd.get("icpDescription") ?? "").trim(),
        niches: selectedNiches,
        country: String(fd.get("country") ?? "").trim(),
        region: String(fd.get("region") ?? "").trim(),
        city: String(fd.get("city") ?? "").trim(),
        dealMin,
        dealMax,
        currency: preset?.defaults.defaultCurrency ?? "USD",
      });
    });
  }

  return (
    <div className="space-y-8">
      <StepHeader
        step={3}
        total={5}
        title="Who's your customer?"
        description="Describe your ideal prospect. We'll use this to seed your first campaign and scoring weights."
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Ideal customer description"
          hint="Who do you typically work with? Be specific — this seeds the discovery and scoring logic."
        >
          <Textarea
            name="icpDescription"
            defaultValue={
              icp.icpDescription ??
              preset?.firstCampaign.idealCustomerDescription ??
              ""
            }
            placeholder="E.g. Local restaurants with 2–5 locations in mid-tier US cities that rely on walk-ins but have no digital presence."
            maxLength={600}
            aria-label="Ideal customer description"
          />
        </Field>

        {/* Niche multi-select */}
        {defaultNiches.length > 0 && (
          <fieldset>
            <legend className="mb-2 block text-xs font-medium text-[var(--color-text-muted)]">
              Target niches{" "}
              <span className="font-normal text-[var(--color-text-subtle)]">
                — select all that apply
              </span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {defaultNiches.map((niche) => (
                <button
                  key={niche}
                  type="button"
                  onClick={() => toggleNiche(niche)}
                  aria-pressed={selectedNiches.includes(niche)}
                  className={cn(
                    "rounded-sm border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-600)]",
                    selectedNiches.includes(niche)
                      ? "border-[var(--color-accent-600)] bg-[var(--color-accent-50)] text-[var(--color-accent-700)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
                  )}
                >
                  {niche}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {/* Geography */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Country">
            <Input
              name="country"
              defaultValue={icp.country ?? "United States"}
              placeholder="United States"
              maxLength={80}
              aria-label="Country"
            />
          </Field>
          <Field label="Region / State">
            <Input
              name="region"
              defaultValue={icp.region ?? ""}
              placeholder="California"
              maxLength={120}
              aria-label="Region or state"
            />
          </Field>
          <Field label="City">
            <Input
              name="city"
              defaultValue={icp.city ?? preset?.suggestedCities[0] ?? ""}
              placeholder="San Francisco"
              maxLength={120}
              aria-label="City"
            />
          </Field>
        </div>

        {/* Deal size slider */}
        <fieldset>
          <legend className="mb-2 block text-xs font-medium text-[var(--color-text-muted)]">
            Typical deal size range ({preset?.defaults.defaultCurrency ?? "USD"})
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Minimum">
              <Input
                type="number"
                min={0}
                step={100}
                value={dealMin}
                onChange={(e) => setDealMin(Number(e.target.value))}
                aria-label="Minimum deal value"
              />
            </Field>
            <Field label="Maximum">
              <Input
                type="number"
                min={0}
                step={100}
                value={dealMax}
                onChange={(e) => setDealMax(Number(e.target.value))}
                aria-label="Maximum deal value"
              />
            </Field>
          </div>
        </fieldset>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(async () => {
                // Go back to step 2 by saving current with a back-step signal
                await saveOnboardingStepAction(3, { ...(icp as Record<string, unknown>), _goBack: true });
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
                  await saveOnboardingStepAction(3, { skip: true });
                })
              }
            >
              Skip
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Next →"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
