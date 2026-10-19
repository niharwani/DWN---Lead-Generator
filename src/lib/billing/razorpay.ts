/**
 * Thin fetch wrapper around the Razorpay REST API v1.
 *
 * No `razorpay` npm package — calls are plain fetch to https://api.razorpay.com/v1/*
 * following the same pattern as `src/lib/email/resend.ts`.
 *
 * Authentication: HTTP Basic Auth with base64(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).
 *
 * Dev stub: if RAZORPAY_KEY_ID is unset in a non-production environment,
 * functions log and return placeholder responses so local development works
 * without Razorpay credentials.
 *
 * Production: absence of RAZORPAY_KEY_ID throws loudly at call time.
 */

import { getRuntimeEnv } from "@/lib/env";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

/* --------------------------------------------------------------------------
 * Internal helpers
 * -------------------------------------------------------------------------- */

async function getAuthHeader(): Promise<string | null> {
  const env = await getRuntimeEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null;
  const credentials = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${btoa(credentials)}`;
}

async function razorpayRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const authHeader = await getAuthHeader();

  if (!authHeader) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured in production");
    }
    // Dev stub
    console.log(`[Razorpay stub] ${method} ${path}`, body ?? "");
    return {
      id: `stub_${crypto.randomUUID()}`,
      short_url: `https://rzp.io/l/stub-${crypto.randomUUID().slice(0, 8)}`,
      status: "created",
    } as T;
  }

  const url = `${RAZORPAY_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: authHeader,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(`Razorpay API error ${response.status} on ${method} ${path}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/* --------------------------------------------------------------------------
 * Public types
 * -------------------------------------------------------------------------- */

export type RazorpaySubscription = {
  id: string;
  /** The hosted short URL for the customer to authorize + pay */
  short_url: string;
  /** created | authenticated | active | halted | completed | cancelled | pending */
  status: string;
  plan_id: string;
  customer_id: string | null;
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  quantity: number;
  notes: Record<string, string> | null;
  total_count: number;
  paid_count: number;
  remaining_count: number;
};

export type RazorpayCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  contact: string | null;
};

/* --------------------------------------------------------------------------
 * Subscriptions
 * -------------------------------------------------------------------------- */

/**
 * Create a Razorpay Subscription for a workspace to subscribe to a plan.
 *
 * @param planId         - Razorpay plan ID (e.g. "plan_xxxxxxxx")
 * @param workspaceId    - stored in subscription notes for webhook resolution
 * @param totalCount     - number of billing cycles (e.g. 120 for monthly, 10 for annual)
 * @param customerNotify - whether Razorpay emails the customer (0 = no, 1 = yes)
 * @param notes          - extra key/value pairs attached to the subscription
 */
export async function createSubscription(params: {
  planId: string;
  workspaceId: string;
  totalCount?: number;
  customerNotify?: 0 | 1;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: params.planId,
    total_count: params.totalCount ?? 120,
    quantity: 1,
    customer_notify: params.customerNotify ?? 1,
    notes: {
      workspace_id: params.workspaceId,
      ...params.notes,
    },
  });
}

/**
 * Retrieve a Razorpay Subscription by ID.
 */
export async function getSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "GET",
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );
}

/**
 * Cancel a Razorpay Subscription.
 *
 * @param cancelAtCycleEnd - true = cancel at end of current billing cycle; false = immediate
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtCycleEnd = true
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "POST",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 }
  );
}

/**
 * Pause a Razorpay Subscription.
 *
 * @param pauseAt - "now" to pause immediately
 */
export async function pauseSubscription(
  subscriptionId: string,
  pauseAt: "now" = "now"
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "POST",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/pause`,
    { pause_at: pauseAt }
  );
}

/**
 * Resume a paused Razorpay Subscription.
 *
 * @param resumeAt - "now" to resume immediately
 */
export async function resumeSubscription(
  subscriptionId: string,
  resumeAt: "now" = "now"
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    "POST",
    `/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
    { resume_at: resumeAt }
  );
}

/* --------------------------------------------------------------------------
 * Customers
 * -------------------------------------------------------------------------- */

/**
 * Create a Razorpay Customer.
 */
export async function createCustomer(params: {
  name: string;
  email: string;
  contact?: string;
}): Promise<RazorpayCustomer> {
  return razorpayRequest<RazorpayCustomer>("POST", "/customers", {
    name: params.name,
    email: params.email,
    ...(params.contact ? { contact: params.contact } : {}),
  });
}

/**
 * Retrieve a Razorpay Customer by ID.
 */
export async function getCustomer(customerId: string): Promise<RazorpayCustomer> {
  return razorpayRequest<RazorpayCustomer>(
    "GET",
    `/customers/${encodeURIComponent(customerId)}`
  );
}

/* --------------------------------------------------------------------------
 * Webhook signature verification
 * -------------------------------------------------------------------------- */

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the raw body with HMAC-SHA256 using the webhook secret
 * (no timestamp prefix — simpler than Stripe). The expected value is placed
 * in the `X-Razorpay-Signature` header as a hex digest.
 *
 * @param rawBody  The raw request body as a string (must not be parsed/re-serialized).
 * @param header   The value of the `X-Razorpay-Signature` header.
 * @param secret   The webhook secret configured in the Razorpay dashboard.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string,
  secret: string
): Promise<boolean> {
  if (!header || !secret) return false;

  const keyBytes = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payloadBytes = new TextEncoder().encode(rawBody);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    payloadBytes.buffer as ArrayBuffer
  );

  const expectedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  return constantTimeEquals(header.trim(), expectedHex);
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
