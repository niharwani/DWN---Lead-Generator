/**
 * Custom audit signal repository.
 *
 * Mirrors the custom-factors repo pattern. Stored under app_settings key
 * `custom_audit_signals/v1` until migration 0004 ships the proper table.
 */

import type { Db } from "@/lib/db/client";
import { getSetting, setSetting } from "./settings";
import type { CustomAuditSignal } from "@/lib/audit/custom-signals";

export const CUSTOM_SIGNALS_KEY = "custom_audit_signals/v1";

export async function listSignals(
  db: Db,
  ownerId: string
): Promise<CustomAuditSignal[]> {
  const stored = await getSetting<CustomAuditSignal[]>(db, ownerId, CUSTOM_SIGNALS_KEY);
  return stored ?? [];
}

export type CreateSignalInput = Omit<CustomAuditSignal, "id">;

export async function createSignal(
  db: Db,
  ownerId: string,
  input: CreateSignalInput
): Promise<CustomAuditSignal> {
  const existing = await listSignals(db, ownerId);
  const newSignal: CustomAuditSignal = { ...input, id: crypto.randomUUID() };
  await setSetting(db, ownerId, CUSTOM_SIGNALS_KEY, [...existing, newSignal]);
  return newSignal;
}

export type UpdateSignalInput = Partial<Omit<CustomAuditSignal, "id">>;

export async function updateSignal(
  db: Db,
  ownerId: string,
  signalId: string,
  update: UpdateSignalInput
): Promise<CustomAuditSignal | null> {
  const existing = await listSignals(db, ownerId);
  const idx = existing.findIndex((s) => s.id === signalId);
  if (idx < 0) return null;
  const updated: CustomAuditSignal = { ...existing[idx]!, ...update, id: signalId };
  existing[idx] = updated;
  await setSetting(db, ownerId, CUSTOM_SIGNALS_KEY, existing);
  return updated;
}

export async function deleteSignal(
  db: Db,
  ownerId: string,
  signalId: string
): Promise<boolean> {
  const existing = await listSignals(db, ownerId);
  const next = existing.filter((s) => s.id !== signalId);
  if (next.length === existing.length) return false;
  await setSetting(db, ownerId, CUSTOM_SIGNALS_KEY, next);
  return true;
}
