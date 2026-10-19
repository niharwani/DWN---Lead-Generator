/**
 * POST /api/outlook/disconnect
 *
 * Owner-only. Deletes the stored Outlook token row. The owner can revoke
 * the actual token from their Microsoft account security settings.
 */

import { and, eq } from "drizzle-orm";
import { requireOwner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import { jsonOk, withErrorHandling } from "../../_lib/response";

export const runtime = "nodejs";

const OUTLOOK_TOKENS_KEY = "outlook_tokens/v1";

export const POST = withErrorHandling(async () => {
  const owner = await requireOwner();
  const db = await getDb();

  await db
    .delete(appSettings)
    .where(
      and(
        eq(appSettings.ownerId, owner.id),
        eq(appSettings.key, OUTLOOK_TOKENS_KEY)
      )
    );

  return jsonOk({ ok: true });
});
