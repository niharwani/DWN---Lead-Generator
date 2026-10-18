/**
 * POST /api/invites/send
 *
 * Authenticated. Sends a workspace invite to the given email address.
 * Rate-limited to 20/hour/workspace (invite_send bucket).
 *
 * Anti-enumeration: returns 200 even if the email is already a workspace member
 * so that callers cannot probe for existing members.
 *
 * Body: { email: string, role: "admin" | "member" | "viewer" }
 */

import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/rbac";
import { createInvite } from "@/lib/db/repos/invites";
import { listMembers } from "@/lib/db/repos/workspaces";
import { sendEmail } from "@/lib/email/resend";
import { getRuntimeEnv } from "@/lib/env";
import { assertWithinRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "@/app/api/_lib/response";

const bodySchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member", "viewer"]),
});

export const POST = withErrorHandling(async (req) => {
  const owner = await requireOwner();
  requirePermission(owner, "manage_members");

  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  // Rate limit per workspace
  try {
    assertWithinRateLimit(owner.id, "invite_send");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return jsonError(429, {
        code: "rate_limited",
        message: err.message,
      });
    }
    throw err;
  }

  const db = await getDb();
  const normalizedEmail = body.email.trim().toLowerCase();

  // Anti-enumeration: silently succeed if already a member
  const members = await listMembers(db, owner.id);
  const emailToProfileId: Record<string, string> = {};
  // We need to check if the email corresponds to an existing member.
  // The workspace_members table stores profile_id, not email directly.
  // We do a simple check: query profiles for the email and see if that profile is a member.
  const { profiles } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, normalizedEmail))
    .limit(1);

  if (existingProfile) {
    const isMember = members.some((m) => m.profileId === existingProfile.id);
    if (isMember) {
      // Anti-enumeration: return 200 without sending
      return jsonOk({ sent: true });
    }
    void emailToProfileId; // suppress unused warning
  }

  const { invite, token } = await createInvite(db, {
    workspaceId: owner.id,
    email: normalizedEmail,
    role: body.role,
    invitedBy: owner.profileId,
  });

  // Send invite email via Resend
  const env = await getRuntimeEnv();
  const appBaseUrl = env.APP_BASE_URL ?? "http://localhost:3000";
  const inviteUrl = `${appBaseUrl}/invite/${token}`;

  await sendEmail({
    to: normalizedEmail,
    subject: `You've been invited to ${owner.workspace.name} on Lead Engine`,
    html: `
      <p>Hi there,</p>
      <p><strong>${owner.fullName ?? owner.email}</strong> has invited you to join
      <strong>${owner.workspace.name}</strong> on Lead Engine as a
      <strong>${body.role}</strong>.</p>
      <p>Click the link below to accept the invitation:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>This invitation expires in 7 days.</p>
      <p>If you were not expecting this invitation, you can safely ignore this email.</p>
    `,
    text: `
You've been invited to join ${owner.workspace.name} on Lead Engine as a ${body.role}.

Accept your invitation: ${inviteUrl}

This invitation expires in 7 days.
If you were not expecting this, you can ignore this email.
    `.trim(),
  });

  return jsonOk({
    sent: true,
    inviteId: invite.id,
    expiresAt: invite.expiresAt,
  });
});
