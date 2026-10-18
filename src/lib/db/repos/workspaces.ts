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
