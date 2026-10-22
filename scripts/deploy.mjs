#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", shell: true });

if (existsSync(resolve(root, ".open-next"))) rmSync(resolve(root, ".open-next"), { recursive: true, force: true });
if (existsSync(resolve(root, ".wrangler/dist"))) rmSync(resolve(root, ".wrangler/dist"), { recursive: true, force: true });

// OpenNext >= 1.9 refuses to build against Next.js 15.5 by policy (support-window
// check, not a real incompatibility). Pass the flag so the build proceeds; the
// runtime is unchanged. Revisit when we move to Next 16+.
run("npx opennextjs-cloudflare build --dangerouslyUseUnsupportedNextVersion");
run("node scripts/patch-handler.mjs");
run("npx wrangler deploy --dry-run --outdir .wrangler/dist");
run("node scripts/patch-bundle.mjs .wrangler/dist/worker.js");
run("npx wrangler deploy .wrangler/dist/worker.js --no-bundle");
