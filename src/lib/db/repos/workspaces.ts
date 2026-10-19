/**
 * Workspace repository.
 *
 * Every function that mutates workspace data takes the workspace id explicitly.
 * Membership checks are the caller's responsibility — these functions assume
 * the caller has already verified the requesting profile has the necessary role.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import {
  workspaces,
  workspaceMembers,
  type NewWorkspace,
  type NewWorkspaceMember,
  type Workspace,
  type WorkspaceMember,
} from "../schema";

export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer";

/* --------------------------------------------------------------------------
 * CRUD
 * -------------------------------------------------------------------------- */

export async function createWorkspace(
  db: Db,
  input: {
    id?: string;
    name: string;
    slug: string;
    plan?: "free" | "freelancer" | "teams" | "studio";
    ownerProfileId: string;
  }
): Promise<Workspace> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  const row: NewWorkspace = {
    id,
    name: input.name,
    slug: input.slug,
    plan: input.plan ?? "free",
    onboardingState: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(workspaces).values(row);

  const member: NewWorkspaceMember = {
    workspaceId: id,
    profileId: input.ownerProfileId,
    role: "owner",
    acceptedAt: now,
  };
  await db.insert(workspaceMembers).values(member);

  const ws = await getWorkspace(db, id);
  if (!ws) throw new Error("Failed to read back created workspace");
  return ws;
}

export async function getWorkspace(
  db: Db,
  workspaceId: string
): Promise<Workspace | undefined> {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row;
}

export async function getWorkspacesForProfile(
  db: Db,
  profileId: string
): Promise<Array<Workspace & { role: WorkspaceMemberRole }>> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      stripeCustomerId: workspaces.stripeCustomerId,
      stripeSubscriptionId: workspaces.stripeSubscriptionId,
      razorpayCustomerId: workspaces.razorpayCustomerId,
      razorpaySubscriptionId: workspaces.razorpaySubscriptionId,
      trialEndsAt: workspaces.trialEndsAt,
      onboardingState: workspaces.onboardingState,
      industryPreset: workspaces.industryPreset,
      logoUrl: workspaces.logoUrl,
      accentColor: workspaces.accentColor,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.profileId, profileId));

  return rows as Array<Workspace & { role: WorkspaceMemberRole }>;
}

export async function updateWorkspace(
  db: Db,
  workspaceId: string,
  patch: Partial<Pick<NewWorkspace, "name" | "slug" | "plan" | "onboardingState" | "industryPreset" | "logoUrl" | "accentColor">>
): Promise<Workspace | undefined> {
  const now = new Date().toISOString();
  await db
    .update(workspaces)
    .set({ ...patch, updatedAt: now })
    .where(eq(workspaces.id, workspaceId));
  return getWorkspace(db, workspaceId);
}

/* --------------------------------------------------------------------------
 * Membership helpers
 * -------------------------------------------------------------------------- */

export async function addMember(
  db: Db,
  workspaceId: string,
  profileId: string,
  role: WorkspaceMemberRole = "member",
  invitedBy?: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(workspaceMembers)
    .values({
      workspaceId,
      profileId,
      role,
      invitedBy: invitedBy ?? null,
      invitedAt: invitedBy ? now : null,
      acceptedAt: now,
    })
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.profileId],
      set: { role, updatedAt: now } as Record<string, unknown>,
    });
}

export async function removeMember(
  db: Db,
  workspaceId: string,
  profileId: string
): Promise<void> {
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.profileId, profileId)
      )
    );
}

export async function getMemberRole(
  db: Db,
  workspaceId: string,
  profileId: string
): Promise<WorkspaceMemberRole | undefined> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.profileId, profileId)
      )
    )
    .limit(1);
  return row?.role as WorkspaceMemberRole | undefined;
}

export async function listMembers(
  db: Db,
  workspaceId: string
): Promise<WorkspaceMember[]> {
  return db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
}

/* --------------------------------------------------------------------------
 * Slug helpers
 * -------------------------------------------------------------------------- */

/** Generate a URL-safe slug from a name + email, ensuring uniqueness by appending a suffix. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function isSlugAvailable(
  db: Db,
  slug: string,
  excludeWorkspaceId?: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  if (!row) return true;
  if (excludeWorkspaceId && row.id === excludeWorkspaceId) return true;
  return false;
}

/** Find a unique slug by appending a numeric suffix if the base is taken. */
export async function findUniqueSlug(db: Db, base: string): Promise<string> {
  const available = await isSlugAvailable(db, base);
  if (available) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (await isSlugAvailable(db, candidate)) return candidate;
  }
  // Final fallback with random suffix
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/* -----------------------------------------------------------------
 * Phase C — Profile/branding helpers
 * -----------------------------------------------------------------
 * `name`, `logoUrl`, `accentColor` live on the workspaces table (Phase A).
 * Studio pitch, bio, signature, case-study URL stay in app_settings under
 * key `profile/v1` because they're user-content metadata, not workspace
 * identity. Settings sections import these helpers directly.
 */

import { getSetting, setSetting } from "./settings";

export const PROFILE_KEY = "profile/v1";

export type ProfileSettings = {
  studioName?: string;
  publicWebsite?: string;
  defaultCity?: string;
  defaultCurrency?: string;
  pitch?: string;
  logoUrl?: string;
  accentColor?: string;
  caseStudyUrl?: string;
  signature?: string;
};

