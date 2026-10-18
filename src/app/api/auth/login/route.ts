/**
 * POST /api/auth/login
 *
 * Accepts { email } and sends a magic-link to the provided address.
 * Rate-limited to 5 requests/minute/IP (bucket: magic_link).
 * Always returns 200 regardless of whether the email is registered (anti-enumeration).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getRuntimeEnv } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { createMagicLinkToken } from "@/lib/auth/magic-link";
import { sendEmail } from "@/lib/email/resend";
import { assertWithinRateLimit, RateLimitError } from "@/lib/rate-limit";
import { jsonError } from "@/app/api/_lib/response";

const BodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest): Promise<Response> {
  // Rate limit by IP
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    assertWithinRateLimit(ip, "magic_link");
  } catch (err) {
    if (err instanceof RateLimitError) {
      return jsonError(429, {
        code: "rate_limited",
        message: `Too many login requests. Try again in ~${err.retryAfterSeconds}s.`,
      });
    }
    throw err;
  }

  let email: string;
  try {
    const body = BodySchema.parse(await req.json());
    email = body.email.trim().toLowerCase();
  } catch {
    return jsonError(400, {
      code: "invalid_request",
      message: "A valid email address is required.",
    });
  }

  const env = await getRuntimeEnv();
  const appBaseUrl = env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  try {
    const db = await getDb();
    const rawToken = await createMagicLinkToken(db, email);
    const magicLink = `${appBaseUrl}/api/auth/callback?token=${rawToken}`;

    await sendEmail({
      to: email,
      subject: "Your login link",
      text: `Click this link to sign in:\n\n${magicLink}\n\nThis link expires in 15 minutes and can only be used once.`,
      html: `<p>Click the link below to sign in:</p><p><a href="${magicLink}">${magicLink}</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
    });
  } catch (err) {
    // Log but don't expose the error — still return 200 to prevent enumeration
    console.error("[auth/login] Error sending magic link:", err);
  }

  // Always return 200 regardless of whether the email exists
  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
