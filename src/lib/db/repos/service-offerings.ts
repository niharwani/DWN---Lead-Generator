import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { rowToServiceOffering } from "../adapt";
import { serviceOfferings, type NewServiceOffering } from "../schema";
import type { ServiceOffering } from "@/lib/demo/types";

export async function listServiceOfferings(
  db: Db,
  ownerId: string
): Promise<ServiceOffering[]> {
  const rows = await db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.ownerId, ownerId));
  return rows.map(rowToServiceOffering);
}

export type UpsertServiceInput = Omit<NewServiceOffering, "ownerId" | "id"> & {
  id?: string;
};

export async function createServiceOffering(
  db: Db,
  ownerId: string,
  input: UpsertServiceInput
): Promise<ServiceOffering> {
  const id = input.id ?? crypto.randomUUID();
  const row: NewServiceOffering = { ...input, id, ownerId };
  await db.insert(serviceOfferings).values(row);
  const [stored] = await db
    .select()
    .from(serviceOfferings)
    .where(and(eq(serviceOfferings.ownerId, ownerId), eq(serviceOfferings.id, id)))
    .limit(1);
  if (!stored) throw new Error("Failed to read back created service offering");
  return rowToServiceOffering(stored);
}

export async function updateServiceOffering(
  db: Db,
  ownerId: string,
  id: string,
  patch: Partial<UpsertServiceInput>
): Promise<ServiceOffering | undefined> {
  await db
    .update(serviceOfferings)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(
      and(eq(serviceOfferings.ownerId, ownerId), eq(serviceOfferings.id, id))
    );
  const [stored] = await db
    .select()
    .from(serviceOfferings)
    .where(and(eq(serviceOfferings.ownerId, ownerId), eq(serviceOfferings.id, id)))
    .limit(1);
  return stored ? rowToServiceOffering(stored) : undefined;
}
