/**
 * Slack incoming-webhook dispatcher.
 *
 * Sends a simple text/blocks message to a Slack incoming webhook URL.
 * Returns true on success, false on any failure (non-throwing by design).
 */

export type SlackMessage = {
  text: string;
  blocks?: Array<Record<string, unknown>>;
};

export async function sendSlackNotification(
  webhookUrl: string,
  message: SlackMessage
): Promise<boolean> {
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
