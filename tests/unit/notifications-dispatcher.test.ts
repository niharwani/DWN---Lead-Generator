import { describe, it, expect, vi, afterEach } from "vitest";
import { notify } from "@/lib/notifications/dispatcher";
import type { NotificationPrefs } from "@/lib/db/repos/notification-prefs";

afterEach(() => {
  vi.restoreAllMocks();
});

const PAYLOAD: Parameters<typeof notify>[1] = {
  event: "hot_lead_alert",
  title: "Test notification",
  body: "This is a test.",
};

describe("notify dispatcher", () => {
  it("always marks inApp as true", async () => {
    const prefs: NotificationPrefs = {
      emailEnabled: false,
      slackEnabled: false,
      discordEnabled: false,
      digestFrequency: "never",
      hotLeadAlerts: false,
      replyAlerts: false,
      bounceAlerts: false,
    };
    const result = await notify(prefs, PAYLOAD, {});
    expect(result.channels.inApp).toBe(true);
  });

  it("skips email when emailEnabled is false", async () => {
    const prefs: NotificationPrefs = {
      emailEnabled: false,
      emailAddress: "test@example.com",
      slackEnabled: false,
      discordEnabled: false,
      digestFrequency: "never",
      hotLeadAlerts: true,
      replyAlerts: true,
      bounceAlerts: true,
    };
    const result = await notify(prefs, PAYLOAD, { RESEND_API_KEY: "key" });
    expect(result.channels.email).toBe(false);
  });

  it("skips Slack when slackEnabled is false", async () => {
    const prefs: NotificationPrefs = {
      emailEnabled: false,
      slackEnabled: false,
      slackWebhookUrl: "https://hooks.slack.com/test",
      discordEnabled: false,
      digestFrequency: "never",
      hotLeadAlerts: true,
      replyAlerts: true,
      bounceAlerts: true,
    };
    const result = await notify(prefs, PAYLOAD, {});
    expect(result.channels.slack).toBe(false);
  });

  it("sends to Slack when enabled and URL provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const prefs: NotificationPrefs = {
      emailEnabled: false,
      slackEnabled: true,
      slackWebhookUrl: "https://hooks.slack.com/test",
      discordEnabled: false,
      digestFrequency: "never",
      hotLeadAlerts: true,
      replyAlerts: true,
      bounceAlerts: true,
    };
    const result = await notify(prefs, PAYLOAD, {});
    expect(result.channels.slack).toBe(true);
  });

  it("sends to Discord when enabled and URL provided", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const prefs: NotificationPrefs = {
      emailEnabled: false,
      slackEnabled: false,
      discordEnabled: true,
      discordWebhookUrl: "https://discord.com/api/webhooks/test",
      digestFrequency: "never",
      hotLeadAlerts: true,
      replyAlerts: true,
      bounceAlerts: true,
    };
    const result = await notify(prefs, PAYLOAD, {});
    expect(result.channels.discord).toBe(true);
  });

  it("gracefully handles Slack webhook failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const prefs: NotificationPrefs = {
      emailEnabled: false,
      slackEnabled: true,
      slackWebhookUrl: "https://hooks.slack.com/test",
      discordEnabled: false,
      digestFrequency: "never",
      hotLeadAlerts: true,
      replyAlerts: true,
      bounceAlerts: true,
    };
    const result = await notify(prefs, PAYLOAD, {});
    expect(result.channels.slack).toBe(false);
    expect(result.channels.inApp).toBe(true); // in-app still works
  });
});
