/**
 * POST /api/waitlist
 *
 * Unauthenticated waitlist capture for the soft-launch period.
 * Zod validates the body, rate-limits by IP (waitlist bucket: 10/hour),
 * persists the row, and sends a notification email to MAIL_FROM.
 *
 * Returns 200 { ok: true } always (anti-enumeration: same response on
 * duplicate email or invalid email so callers can't probe membership).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { addToWaitlist } from "@/lib/db/repos/waitlist";
import { assertWithinRateLimit, RateLimitError } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/resend";
import { getRuntimeEnv } from "@/lib/env";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional(),
  requestedPlan: z.enum(["freelancer", "teams", "studio"]).optional(),
  note: z.string().trim().max(1000).optional(),
  source: z
    .enum(["pricing_page", "billing_page", "settings_banner", "checkout_cta"])
    .optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate-limit by IP (use CF header if present, fallback to x-forwarded-for)
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  try {
    assertWithinRateLimit(ip, "waitlist");
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Still return 200 to avoid timing-based enumeration
      return NextResponse.json({ ok: true });
    }
    throw err;
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      // Anti-enumeration: return 200 even on invalid payload
      return NextResponse.json({ ok: true });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const db = await getDb();
    const userAgent = request.headers.get("user-agent") ?? undefined;

    await addToWaitlist(db, {
      email: body.email,
      phone: body.phone,
      requestedPlan: body.requestedPlan,
      note: body.note,
      source: body.source,
      userAgent,
    });

    // Notification to admin inbox — fire and forget
    void sendWaitlistNotification(body).catch((err) =>
      console.error("[waitlist] Notification send failed:", err)
    );
  } catch (err) {
    // Log but still return 200
    console.error("[waitlist] DB write failed:", err);
  }

  return NextResponse.json({ ok: true });
}

async function sendWaitlistNotification(
  entry: z.infer<typeof bodySchema>
): Promise<void> {
  const env = await getRuntimeEnv();
  const adminEmail = env.MAIL_FROM;
  if (!adminEmail) return;

  const planLabel = entry.requestedPlan ?? "not specified";
  const sourceLabel = entry.source ?? "unknown";
  const note = entry.note ? `\n\nNote: ${entry.note}` : "";
  const phone = entry.phone ? `\nPhone: ${entry.phone}` : "";

  await sendEmail({
    to: adminEmail,
    from: adminEmail,
    subject: `[Lead Engine] New waitlist signup: ${entry.email}`,
    text: `New waitlist entry\n\nEmail: ${entry.email}${phone}\nPlan interest: ${planLabel}\nSource: ${sourceLabel}${note}\n\nTime: ${new Date().toISOString()}`,
    html: `<h2>New waitlist entry</h2><table><tr><td><strong>Email</strong></td><td>${entry.email}</td></tr>${entry.phone ? `<tr><td><strong>Phone</strong></td><td>${entry.phone}</td></tr>` : ""}<tr><td><strong>Plan interest</strong></td><td>${planLabel}</td></tr><tr><td><strong>Source</strong></td><td>${sourceLabel}</td></tr>${entry.note ? `<tr><td><strong>Note</strong></td><td>${entry.note}</td></tr>` : ""}<tr><td><strong>Time</strong></td><td>${new Date().toISOString()}</td></tr></table>`,
  });
}
