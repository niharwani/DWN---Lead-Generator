/**
 * Server-only env resolver.
 *
 * Reads Worker bindings via `getCloudflareContext` and merges a small subset
 * of `process.env` fallbacks so adapters work the same in `pnpm dev` and in
 * production. Only keys that are explicitly intended to be optional secrets
 * are exposed here — this is not a generic env dump.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type RuntimeEnv = Readonly<Record<string, string | undefined>>;

const EXPOSED_KEYS = [
  "GOOGLE_PLACES_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_MODEL_HAIKU",
  "PAGESPEED_API_KEY",
  "DEV_OWNER_EMAIL",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REDIRECT_URI",
  "CRON_SECRET",
  // Phase A additions
  "RESEND_API_KEY",
  "MAIL_FROM",
  "SESSION_COOKIE_SECRET",
  "APP_BASE_URL",
  // Phase E additions — Razorpay billing
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_PLAN_ID_FREELANCER_MONTHLY",
  "RAZORPAY_PLAN_ID_FREELANCER_ANNUAL",
  "RAZORPAY_PLAN_ID_TEAMS_MONTHLY",
  "RAZORPAY_PLAN_ID_TEAMS_ANNUAL",
  "BILLING_RETURN_URL",
  // Phase G additions — Outlook (Microsoft Graph)
  "OUTLOOK_CLIENT_ID",
  "OUTLOOK_CLIENT_SECRET",
  "OUTLOOK_REDIRECT_URI",
] as const;

export async function getRuntimeEnv(): Promise<RuntimeEnv> {
  const { env } = await getCloudflareContext({ async: true });
  const out: Record<string, string | undefined> = {};
  const cfEnv = env as Record<string, unknown>;
  for (const k of EXPOSED_KEYS) {
    const raw = cfEnv[k] ?? process.env[k];
    out[k] = typeof raw === "string" && raw.length > 0 ? raw : undefined;
  }
  return out;
}
