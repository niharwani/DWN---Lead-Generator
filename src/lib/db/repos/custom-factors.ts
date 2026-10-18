/**
 * Custom scoring factor repository.
 *
 * Since migrations 0003/0004 are not yet applied, custom factors are stored
 * as a JSON array under the app_settings key `custom_score_factors/v1`.
 * When migration 0004 ships, this module can be swapped to use the
 * `custom_score_factors` table directly — the calling interface stays the same.
 */

import type { Db } from "@/lib/db/client";
import { getSetting, setSetting } from "./settings";
import type { CustomScoreFactor } from "@/lib/scoring/custom-factors";

export const CUSTOM_FACTORS_KEY = "custom_score_factors/v1";

export async function listFactors(
  db: Db,
  ownerId: string
): Promise<CustomScoreFactor[]> {
  const stored = await getSetting<CustomScoreFactor[]>(db, ownerId, CUSTOM_FACTORS_KEY);
  return stored ?? [];
}

export type CreateFactorInput = Omit<CustomScoreFactor, "id">;

export async function createFactor(
  db: Db,
  ownerId: string,
  input: CreateFactorInput
): Promise<CustomScoreFactor> {
  const existing = await listFactors(db, ownerId);
  const newFactor: CustomScoreFactor = { ...input, id: crypto.randomUUID() };
  await setSetting(db, ownerId, CUSTOM_FACTORS_KEY, [...existing, newFactor]);
  return newFactor;
}

export type UpdateFactorInput = Partial<Omit<CustomScoreFactor, "id">>;

export async function updateFactor(
  db: Db,
  ownerId: string,
  factorId: string,
  update: UpdateFactorInput
): Promise<CustomScoreFactor | null> {
  const existing = await listFactors(db, ownerId);
  const idx = existing.findIndex((f) => f.id === factorId);
  if (idx < 0) return null;
  const updated: CustomScoreFactor = { ...existing[idx]!, ...update, id: factorId };
  existing[idx] = updated;
  await setSetting(db, ownerId, CUSTOM_FACTORS_KEY, existing);
  return updated;
}

export async function deleteFactor(
  db: Db,
  ownerId: string,
  factorId: string
): Promise<boolean> {
  const existing = await listFactors(db, ownerId);
  const next = existing.filter((f) => f.id !== factorId);
  if (next.length === existing.length) return false;
  await setSetting(db, ownerId, CUSTOM_FACTORS_KEY, next);
  return true;
}
