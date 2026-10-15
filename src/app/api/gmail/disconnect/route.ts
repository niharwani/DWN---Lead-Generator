/**
 * POST /api/gmail/disconnect
 *
 * Owner-only. Deletes the stored Gmail token row so the owner is prompted to
 * re-consent next time they click "Connect Gmail". We do not try to revoke
 * the token against Google — that is a separate operation the owner can run
 * from their Google account page.
 */

import { and, eq } from "drizzle-orm";
import { requireOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import { jsonOk, withErrorHandling } from "../../_lib/response";

export const runtime = "nodejs";

const GMAIL_TOKENS_KEY = "gmail_tokens/v1";

export const POST = withErrorHandling(async () => {
  const owner = await requireOwner();
  const db = await getDb();

  await db
    .delete(appSettings)
    .where(
      and(
        eq(appSettings.ownerId, owner.id),
        eq(appSettings.key, GMAIL_TOKENS_KEY)
      )
    );

  return jsonOk({ ok: true });
});
