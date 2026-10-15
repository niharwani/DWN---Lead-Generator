/**
 * POST /api/cron/re-audit — monthly re-audit sweep trigger.
 *
 * Protected by the shared `CRON_SECRET` header rather than an owner session
 * because this is invoked by a Cloudflare Cron Trigger worker, not a human.
 * Owner resolution: the first non-demo profile in the DB (single-tenant).
 */

import { and, asc, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db/client";
import { getRuntimeEnv } from "@/lib/env";
import { profiles } from "@/lib/db/schema";
import { runReauditSweep } from "@/lib/cron/re-audit";

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
  const [owner] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.isDemo, false)))
    .orderBy(asc(profiles.createdAt))
    .limit(1);

  if (!owner) {
    return jsonResponse(404, { error: "no non-demo owner profile found" });
  }

  const env = await getRuntimeEnv();
  const result = await runReauditSweep(db, owner.id, env);
  return jsonResponse(200, {
    ownerId: owner.id,
    ...result,
  });
}
