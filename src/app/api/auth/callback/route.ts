/**
 * GET /api/auth/callback?token=…
 *
 * Verifies and consumes a magic-link token, upserts the profile, ensures a
 * workspace exists, creates a session, sets the cookie, then redirects to:
 *   - /onboarding  if the workspace has no completed onboarding (onboarding_state is null)
 *   - /            otherwise
 */

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { verifyAndConsumeMagicLinkToken } from "@/lib/auth/magic-link";
import { setSessionCookie } from "@/lib/auth/sessions";
import { createSession } from "@/lib/db/repos/sessions";
import {
  getWorkspacesForProfile,
  createWorkspace,
  generateSlug,
  findUniqueSlug,
} from "@/lib/db/repos/workspaces";
import { jsonError } from "@/app/api/_lib/response";

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const rawToken = searchParams.get("token");

  if (!rawToken) {
    return jsonError(400, {
      code: "missing_token",
      message: "No token provided.",
    });
  }

  const db = await getDb();

  const result = await verifyAndConsumeMagicLinkToken(db, rawToken);

  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "This login link has expired. Please request a new one."
        : result.reason === "consumed"
        ? "This login link has already been used. Please request a new one."
        : "Invalid login link.";
    // Redirect to login with an error param
    return Response.redirect(new URL(`/login?error=${result.reason}`, req.url));
  }

  const { email } = result;

  // Upsert profile
  const [existingProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  let profileId: string;
  let isNewUser = false;

  if (existingProfile) {
    profileId = existingProfile.id;
  } else {
    profileId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(profiles).values({
      id: profileId,
      email,
      fullName: null,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    });
    isNewUser = true;
  }

  // Ensure a workspace exists
  const workspacesForProfile = await getWorkspacesForProfile(db, profileId);
  let workspaceId: string;
  let needsOnboarding = false;

  if (workspacesForProfile.length === 0) {
    // New user — create a free workspace
    const localPart = email.split("@")[0] ?? email;
    const baseSlug = generateSlug(localPart);
    const slug = await findUniqueSlug(db, baseSlug);
    const ws = await createWorkspace(db, {
      name: `${localPart}'s workspace`,
      slug,
      plan: "free",
      ownerProfileId: profileId,
    });
    workspaceId = ws.id;
    needsOnboarding = true; // onboarding_state is null → go through wizard
  } else {
    const firstWs = workspacesForProfile[0];
    if (!firstWs) {
      return jsonError(500, { code: "no_workspace", message: "No workspace found for profile." });
    }
    workspaceId = firstWs.id;
    // Check if onboarding is complete
    const onboardingState = firstWs.onboardingState;
    needsOnboarding = !onboardingState || !(onboardingState as { completed?: boolean }).completed;
  }

  // Create session
  const ipAddress =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for") ??
    undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const session = await createSession(db, {
    profileId,
    activeWorkspaceId: workspaceId,
    ipAddress,
    userAgent,
  });

  await setSessionCookie(session.id);

  // Redirect
  const destination = needsOnboarding ? "/onboarding" : "/";
  return Response.redirect(new URL(destination, req.url));
}
