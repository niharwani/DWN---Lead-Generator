/**
 * Discord webhook dispatcher.
 *
 * Sends a message to a Discord webhook URL.
 * Returns true on success, false on any failure (non-throwing by design).
 */

export type DiscordMessage = {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }>;
};

export async function sendDiscordNotification(
  webhookUrl: string,
  message: DiscordMessage
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
