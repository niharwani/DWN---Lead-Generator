/**
 * Unified notification dispatcher.
 *
 * Routes to in-app activity log + email (via Resend) + Slack + Discord based
 * on the workspace's notification preferences.
 *
 * Never throws — each channel failure is logged and silently swallowed so one
 * broken webhook doesn't abort the cron.
 */

import { sendSlackNotification } from "./slack";
import { sendDiscordNotification } from "./discord";
import type { NotificationPrefs } from "@/lib/db/repos/notification-prefs";

export type NotificationEvent =
  | "hot_lead_alert"
  | "reply_received"
  | "reply_triage_done"
  | "bounce_detected"
  | "follow_up_due"
  | "unsubscribe_detected"
  | "digest_ready"
  | "webhook_probe";

export type NotificationPayload = {
  event: NotificationEvent;
  title: string;
  body: string;
  leadId?: string;
  metadata?: Record<string, unknown>;
};

export type NotifyResult = {
  channels: {
    inApp: boolean;
    email: boolean;
    slack: boolean;
    discord: boolean;
  };
};

/**
 * Dispatch a notification to all channels the owner has enabled.
 *
 * @param prefs     Owner's notification preferences (loaded from appSettings)
 * @param payload   The event to broadcast
 * @param env       Runtime env for Resend key etc.
 */
export async function notify(
  prefs: NotificationPrefs,
  payload: NotificationPayload,
  env: Readonly<Record<string, string | undefined>>
): Promise<NotifyResult> {
  const result: NotifyResult = {
    channels: { inApp: false, email: false, slack: false, discord: false },
  };

  // In-app: always "sent" — caller is responsible for persisting the activity
  result.channels.inApp = true;

  // Email via Resend
  if (prefs.emailEnabled && prefs.emailAddress) {
    try {
      const resendKey = env.RESEND_API_KEY;
      if (resendKey) {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "DWN Lead Engine <noreply@dwn.studio>",
            to: [prefs.emailAddress],
            subject: payload.title,
            text: payload.body,
          }),
        });
        result.channels.email = resp.ok;
      }
    } catch {
      result.channels.email = false;
    }
  }

  // Slack
  if (prefs.slackEnabled && prefs.slackWebhookUrl) {
    result.channels.slack = await sendSlackNotification(prefs.slackWebhookUrl, {
      text: `*${payload.title}*\n${payload.body}`,
    });
  }

  // Discord
  if (prefs.discordEnabled && prefs.discordWebhookUrl) {
    result.channels.discord = await sendDiscordNotification(prefs.discordWebhookUrl, {
      embeds: [
        {
          title: payload.title,
          description: payload.body,
          color: 0x6366f1,
        },
      ],
    });
  }

  return result;
}
