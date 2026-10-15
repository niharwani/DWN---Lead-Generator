/**
 * Owner-scoped app_settings repository.
 *
 * Settings are stored one-row-per-key: `(owner_id, key)` is unique, and
 * `value` is JSON. Phase 5 uses this for scoring weights
 * (`scoring_weights/v0.2`). Later phases will add keys for provider
 * configuration, audit thresholds, etc.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { appSettings } from "../schema";
import {
  DEFAULT_WEIGHTS,
  type FactorWeight,
  type ScoreFactorCode,
  type WeightMap,
  SCORE_VERSION,
} from "@/lib/scoring/engine";

export const SCORING_WEIGHTS_KEY = `scoring_weights/${SCORE_VERSION.split("/")[1]}`;

export async function getSetting<T = unknown>(
  db: Db,
  ownerId: string,
  key: string
): Promise<T | undefined> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, key)))
    .limit(1);
  return row ? (row.value as T) : undefined;
}

export async function setSetting(
  db: Db,
  ownerId: string,
  key: string,
  value: unknown
): Promise<void> {
  const now = new Date().toISOString();
  const id = `${ownerId}:${key}`;
  await db
    .insert(appSettings)
    .values({ id, ownerId, key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: [appSettings.ownerId, appSettings.key],
      set: { value, updatedAt: now },
    });
}

/* -----------------------------------------------------------------
 * Scoring weights (typed convenience wrappers)
 * ----------------------------------------------------------------- */

/**
 * Load the owner's scoring weights, falling back to engine defaults. Missing
 * keys in the stored value also fall back to defaults — so adding a new
 * factor to `DEFAULT_WEIGHTS` doesn't orphan existing rows.
 */
export async function getScoringWeights(
  db: Db,
  ownerId: string
): Promise<WeightMap> {
  const stored = await getSetting<Partial<WeightMap>>(
    db,
    ownerId,
    SCORING_WEIGHTS_KEY
  );
  if (!stored) return { ...DEFAULT_WEIGHTS };
  const merged = { ...DEFAULT_WEIGHTS };
  for (const [code, weight] of Object.entries(stored) as Array<
    [ScoreFactorCode, FactorWeight]
  >) {
    if (!merged[code]) continue; // ignore unknown codes
    merged[code] = {
      points: typeof weight.points === "number" ? weight.points : merged[code].points,
      enabled:
        typeof weight.enabled === "boolean" ? weight.enabled : merged[code].enabled,
    };
  }
  return merged;
}

export async function setScoringWeights(
  db: Db,
  ownerId: string,
  weights: WeightMap
): Promise<void> {
  await setSetting(db, ownerId, SCORING_WEIGHTS_KEY, weights);
}
