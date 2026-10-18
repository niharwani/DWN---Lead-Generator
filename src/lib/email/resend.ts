/**
 * Resend email transport.
 *
 * Thin fetch wrapper around the Resend REST API (no SDK — same pattern as
 * `src/lib/outreach/draft.ts`). Reads `RESEND_API_KEY` and `MAIL_FROM` from
 * the runtime env.
 *
 * In development with no API key set, emails are logged to the console and
 * the function resolves without error (stubbed). In production the absence of
 * a key throws loudly.
 */

import { getRuntimeEnv } from "@/lib/env";

export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
};

export type SendEmailResult = {
  id: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const env = await getRuntimeEnv();
  const apiKey = env.RESEND_API_KEY;
  const defaultFrom = env.MAIL_FROM ?? "noreply@example.com";

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured in production");
    }
    // Dev stub: log and return a fake id
    console.log("[Resend stub] Would send email:", {
      to: input.to,
      from: input.from ?? defaultFrom,
      subject: input.subject,
      text: input.text ?? "(html only)",
    });
    return { id: `dev_${crypto.randomUUID()}` };
  }

  const body = {
    from: input.from ?? defaultFrom,
    to: [input.to],
    subject: input.subject,
    ...(input.html ? { html: input.html } : {}),
    ...(input.text ? { text: input.text } : {}),
  };

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `Resend API error ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as { id: string };
  return { id: data.id };
}
