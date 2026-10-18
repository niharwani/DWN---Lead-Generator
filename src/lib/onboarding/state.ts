/**
 * Onboarding state persistence.
 *
 * State is stored in `app_settings` using:
 *   - key: `onboarding/v1`
 *   - value: OnboardingState JSON
 *
 * This intentionally avoids Phase A's new tables (`workspaces`, `sessions`).
 * It uses the existing `getSetting` / `setSetting` repo functions and the
 * existing `ownerId` as the tenant key. When Phase A lands and `ownerId`
 * becomes `workspaceId` transparently, this code keeps working unchanged.
 */

import { getDb } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/repos/settings";

export const ONBOARDING_KEY = "onboarding/v1";

export type OnboardingStepData = {
  /** Step 1: workspace identity */
  who?: {
    workspaceName?: string;
    fullName?: string;
    websiteUrl?: string;
    attributionSource?: string;
  };
  /** Step 2: industry preset + pitch */
  what?: {
    presetId?: string;
    pitch?: string;
    caseStudyUrl?: string;
  };
  /** Step 3: ICP + geography + deal size */
  icp?: {
    icpDescription?: string;
    niches?: string[];
    country?: string;
    region?: string;
    city?: string;
    dealMin?: number;
    dealMax?: number;
    currency?: string;
  };
  /** Step 4: services (overrides from preset) + scoring weight adjustments */
  services?: {
    services?: Array<{
      name: string;
      description: string;
      idealCustomer: string;
      valueProposition: string;
    }>;
    scoringOverrides?: Record<string, { points: number; enabled: boolean }>;
  };
  /** Step 5: integrations + notifications */
  integrations?: {
    gmailConnected?: boolean;
    hasAnthropicKey?: boolean;
    hasGooglePlacesKey?: boolean;
    digestFrequency?: "off" | "daily" | "weekly";
  };
};

export type OnboardingState = {
  /** Current step the user is on (1–5). `6` = on the done screen. */
  step: 1 | 2 | 3 | 4 | 5 | 6;
  /** Accumulated step data from all completed steps so far. */
  data: OnboardingStepData;
  /** True once `completeOnboarding` has been called. */
  completed: boolean;
};

const DEFAULT_STATE: OnboardingState = {
  step: 1,
  data: {},
  completed: false,
};

/** Load the current onboarding state for an owner. Returns default if absent. */
export async function getOnboardingState(ownerId: string): Promise<OnboardingState> {
  const db = await getDb();
  const stored = await getSetting<OnboardingState>(db, ownerId, ONBOARDING_KEY);
  if (!stored) return { ...DEFAULT_STATE };
  // Merge to handle schema evolution gracefully.
  return {
    step: stored.step ?? DEFAULT_STATE.step,
    data: stored.data ?? {},
    completed: stored.completed ?? false,
  };
}

/**
 * Merge a partial patch into the current state and persist.
 * Only the provided keys are updated — existing keys are preserved.
 */
export async function setOnboardingState(
  ownerId: string,
  patch: Partial<OnboardingState>
): Promise<OnboardingState> {
  const current = await getOnboardingState(ownerId);
  const next: OnboardingState = {
    step: patch.step ?? current.step,
    data: {
      ...current.data,
      ...(patch.data ?? {}),
    },
    completed: patch.completed ?? current.completed,
  };
  const db = await getDb();
  await setSetting(db, ownerId, ONBOARDING_KEY, next);
  return next;
}

/** Mark onboarding as complete. Advances step to 6 and flips the flag. */
export async function completeOnboarding(ownerId: string): Promise<void> {
  await setOnboardingState(ownerId, { step: 6, completed: true });
}

/** Reset onboarding — useful for debugging or re-runs. */
export async function resetOnboarding(ownerId: string): Promise<void> {
  const db = await getDb();
  await setSetting(db, ownerId, ONBOARDING_KEY, { ...DEFAULT_STATE });
}
