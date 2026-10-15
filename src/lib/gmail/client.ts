/**
 * Thin Gmail REST client.
 *
 * The `googleapis` npm package is not Workers-compatible, so this module
 * hand-rolls the three endpoints the Lead Engine actually needs:
 *   - refresh an access token
 *   - send a message (`users.messages.send`)
 *   - list unread replies and hydrate their metadata
 *
 * Everything is `fetch`-based, every response is validated with Zod, and all
 * requests transparently refresh the access token once on a 401.
 */

import { z } from "zod";
import type { RuntimeEnv } from "@/lib/env";
import { buildRawMessage } from "./encode";

export type GmailTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_LIST_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_GET_URL = (id: string) =>
  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`;

const refreshResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * Exchange a refresh token for a fresh access token. The returned object
 * preserves the original `refreshToken` so callers can persist the full pair
 * without an extra read.
 */
export async function refreshAccessToken(
  refreshToken: string,
  env: RuntimeEnv
): Promise<GmailTokens> {
  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Gmail OAuth not configured: set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET"
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const raw: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message =
      typeof raw === "object" && raw !== null && "error" in raw
        ? String((raw as { error?: unknown }).error)
        : `HTTP ${resp.status}`;
    throw new Error(`Gmail token refresh failed: ${message}`);
  }

  const parsed = refreshResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Gmail refresh returned unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`
    );
  }

  return {
    accessToken: parsed.data.access_token,
    refreshToken,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
  };
}

type AuthedRequest = {
  tokens: GmailTokens;
  env: RuntimeEnv;
  init: RequestInit;
  url: string;
};

/**
 * Execute an authenticated Gmail request, transparently refreshing on 401.
 * Returns both the final response and the (possibly rotated) tokens so the
 * caller can persist them.
 */
async function callWithAuth(
  req: AuthedRequest
): Promise<{ response: Response; tokens: GmailTokens }> {
  const run = async (tokens: GmailTokens): Promise<Response> => {
    const headers = new Headers(req.init.headers ?? {});
    headers.set("authorization", `Bearer ${tokens.accessToken}`);
    return fetch(req.url, { ...req.init, headers });
  };

  let tokens = req.tokens;
  let response = await run(tokens);
  if (response.status === 401) {
    tokens = await refreshAccessToken(tokens.refreshToken, req.env);
    response = await run(tokens);
  }
  return { response, tokens };
}

const sendResponseSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
});

export type SendMessageInput = {
  to: string;
  subject: string;
  body: string;
  from: string;
  replyTo?: string;
  tokens: GmailTokens;
  env: RuntimeEnv;
};

export type SendMessageResult = {
  messageId: string;
  threadId: string;
  tokens: GmailTokens;
};

/**
 * Send a plain-text email via Gmail's REST API. Returns the Gmail message +
 * thread IDs plus the (possibly refreshed) token pair.
 */
export async function sendMessage(
  input: SendMessageInput
): Promise<SendMessageResult> {
  const raw = buildRawMessage({
    to: input.to,
    from: input.from,
    subject: input.subject,
    body: input.body,
    replyTo: input.replyTo,
  });

  const { response, tokens } = await callWithAuth({
    tokens: input.tokens,
    env: input.env,
    url: GMAIL_SEND_URL,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  });

  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? JSON.stringify((data as { error: unknown }).error).slice(0, 300)
        : `HTTP ${response.status}`;
    throw new Error(`Gmail send failed: ${message}`);
  }

  const parsed = sendResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Gmail send returned unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`
    );
  }

  return {
    messageId: parsed.data.id,
    threadId: parsed.data.threadId,
    tokens,
  };
}

const listResponseSchema = z.object({
  messages: z
    .array(z.object({ id: z.string().min(1), threadId: z.string().min(1) }))
    .optional()
    .default([]),
  nextPageToken: z.string().optional(),
});

const headerSchema = z.object({
  name: z.string(),
  value: z.string(),
});

const getResponseSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  internalDate: z.string().optional(),
  snippet: z.string().optional().default(""),
  payload: z
    .object({
      headers: z.array(headerSchema).optional().default([]),
    })
    .optional()
    .default({ headers: [] }),
});

export type UnreadReply = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
};

export type ListUnreadRepliesInput = {
  afterIso: string;
  tokens: GmailTokens;
  env: RuntimeEnv;
};

export type ListUnreadRepliesResult = {
  replies: UnreadReply[];
  tokens: GmailTokens;
};

function formatAfterDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`listUnreadReplies: invalid afterIso ${iso}`);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function headerValue(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  const needle = name.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === needle) return h.value;
  }
  return "";
}

/**
 * List unread inbox messages received after the given ISO timestamp. Returns a
 * compact view-model that higher layers can match against outreach drafts to
 * stamp `repliedAt`.
 */
export async function listUnreadReplies(
  input: ListUnreadRepliesInput
): Promise<ListUnreadRepliesResult> {
  const after = formatAfterDate(input.afterIso);
  const query = `is:unread in:inbox after:${after}`;

  const listUrl = `${GMAIL_LIST_URL}?${new URLSearchParams({
    q: query,
    maxResults: "50",
  }).toString()}`;

  const { response: listResp, tokens: listTokens } = await callWithAuth({
    tokens: input.tokens,
    env: input.env,
    url: listUrl,
    init: { method: "GET" },
  });

  const listData: unknown = await listResp.json().catch(() => ({}));
  if (!listResp.ok) {
    throw new Error(`Gmail list failed: HTTP ${listResp.status}`);
  }
  const listParsed = listResponseSchema.safeParse(listData);
  if (!listParsed.success) {
    throw new Error(
      `Gmail list returned unexpected shape: ${listParsed.error.issues[0]?.message ?? "unknown"}`
    );
  }

  let tokens = listTokens;
  const replies: UnreadReply[] = [];

  for (const msg of listParsed.data.messages) {
    const url = `${GMAIL_GET_URL(msg.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`;

    const { response, tokens: nextTokens } = await callWithAuth({
      tokens,
      env: input.env,
      url,
      init: { method: "GET" },
    });
    tokens = nextTokens;

    const raw: unknown = await response.json().catch(() => ({}));
    if (!response.ok) continue;
    const parsed = getResponseSchema.safeParse(raw);
    if (!parsed.success) continue;

    const from = headerValue(parsed.data.payload.headers, "From");
    const subject = headerValue(parsed.data.payload.headers, "Subject");
    const receivedAt = parsed.data.internalDate
      ? new Date(Number(parsed.data.internalDate)).toISOString()
      : new Date().toISOString();

    replies.push({
      messageId: parsed.data.id,
      threadId: parsed.data.threadId,
      from,
      subject,
      snippet: parsed.data.snippet,
      receivedAt,
    });
  }

  return { replies, tokens };
}
