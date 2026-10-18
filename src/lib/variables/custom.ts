/**
 * Workspace-level custom variable CRUD.
 *
 * Custom variables are stored as a JSON object under the `variables/v1`
 * app_settings key. Each entry is a plain string value.
 */

import type { Db } from "@/lib/db/client";
import { getSetting, setSetting } from "@/lib/db/repos/settings";

export const VARIABLES_KEY = "variables/v1";

export type CustomVariables = Record<string, string>;

export async function getCustomVariables(
  db: Db,
  ownerId: string
): Promise<CustomVariables> {
  const stored = await getSetting<CustomVariables>(db, ownerId, VARIABLES_KEY);
  return stored ?? {};
}

export async function setCustomVariable(
  db: Db,
  ownerId: string,
  name: string,
  value: string
): Promise<void> {
  const existing = await getCustomVariables(db, ownerId);
  existing[name] = value;
  await setSetting(db, ownerId, VARIABLES_KEY, existing);
}

export async function deleteCustomVariable(
  db: Db,
  ownerId: string,
  name: string
): Promise<void> {
  const existing = await getCustomVariables(db, ownerId);
  delete existing[name];
  await setSetting(db, ownerId, VARIABLES_KEY, existing);
}
