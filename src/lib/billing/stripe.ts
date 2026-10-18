/**
 * Thin fetch wrapper around the Stripe REST API v1.
 *
 * No `stripe` npm package — calls are plain fetch to https://api.stripe.com/v1/*
 * following the same pattern as `src/lib/email/resend.ts`.
 *
 * Dev stub: if STRIPE_SECRET_KEY is unset in a non-production environment,
 * functions log and return placeholder responses so local development works
 * without Stripe credentials.
 *
 * Production: absence of STRIPE_SECRET_KEY throws loudly at call time.
 */

import { getRuntimeEnv } from "@/lib/env";

const STRIPE_BASE = "https://api.stripe.com/v1";

/* --------------------------------------------------------------------------
 * Internal helpers
 * -------------------------------------------------------------------------- */

async function getSecretKey(): Promise<string | null> {
  const env = await getRuntimeEnv();
  return env.STRIPE_SECRET_KEY ?? null;
}

function encodeBody(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
): Promise<T> {
  const apiKey = await getSecretKey();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("STRIPE_SECRET_KEY is not configured in production");
    }
    // Dev stub
    console.log(`[Stripe stub] ${method} ${path}`, params ?? "");
    return { id: `stub_${crypto.randomUUID()}`, object: "stub" } as T;
  }

  const url = `${STRIPE_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  let body: string | undefined;
  let finalUrl = url;

  if (method === "GET" && params) {
    const qs = encodeBody(params);
    if (qs) finalUrl = `${url}?${qs}`;
  } else if (method === "POST" && params) {
    body = encodeBody(params);
  }

  const response = await fetch(finalUrl, { method, headers, body });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(`Stripe API error ${response.status} on ${method} ${path}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
};

export type StripePortalSession = {
  id: string;
  url: string;
};

export type StripeCustomer = {
  id: string;
  email: string | null;
  metadata: Record<string, string>;
};

export type StripeSubscription = {
  id: string;
  status: string;
  current_period_end: number;
  trial_end: number | null;
  customer: string;
  items: {
    data: Array<{ price: { id: string; product: string } }>;
  };
};

/**
 * Create a Stripe Checkout session for a workspace to subscribe to a plan.
 */
export async function createCheckoutSession(params: {
  workspaceId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  trialDays?: number;
}): Promise<StripeCheckoutSession> {
  const body: Record<string, string | number | boolean | undefined | null> = {
    mode: "subscription",
    "line_items[0][price]": params.priceId,
    "line_items[0][quantity]": 1,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    "metadata[workspace_id]": params.workspaceId,
    "subscription_data[metadata][workspace_id]": params.workspaceId,
  };

  if (params.customerId) {
    body.customer = params.customerId;
  }

  if (params.trialDays) {
    body["subscription_data[trial_period_days]"] = params.trialDays;
  }

  return stripeRequest<StripeCheckoutSession>("POST", "/checkout/sessions", body);
}

/**
 * Create a Stripe Customer Portal session for managing an existing subscription.
 */
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  return stripeRequest<StripePortalSession>("POST", "/billing_portal/sessions", {
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

/**
 * Retrieve a Stripe Customer by ID.
 */
export async function getCustomer(customerId: string): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>("GET", `/customers/${encodeURIComponent(customerId)}`);
}

/**
 * Retrieve a Stripe Subscription by ID.
 */
export async function getSubscription(subscriptionId: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    "GET",
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );
}

/* --------------------------------------------------------------------------
 * Webhook signature verification
 * -------------------------------------------------------------------------- */

/**
 * Verify a Stripe webhook signature using the standard `t=...,v1=...` format.
 *
 * Implementation uses the Web Crypto API's HMAC-SHA256 — no stripe-node
 * dependency. Rejects signatures older than 5 minutes (tolerance = 300s).
 *
 * @param rawBody  The raw request body as a string (must not be parsed/re-serialized).
 * @param header   The value of the `stripe-signature` header.
 * @param secret   The webhook endpoint secret (starts with `whsec_`).
 */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string,
  secret: string
): Promise<boolean> {
  // Parse header: "t=1234567890,v1=abc123,v1=def456"
  const parts = header.split(",");
  let timestamp: string | null = null;
  const v1Signatures: string[] = [];

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key === "t") timestamp = val;
    if (key === "v1") v1Signatures.push(val);
  }

  if (!timestamp || v1Signatures.length === 0) return false;

  // Timestamp tolerance: 5 minutes
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(nowSeconds - ts) > 300) return false;

  // Compute expected signature: HMAC-SHA256(secret, "{timestamp}.{rawBody}")
  const signedPayload = `${timestamp}.${rawBody}`;

  // Import the webhook secret key
  // Stripe webhook secrets start with "whsec_" followed by a base64-encoded key
  let keyBytes: Uint8Array;
  if (secret.startsWith("whsec_")) {
    const b64 = secret.slice(6);
    const binaryStr = atob(b64);
    keyBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      keyBytes[i] = binaryStr.charCodeAt(i);
    }
  } else {
    // Fallback: treat as raw string
    keyBytes = new TextEncoder().encode(secret);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payloadBytes = new TextEncoder().encode(signedPayload);
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, payloadBytes.buffer as ArrayBuffer);

  // Convert to hex
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison against all v1 signatures
  for (const v1 of v1Signatures) {
    if (v1.length === signatureHex.length && constantTimeEquals(v1, signatureHex)) {
      return true;
    }
  }
  return false;
}

/** Constant-time string comparison to prevent timing attacks. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
