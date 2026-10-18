/**
 * Billing enforcement primitives.
 *
 * These are the building blocks that mutations will call.
 * In Phase E they are wired only to the new billing API routes and UI.
 * A follow-up integration pass will add `checkLimit()` / `requireFeature()`
 * calls to the existing server actions in `src/lib/actions.ts`.
 */

import type { Owner } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getPlan, type Feature, type MeteredResource } from "./plans";
import { getCurrentPeriodUsage, incrementUsage as dbIncrementUsage } from "@/lib/db/repos/usage";
import type { WorkspaceUsage } from "@/lib/db/schema";

/* --------------------------------------------------------------------------
 * Internal helpers
 * -------------------------------------------------------------------------- */

function buildUpgradeTo(currentPlan: string): string {
  const upgrades: Record<string, string> = {
    free: "freelancer",
    freelancer: "teams",
    teams: "studio",
    studio: "studio",
  };
  return upgrades[currentPlan] ?? "freelancer";
}

function usageFieldForResource(
  resource: MeteredResource
): keyof Omit<WorkspaceUsage, "workspaceId" | "periodYyyyMm"> {
  const map: Record<MeteredResource, keyof Omit<WorkspaceUsage, "workspaceId" | "periodYyyyMm">> = {
    audits: "auditsUsed",
    ai_drafts: "aiDraftsUsed",
    reply_triages: "replyTriagesUsed",
    enrichments: "enrichmentsUsed",
    discovery_runs: "discoveryRunsUsed",
    gmail_sends: "gmailSendsUsed",
  };
  return map[resource];
}

/* --------------------------------------------------------------------------
 * requireFeature
 * -------------------------------------------------------------------------- */

/**
 * Assert the owner's workspace plan includes a feature.
 * Throws a 402 Response if not entitled so any server action / route handler
 * can `await requireFeature(owner, 'webhooks')` at the top and exit early.
 */
export function requireFeature(owner: Owner, feature: Feature): void {
  const plan = getPlan(owner.workspace.plan);
  if (!plan.features.includes(feature)) {
    const upgradeTo = buildUpgradeTo(owner.workspace.plan);
    throw new Response(
      JSON.stringify({
        error: {
          code: "feature_locked",
          message: `The "${feature}" feature is not available on the ${plan.name} plan. Upgrade to ${upgradeTo} to unlock it.`,
          feature,
          currentPlan: owner.workspace.plan,
          upgradeTo,
        },
      }),
      { status: 402, headers: { "content-type": "application/json" } }
    );
  }
}

/* --------------------------------------------------------------------------
 * checkLimit
 * -------------------------------------------------------------------------- */

/**
 * Assert the current period's usage for a metered resource is below the plan
 * cap. When the plan's limit for the resource is null (unlimited), this is a
 * no-op. Throws a 402 Response when at or over the cap.
 */
export async function checkLimit(
  owner: Owner,
  resource: MeteredResource
): Promise<void> {
  const plan = getPlan(owner.workspace.plan);
  const cap = plan.limits[resource] ?? null;

  // null = unlimited → always allowed
  if (cap === null) return;

  const db = await getDb();
  const usage = await getCurrentPeriodUsage(db, owner.id);
  const field = usageFieldForResource(resource);
  const used = usage ? (usage[field] as number) : 0;

  if (used >= cap) {
    const upgradeTo = buildUpgradeTo(owner.workspace.plan);
    throw new Response(
      JSON.stringify({
        error: {
          code: "limit_exceeded",
          message: `You have reached your monthly ${resource} limit (${cap}). Upgrade to ${upgradeTo} for a higher limit.`,
          resource,
          used,
          cap,
          currentPlan: owner.workspace.plan,
          upgradeTo,
        },
      }),
      { status: 402, headers: { "content-type": "application/json" } }
    );
  }
}

/* --------------------------------------------------------------------------
 * incrementUsage
 * -------------------------------------------------------------------------- */

/**
 * Increment the current period's usage counter for a metered resource.
 * Upserts the workspace_usage row for the current UTC calendar month.
 * Period format: YYYYMM (e.g. "202610").
 */
export async function incrementUsage(
  owner: Owner,
  resource: MeteredResource,
  n = 1
): Promise<void> {
  const db = await getDb();
  await dbIncrementUsage(db, owner.id, resource, n);
}

/* --------------------------------------------------------------------------
 * getCurrentUsage
 * -------------------------------------------------------------------------- */

/**
 * Read the current period's usage row for the given workspace.
 * Returns null if no usage has been recorded yet this period.
 */
export async function getCurrentUsage(
  workspaceId: string
): Promise<WorkspaceUsage | null> {
  const db = await getDb();
  return getCurrentPeriodUsage(db, workspaceId);
}