export async function getProfileSettings(
  db: Db,
  ownerId: string
): Promise<ProfileSettings> {
  const stored = await getSetting<ProfileSettings>(db, ownerId, PROFILE_KEY);
  return stored ?? {};
}

export async function setProfileSettings(
  db: Db,
  ownerId: string,
  settings: ProfileSettings
): Promise<void> {
  await setSetting(db, ownerId, PROFILE_KEY, settings);
}

export type BrandingInput = {
  name?: string;
  logoUrl?: string;
  accentColor?: string;
  pitch?: string;
};

/**
 * Update workspace branding. Routes:
 *   - name, logoUrl, accentColor → workspaces table
 *   - pitch → profile/v1 app_settings
 * Merges with existing values for both stores.
 */
export async function updateBranding(
  workspaceId: string,
  branding: BrandingInput,
  db: Db
): Promise<void> {
  const workspacePatch: Partial<Pick<NewWorkspace, "name" | "logoUrl" | "accentColor">> = {};
  if (branding.name !== undefined) workspacePatch.name = branding.name;
  if (branding.logoUrl !== undefined) workspacePatch.logoUrl = branding.logoUrl;
  if (branding.accentColor !== undefined) workspacePatch.accentColor = branding.accentColor;
  if (Object.keys(workspacePatch).length > 0) {
    await updateWorkspace(db, workspaceId, workspacePatch);
  }
  if (branding.pitch !== undefined) {
    const existing = await getProfileSettings(db, workspaceId);
    await setProfileSettings(db, workspaceId, { ...existing, pitch: branding.pitch });
  }
}

/* --------------------------------------------------------------------------
 * Phase E — Stripe field helpers (deprecated, kept for backwards compat)
 * -------------------------------------------------------------------------- */

/**
 * @deprecated Use updateRazorpayFields instead.
 * Update Stripe-related fields on a workspace row.
 * Called by the webhook handler and syncBillingStateAction.
 */
export async function updateStripeFields(
  db: Db,
  workspaceId: string,
  fields: {
    customerId?: string;
    subscriptionId?: string;
    trialEndsAt?: string | null;
    plan?: "free" | "freelancer" | "teams" | "studio";
  }
): Promise<Workspace | undefined> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updatedAt: now };

  if (fields.customerId !== undefined) patch.stripeCustomerId = fields.customerId;
  if (fields.subscriptionId !== undefined) patch.stripeSubscriptionId = fields.subscriptionId;
  if (fields.trialEndsAt !== undefined) patch.trialEndsAt = fields.trialEndsAt;
  if (fields.plan !== undefined) patch.plan = fields.plan;

  await db
    .update(workspaces)
    .set(patch as Partial<typeof workspaces.$inferInsert>)
    .where(eq(workspaces.id, workspaceId));

  return getWorkspace(db, workspaceId);
}

/**
 * @deprecated Use getByRazorpayCustomerId instead.
 * Look up a workspace by its Stripe customer ID.
 * Used by the webhook handler to map Stripe events to workspaces.
 */
export async function getByStripeCustomerId(
  db: Db,
  customerId: string
): Promise<Workspace | undefined> {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.stripeCustomerId, customerId))
    .limit(1);
  return row;
}

/* --------------------------------------------------------------------------
 * Phase E (Razorpay swap) — Razorpay field helpers (APPEND ONLY)
 * -------------------------------------------------------------------------- */

/**
 * Update Razorpay-related fields on a workspace row.
 * Called by the checkout route, webhook handler, and syncBillingStateAction.
 */
export async function updateRazorpayFields(
  db: Db,
  workspaceId: string,
  fields: {
    customerId?: string;
    subscriptionId?: string;
    trialEndsAt?: string | null;
    plan?: "free" | "freelancer" | "teams" | "studio";
  }
): Promise<Workspace | undefined> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updatedAt: now };

  if (fields.customerId !== undefined) patch.razorpayCustomerId = fields.customerId;
  if (fields.subscriptionId !== undefined) patch.razorpaySubscriptionId = fields.subscriptionId;
  if (fields.trialEndsAt !== undefined) patch.trialEndsAt = fields.trialEndsAt;
  if (fields.plan !== undefined) patch.plan = fields.plan;

  await db
    .update(workspaces)
    .set(patch as Partial<typeof workspaces.$inferInsert>)
    .where(eq(workspaces.id, workspaceId));

  return getWorkspace(db, workspaceId);
}

/**
 * Look up a workspace by its Razorpay customer ID.
 * Used by the webhook handler to map Razorpay events to workspaces.
 */
export async function getByRazorpayCustomerId(
  db: Db,
  customerId: string
): Promise<Workspace | undefined> {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.razorpayCustomerId, customerId))
    .limit(1);
  return row;
}

/**
 * Look up a workspace by its Razorpay subscription ID.
 * Used by the webhook handler to map Razorpay events to workspaces.
 */
export async function getByRazorpaySubscriptionId(
  db: Db,
  subscriptionId: string
): Promise<Workspace | undefined> {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.razorpaySubscriptionId, subscriptionId))
    .limit(1);
  return row;
}

/**
 * List workspace members with their emails.
 * Used by billing confirmations to find who should receive upgrade emails.
 */
export async function listMembersForDigest(
  db: Db,
  workspaceId: string
): Promise<Array<{ profileId: string; role: string }>> {
  const rows = await db
    .select({
      profileId: workspaceMembers.profileId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows;
}
