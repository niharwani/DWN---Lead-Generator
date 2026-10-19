/**
 * Thin Microsoft Graph API client.
 *
 * Implements the two endpoints the Lead Engine needs via plain fetch
 * (no SDK — Workers-compatible):
 *   - sendMessage  — POST /me/sendMail
 *   - listUnreadReplies — GET /me/messages?$filter=...
 *
 * Mirrors the shape of the Gmail client so the triage cron can treat
 * both providers uniformly when upgraded to multi-provider.
 *
 * Token refresh is transparent: any 401 triggers one refresh attempt.
 */

import { z } from "zod";
import { refreshAccessToken } from "./oauth";
import type { RuntimeEnv } from "@/lib/env";

export type OutlookTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SEND_URL = `${GRAPH_BASE}/me/sendMail`;
const GRAPH_MESSAGES_URL = `${GRAPH_BASE}/me/messages`;

type AuthedRequest = {
  tokens: OutlookTokens;
  env: RuntimeEnv;
  url: string;
  init: RequestInit;
};

async function callWithAuth(
  req: AuthedRequest
): Promise<{ response: Response; tokens: OutlookTokens }> {
  const run = async (tokens: OutlookTokens): Promise<Response> => {
    const headers = new Headers(req.init.headers ?? {});
    headers.set("authorization", `Bearer ${tokens.accessToken}`);
    return fetch(req.url, { ...req.init, headers });
  };

  let tokens = req.tokens;
  let response = await run(tokens);
  if (response.status === 401) {
    tokens = await refreshAccessToken(tokens, req.env);
    response = await run(tokens);
  }
  return { response, tokens };
}

export type SendMessageInput = {
  to: string;
  subject: string;
  body: string;
  from: string;
  replyTo?: string;
  tokens: OutlookTokens;
  env: RuntimeEnv;
};

export type SendMessageResult = {
  /** Outlook message ID from the x-ms-request-id header or the message list */
  messageId: string;
  /** Conversation ID (equivalent to Gmail threadId for reply matching) */
  threadId: string;
  tokens: OutlookTokens;
};

const sentMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
});

/**
 * Send an email via Microsoft Graph. The Graph sendMail endpoint returns 202
 * with no body, so we fetch the sent item immediately after to get the IDs.
 * Returns the (possibly refreshed) tokens so the caller can persist them.
 */
export async function sendMessage(
  input: SendMessageInput
): Promise<SendMessageResult> {
  if (!input.to) throw new Error("Outlook sendMessage: `to` is required");
  if (!input.subject) throw new Error("Outlook sendMessage: `subject` is required");
  if (!input.body) throw new Error("Outlook sendMessage: `body` is required");

  const payload = {
    message: {
      subject: input.subject,
      body: { contentType: "Text", content: input.body },
      toRecipients: [{ emailAddress: { address: input.to } }],
      ...(input.replyTo
        ? { replyTo: [{ emailAddress: { address: input.replyTo } }] }
        : {}),
    },
    saveToSentItems: true,
  };

  const { response, tokens } = await callWithAuth({
    tokens: input.tokens,
    env: input.env,
    url: GRAPH_SEND_URL,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Outlook sendMail failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }

  // sendMail returns 202 with empty body. Fetch the most recent sent message
  // to retrieve the IDs.
  const sentUrl =
    `${GRAPH_BASE}/me/mailFolders/SentItems/messages` +
    `?$top=1&$orderby=sentDateTime+desc&$select=id,conversationId`;

  const { response: fetchResp, tokens: finalTokens } = await callWithAuth({
    tokens,
    env: input.env,
    url: sentUrl,
    init: { method: "GET" },
  });

  const raw: unknown = await fetchResp.json().catch(() => ({}));
  const valueSchema = z.object({
    value: z.array(sentMessageSchema).min(1),
  });
  const parsed = valueSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.value[0]) {
    // Non-fatal — return placeholder IDs rather than crashing
    return { messageId: "unknown", threadId: "unknown", tokens: finalTokens };
  }

  const msg = parsed.data.value[0];
  return {
    messageId: msg.id,
    threadId: msg.conversationId,
    tokens: finalTokens,
  };
}

const messageListSchema = z.object({
  value: z
    .array(
      z.object({
        id: z.string().min(1),
        conversationId: z.string().min(1),
        subject: z.string().optional().default(""),
        receivedDateTime: z.string().optional().default(""),
        from: z
          .object({
            emailAddress: z
              .object({ address: z.string().optional().default("") })
              .optional()
              .default({ address: "" }),
          })
          .optional()
          .default({ emailAddress: { address: "" } }),
        body: z.object({ content: z.string().optional().default("") }).optional().default({ content: "" }),
      })
    )
    .optional()
    .default([]),
});

export type UnreadReply = {
  messageId: string;
  /** conversationId — stored in the gmailThreadId column regardless of provider */
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
};

export type ListUnreadRepliesInput = {
  afterIso: string;
  tokens: OutlookTokens;
  env: RuntimeEnv;
};

export type ListUnreadRepliesResult = {
  replies: UnreadReply[];
  tokens: OutlookTokens;
};

/**
 * List unread inbox messages received after the given ISO timestamp.
 * Matches the same shape as Gmail listUnreadReplies so cron handlers can be
 * upgraded to multi-provider without a rewrite.
 */
export async function listUnreadReplies(
  input: ListUnreadRepliesInput
): Promise<ListUnreadRepliesResult> {
  const filter = `isRead eq false and receivedDateTime ge '${input.afterIso}'`;
  const select = "id,subject,from,receivedDateTime,conversationId,body";
  const url = `${GRAPH_MESSAGES_URL}?$filter=${encodeURIComponent(filter)}&$top=50&$select=${select}`;

  const { response, tokens } = await callWithAuth({
    tokens: input.tokens,
    env: input.env,
    url,
    init: { method: "GET" },
  });

  const raw: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Outlook messages list failed: HTTP ${response.status}`);
  }

  const parsed = messageListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Outlook messages list returned unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`
    );
  }

  const replies: UnreadReply[] = parsed.data.value.map((m) => ({
    messageId: m.id,
    threadId: m.conversationId,
    from: m.from?.emailAddress?.address ?? "",
    subject: m.subject ?? "",
    snippet: (m.body?.content ?? "").slice(0, 300),
    receivedAt: m.receivedDateTime ?? new Date().toISOString(),
  }));

  return { replies, tokens };
}
