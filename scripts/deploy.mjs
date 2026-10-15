#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", shell: true });

if (existsSync(resolve(root, ".open-next"))) rmSync(resolve(root, ".open-next"), { recursive: true, force: true });
if (existsSync(resolve(root, ".wrangler/dist"))) rmSync(resolve(root, ".wrangler/dist"), { recursive: true, force: true });

run("npx opennextjs-cloudflare build");
run("node scripts/patch-handler.mjs");
run("npx wrangler deploy --dry-run --outdir .wrangler/dist");
run("node scripts/patch-bundle.mjs .wrangler/dist/worker.js");
run("npx wrangler deploy .wrangler/dist/worker.js --no-bundle");
