/**
 * POST /api/workspaces/switch
 *
 * Switches the active workspace for the current session.
 * Body: { workspaceId: string }
 *
 * Verifies that the requesting user is a member of the target workspace before
 * updating the session. Redirects to referrer or / on success.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getMemberRole } from "@/lib/db/repos/workspaces";
import { setActiveWorkspace } from "@/lib/db/repos/sessions";
import { jsonError } from "@/app/api/_lib/response";

const BodySchema = z.object({
  workspaceId: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<Response> {
  const owner = await requireOwner();

  let workspaceId: string;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let raw: unknown;
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      raw = { workspaceId: form.get("workspaceId") };
    } else {
      raw = await req.json();
    }
    const body = BodySchema.parse(raw);
    workspaceId = body.workspaceId;
  } catch {
    return jsonError(400, {
      code: "invalid_request",
      message: "workspaceId is required.",
    });
  }

  const db = await getDb();

  // Verify membership
  const role = await getMemberRole(db, workspaceId, owner.profileId);
  if (!role) {
    return jsonError(403, {
      code: "forbidden",
      message: "You are not a member of that workspace.",
    });
  }

  // Update session
  if (owner._sessionId) {
    await setActiveWorkspace(db, owner._sessionId, workspaceId);
  }

  // Redirect back to referrer or /
  const referrer = req.headers.get("referer");
  const destination = referrer && referrer.startsWith(new URL(req.url).origin)
    ? referrer
    : "/";

  return Response.redirect(new URL(destination, req.url));
}
