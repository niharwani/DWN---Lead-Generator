import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { rowToDraft } from "../adapt";
import { outreachDrafts, type NewOutreachDraft } from "../schema";
import type {
  OutreachChannel,
  OutreachDraft,
  OutreachStatus,
  ReplySentiment,
} from "@/lib/demo/types";

export async function listDrafts(
  db: Db,
  ownerId: string,
  filter?: { status?: OutreachStatus; leadId?: string }
): Promise<OutreachDraft[]> {
  const conditions = [eq(outreachDrafts.ownerId, ownerId)];
  if (filter?.status) conditions.push(eq(outreachDrafts.status, filter.status));
  if (filter?.leadId) conditions.push(eq(outreachDrafts.leadId, filter.leadId));
  const rows = await db
    .select()
    .from(outreachDrafts)
    .where(and(...conditions))
    .orderBy(desc(outreachDrafts.updatedAt));
  return rows.map(rowToDraft);
}

export async function getDraft(
  db: Db,
  ownerId: string,
  id: string
): Promise<OutreachDraft | undefined> {
  const [row] = await db
    .select()
    .from(outreachDrafts)
    .where(and(eq(outreachDrafts.ownerId, ownerId), eq(outreachDrafts.id, id)))
    .limit(1);
  return row ? rowToDraft(row) : undefined;
}

export type CreateDraftInput = {
  id?: string;
  leadId: string;
  campaignId?: string;
  channel: OutreachChannel;
  subject?: string;
  body: string;
  personalizationEvidence?: string[];
  source?: "template" | "ai";
  variantGroup?: string;
  variantLabel?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function createDraft(
  db: Db,
  ownerId: string,
  input: CreateDraftInput
): Promise<OutreachDraft> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const row: NewOutreachDraft = {
    id,
    ownerId,
    leadId: input.leadId,
    campaignId: input.campaignId ?? null,
    channel: input.channel,
    subject: input.subject ?? null,
    body: input.body,
    personalizationEvidence: input.personalizationEvidence ?? [],
    status: "needs_review", // spec §11 — every draft starts here
    source: input.source ?? "template",
    needsHumanReview: true,
    variantGroup: input.variantGroup ?? null,
    variantLabel: input.variantLabel ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  await db.insert(outreachDrafts).values(row);
  const created = await getDraft(db, ownerId, id);
  if (!created) throw new Error("Failed to read back created draft");
  return created;
}

/**
 * Status transitions. Enforces that `approved_at` and `contacted_at` can only
 * be set by the matching transition — never passed in as a raw column write.
 */
export async function transitionDraft(
  db: Db,
  ownerId: string,
  id: string,
  nextStatus: OutreachStatus,
  opts?: { replySentiment?: ReplySentiment }
): Promise<OutreachDraft | undefined> {
  const now = new Date().toISOString();
  const update: Partial<NewOutreachDraft> = {
    status: nextStatus,
    updatedAt: now,
  };
  if (nextStatus === "approved") update.approvedAt = now;
  if (nextStatus === "contacted") update.contactedAt = now;
  if (nextStatus === "replied") {
    update.repliedAt = now;
    if (opts?.replySentiment) update.replySentiment = opts.replySentiment;
  }

  await db
    .update(outreachDrafts)
    .set(update)
    .where(and(eq(outreachDrafts.ownerId, ownerId), eq(outreachDrafts.id, id)));
  return await getDraft(db, ownerId, id);
}

export async function updateDraftBody(
  db: Db,
  ownerId: string,
  id: string,
  patch: { subject?: string | null; body?: string; personalizationEvidence?: string[] }
): Promise<OutreachDraft | undefined> {
  const update: Partial<NewOutreachDraft> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.subject !== undefined) update.subject = patch.subject;
  if (patch.body != null) update.body = patch.body;
  if (patch.personalizationEvidence)
    update.personalizationEvidence = patch.personalizationEvidence;

  await db
    .update(outreachDrafts)
    .set(update)
    .where(and(eq(outreachDrafts.ownerId, ownerId), eq(outreachDrafts.id, id)));
  return await getDraft(db, ownerId, id);
}
