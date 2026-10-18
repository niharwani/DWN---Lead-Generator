/**
 * POST /api/invites/accept
 *
 * Unauthenticated at the HTTP level — the invite token is the proof of
 * authorization. However, the accepting user must be signed in (session
 * cookie) so we know which profile to add to the workspace.
 *
 * If no session is present: redirects to /login?return=/invite/<token>.
 * If the token is invalid, expired, or already used: returns 400.
 * On success: adds the profile to workspace_members with the stored role
 * and redirects to /overview.
 *
 * Body: { token: string }
 */

import { z } from "zod";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getOwner } from "@/lib/auth/session";
import { getInviteByRawToken, markAccepted } from "@/lib/db/repos/invites";
import { addMember } from "@/lib/db/repos/workspaces";
import { recordAuditLog } from "@/lib/audit-log/writer";
import {
  jsonError,
  jsonOk,
  parseJson,
  withErrorHandling,
} from "@/app/api/_lib/response";

const bodySchema = z.object({
  token: z.string().min(1).max(256),
});

export const POST = withErrorHandling(async (req) => {
  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  // Require a session to know who is accepting
  const owner = await getOwner();
  if (!owner) {
    // Redirect to login with a return URL.
    // The invite landing page already handles this before POSTing here,
    // but guard defensively.
    redirect(`/login?return=/invite/${body.token}`);
  }

  const db = await getDb();
  const invite = await getInviteByRawToken(db, body.token);

  if (!invite) {
    return jsonError(400, {
      code: "invalid_invite",
      message: "This invite link is invalid or does not exist.",
    });
  }

  const now = new Date().toISOString();

  if (invite.expiresAt < now) {
    return jsonError(400, {
      code: "invite_expired",
      message: "This invite link has expired. Ask your workspace owner to send a new one.",
    });
  }

  if (invite.acceptedAt) {
    return jsonError(400, {
      code: "invite_already_used",
      message: "This invite has already been accepted.",
    });
  }

  // Add the accepting profile to the workspace
  await addMember(db, invite.workspaceId, owner.profileId, invite.role as "owner" | "admin" | "member" | "viewer", invite.invitedBy);

  // Mark invite as consumed
  await markAccepted(db, invite.id);

  // Write audit log entry (fail-silent)
  await recordAuditLog(
    invite.workspaceId,
    owner.profileId,
    "invited",
    "member",
    owner.profileId,
    { email: invite.email, role: invite.role, inviteId: invite.id }
  );

  return jsonOk({ accepted: true, workspaceId: invite.workspaceId, role: invite.role });
});
