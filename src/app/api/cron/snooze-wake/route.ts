/**
 * POST /api/cron/snooze-wake — daily 02:15 UTC snooze expiry sweep.
 *
 * Protected by X-DWN-Cron-Secret header.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db/client";
import { runAllOwnerSnoozeWake } from "@/lib/cron/snooze-wake";

export const dynamic = "force-dynamic";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readCronSecret(): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const cfEnv = env as Record<string, unknown>;
    const val = cfEnv.CRON_SECRET ?? process.env.CRON_SECRET;
    return typeof val === "string" && val.length > 0 ? val : undefined;
  } catch {
    const val = process.env.CRON_SECRET;
    return typeof val === "string" && val.length > 0 ? val : undefined;
  }
}

export async function POST(req: Request): Promise<Response> {
  const secret = await readCronSecret();
  if (!secret) {
    return jsonResponse(503, { error: "CRON_SECRET not configured" });
  }
  const supplied = req.headers.get("x-dwn-cron-secret");
  if (supplied !== secret) {
    return jsonResponse(401, { error: "invalid cron secret" });
  }

  const db = await getDb();
  const results = await runAllOwnerSnoozeWake(db);

  return jsonResponse(200, { results });
}
