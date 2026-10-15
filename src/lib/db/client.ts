/**
 * D1 Drizzle client resolver.
 *
 * In OpenNext Cloudflare, Cloudflare bindings (D1, R2, KV, Queues, secrets)
 * are available via `getCloudflareContext()`. In dev, `initOpenNextCloudflareForDev`
 * (called from `next.config.ts`) wires Wrangler's local bindings so this same
 * import works for both `pnpm dev` and production.
 *
 * `getCloudflareContext` is called with `async: true` so the context is
 * resolved consistently across both runtimes. The returned Drizzle instance is
 * cached per request.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

let _cached: { db: Db; env: unknown } | null = null;

export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  if (_cached && _cached.env === env) return _cached.db;
  const d1 = (env as { DB?: D1Database }).DB;
  if (!d1) {
    throw new Error(
      "D1 binding `DB` not found. Ensure `wrangler.jsonc` has a `d1_databases` entry " +
        "with binding `DB` and that migrations have been applied with `pnpm db:migrate:local`."
    );
  }
  const db = drizzle(d1, { schema });
  _cached = { db, env };
  return db;
}

export { schema };
