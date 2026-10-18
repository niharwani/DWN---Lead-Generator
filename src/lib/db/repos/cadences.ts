/**
 * Follow-up cadence repository.
 *
 * Persists cadence definitions as JSON blobs in app_settings. Each cadence
 * lives under key "cadence/<id>". The list of IDs per owner is stored under
 * "cadences/index/v1". Campaign attachments live under "cadence_attach/<campaignId>".
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { appSettings } from "../schema";
import type { CadenceConfig } from "@/lib/outreach/cadence";

const INDEX_KEY = "cadences/index/v1";

function cadenceKey(id: string) {
  return `cadence/${id}`;
}

function attachKey(campaignId: string) {
  return `cadence_attach/${campaignId}`;
}

async function upsertSetting(
  db: Db,
  ownerId: string,
  key: string,
  value: unknown
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, key)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, key)));
  } else {
    await db.insert(appSettings).values({
      id: crypto.randomUUID(),
      ownerId,
      key,
      value,
      updatedAt: now,
    });
  }
}

export async function listCadences(
  db: Db,
  ownerId: string
): Promise<CadenceConfig[]> {
  const [indexRow] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, INDEX_KEY)))
    .limit(1);

  const ids = Array.isArray(indexRow?.value) ? (indexRow.value as string[]) : [];
  const configs: CadenceConfig[] = [];

  for (const id of ids) {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, cadenceKey(id))))
      .limit(1);
    if (row?.value) configs.push(row.value as CadenceConfig);
  }

  return configs;
}

export async function getCadence(
  db: Db,
  ownerId: string,
  id: string
): Promise<CadenceConfig | undefined> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, cadenceKey(id))))
    .limit(1);
  return row?.value as CadenceConfig | undefined;
}

export async function createCadence(
  db: Db,
  ownerId: string,
  input: Omit<CadenceConfig, "id">
): Promise<CadenceConfig> {
  const id = crypto.randomUUID();
  const config: CadenceConfig = { id, ...input };

  await upsertSetting(db, ownerId, cadenceKey(id), config);

  // Update index
  const existing = await listCadences(db, ownerId);
  const ids = existing.map((c) => c.id);
  if (!ids.includes(id)) ids.push(id);
  await upsertSetting(db, ownerId, INDEX_KEY, ids);

  return config;
}

export async function updateCadence(
  db: Db,
  ownerId: string,
  id: string,
  patch: Partial<Omit<CadenceConfig, "id">>
): Promise<CadenceConfig | undefined> {
  const existing = await getCadence(db, ownerId, id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  await upsertSetting(db, ownerId, cadenceKey(id), updated);
  return updated;
}

export async function deleteCadence(
  db: Db,
  ownerId: string,
  id: string
): Promise<boolean> {
  const existing = await getCadence(db, ownerId, id);
  if (!existing) return false;

  const now = new Date().toISOString();
  await db
    .update(appSettings)
    .set({ value: null as unknown, updatedAt: now })
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, cadenceKey(id))));

  // Remove from index
  const allCadences = await listCadences(db, ownerId);
  const ids = allCadences.map((c) => c.id).filter((cid) => cid !== id);
  await upsertSetting(db, ownerId, INDEX_KEY, ids);
  return true;
}

export async function attachCadenceToCampaign(
  db: Db,
  ownerId: string,
  campaignId: string,
  cadenceId: string
): Promise<void> {
  await upsertSetting(db, ownerId, attachKey(campaignId), cadenceId);
}

export async function detachCadenceFromCampaign(
  db: Db,
  ownerId: string,
  campaignId: string
): Promise<void> {
  await upsertSetting(db, ownerId, attachKey(campaignId), null);
}

export async function getCadenceForCampaign(
  db: Db,
  ownerId: string,
  campaignId: string
): Promise<CadenceConfig | undefined> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(and(eq(appSettings.ownerId, ownerId), eq(appSettings.key, attachKey(campaignId))))
    .limit(1);
  const cadenceId = row?.value as string | null | undefined;
  if (!cadenceId) return undefined;
  return getCadence(db, ownerId, cadenceId);
}
