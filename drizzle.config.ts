import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit config for generating D1 SQL migrations.
 *
 * Workflow:
 *   1. Edit schema in `src/lib/db/schema.ts`
 *   2. Run `pnpm db:generate` to produce a new SQL file in `migrations/`
 *   3. Apply locally with `pnpm db:migrate:local` (uses Wrangler + the D1 binding)
 *   4. Apply remotely with `pnpm db:migrate:remote` after `wrangler d1 create`
 *
 * We do NOT point drizzle-kit at a direct DB URL in production — all D1 access
 * goes through the Wrangler-managed binding at runtime.
 */
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
  verbose: true,
  strict: true,
} satisfies Config;
