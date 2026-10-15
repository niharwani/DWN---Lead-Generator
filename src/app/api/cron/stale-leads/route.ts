/**
 * POST /api/cron/stale-leads — daily stale-lead digest trigger.
 *
 * Protected by the shared `CRON_SECRET` header. Resolves the first non-demo
 * profile (single-tenant) and runs the digest. Also writes an activity so the
 * digest shows up in Nihar's timeline even if the Gmail-send step is wired
 * later.
 */

import { and, asc, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { createActivity } from "@/lib/db/repos";
import { buildDigestHtml, findStaleLeads } from "@/lib/cron/stale-leads";

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

  const nowIso = new Date().toISOString();
  const result = await findStaleLeads(db, owner.id, nowIso);
  const html = buildDigestHtml(result);

  await createActivity(db, owner.id, {
    activityType: "digest_generated",
    title: "Daily stale-lead digest",
    description: `${result.overdueTasks.length} overdue · ${result.stuckLeads.length} stuck · ${result.dormantQualified.length} dormant`,
    metadata: {
      overdueTasks: result.overdueTasks.length,
      stuckLeads: result.stuckLeads.length,
      dormantQualified: result.dormantQualified.length,
    },
  });

  return jsonResponse(200, {
    ownerId: owner.id,
    generatedAt: nowIso,
    counts: {
      overdueTasks: result.overdueTasks.length,
      stuckLeads: result.stuckLeads.length,
      dormantQualified: result.dormantQualified.length,
    },
    result,
    html,
  });
}
