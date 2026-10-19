/**
 * Unit tests for the Razorpay client wrapper.
 *
 * Mocks globalThis.fetch to verify:
 *   - Auth header is Basic base64(keyId:secret)
 *   - Correct endpoints are used for each function
 *   - Request bodies contain expected fields
 *   - Dev stub mode activates when RAZORPAY_KEY_ID is absent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock environment
// ---------------------------------------------------------------------------

const TEST_KEY_ID = "rzp_test_key_id_abc";
const TEST_KEY_SECRET = "rzp_test_key_secret_xyz";
const EXPECTED_AUTH = `Basic ${btoa(`${TEST_KEY_ID}:${TEST_KEY_SECRET}`)}`;

// Mock getRuntimeEnv to inject test credentials
vi.mock("@/lib/env", () => ({
  getRuntimeEnv: vi.fn(),
}));

import { getRuntimeEnv } from "@/lib/env";
import {
  createSubscription,
  getSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  createCustomer,
  getCustomer,
} from "@/lib/billing/razorpay";

function mockFetchSuccess(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

beforeEach(() => {
  (getRuntimeEnv as ReturnType<typeof vi.fn>).mockResolvedValue({
    RAZORPAY_KEY_ID: TEST_KEY_ID,
    RAZORPAY_KEY_SECRET: TEST_KEY_SECRET,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// createSubscription
// ---------------------------------------------------------------------------

describe("createSubscription", () => {
  it("calls POST /subscriptions with correct auth and body", async () => {
    const mockFetch = mockFetchSuccess({
      id: "sub_test001",
      short_url: "https://rzp.io/l/test001",
      status: "created",
      plan_id: "plan_frl001",
      customer_id: null,
      current_start: null,
      current_end: null,
      ended_at: null,
      quantity: 1,
      notes: { workspace_id: "ws_001" },
      total_count: 120,
      paid_count: 0,
      remaining_count: 120,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await createSubscription({
      planId: "plan_frl001",
      workspaceId: "ws_001",
      totalCount: 120,
    });

    expect(result.id).toBe("sub_test001");
    expect(result.short_url).toBe("https://rzp.io/l/test001");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions");
    expect((options.headers as Record<string, string>).Authorization).toBe(EXPECTED_AUTH);
    expect(options.method).toBe("POST");

    const requestBody = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(requestBody.plan_id).toBe("plan_frl001");
    expect(requestBody.total_count).toBe(120);
    expect((requestBody.notes as Record<string, string>).workspace_id).toBe("ws_001");
  });
});

// ---------------------------------------------------------------------------
// getSubscription
// ---------------------------------------------------------------------------

describe("getSubscription", () => {
  it("calls GET /subscriptions/:id with correct auth", async () => {
    const mockFetch = mockFetchSuccess({
      id: "sub_test002",
      short_url: "https://rzp.io/l/test002",
      status: "active",
      plan_id: "plan_teams001",
      customer_id: "cust_001",
      current_start: 1700000000,
      current_end: 1702592000,
      ended_at: null,
      quantity: 1,
      notes: null,
      total_count: 120,
      paid_count: 1,
      remaining_count: 119,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await getSubscription("sub_test002");
    expect(result.id).toBe("sub_test002");
    expect(result.status).toBe("active");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions/sub_test002");
    expect((options.headers as Record<string, string>).Authorization).toBe(EXPECTED_AUTH);
    expect(options.method).toBe("GET");
  });
});

// ---------------------------------------------------------------------------
// cancelSubscription
// ---------------------------------------------------------------------------

describe("cancelSubscription", () => {
  it("calls POST /subscriptions/:id/cancel with cancel_at_cycle_end=1 by default", async () => {
    const mockFetch = mockFetchSuccess({ id: "sub_test003", status: "cancelled" });
    vi.stubGlobal("fetch", mockFetch);

    await cancelSubscription("sub_test003");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions/sub_test003/cancel");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.cancel_at_cycle_end).toBe(1);
  });

  it("sends cancel_at_cycle_end=0 for immediate cancel", async () => {
    const mockFetch = mockFetchSuccess({ id: "sub_test003", status: "cancelled" });
    vi.stubGlobal("fetch", mockFetch);

    await cancelSubscription("sub_test003", false);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.cancel_at_cycle_end).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pauseSubscription
// ---------------------------------------------------------------------------

describe("pauseSubscription", () => {
  it("calls POST /subscriptions/:id/pause with pause_at=now", async () => {
    const mockFetch = mockFetchSuccess({ id: "sub_test004", status: "paused" });
    vi.stubGlobal("fetch", mockFetch);

    await pauseSubscription("sub_test004");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions/sub_test004/pause");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.pause_at).toBe("now");
  });
});

// ---------------------------------------------------------------------------
// resumeSubscription
// ---------------------------------------------------------------------------

describe("resumeSubscription", () => {
  it("calls POST /subscriptions/:id/resume with resume_at=now", async () => {
    const mockFetch = mockFetchSuccess({ id: "sub_test005", status: "active" });
    vi.stubGlobal("fetch", mockFetch);

    await resumeSubscription("sub_test005");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions/sub_test005/resume");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.resume_at).toBe("now");
  });
});

// ---------------------------------------------------------------------------
// createCustomer
// ---------------------------------------------------------------------------

describe("createCustomer", () => {
  it("calls POST /customers with correct auth and body", async () => {
    const mockFetch = mockFetchSuccess({
      id: "cust_test001",
      name: "Test Workspace",
      email: "test@example.com",
      contact: null,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await createCustomer({
      name: "Test Workspace",
      email: "test@example.com",
    });

    expect(result.id).toBe("cust_test001");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/customers");
    expect((options.headers as Record<string, string>).Authorization).toBe(EXPECTED_AUTH);
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.name).toBe("Test Workspace");
    expect(body.email).toBe("test@example.com");
  });
});

// ---------------------------------------------------------------------------
// getCustomer
// ---------------------------------------------------------------------------

describe("getCustomer", () => {
  it("calls GET /customers/:id", async () => {
    const mockFetch = mockFetchSuccess({
      id: "cust_test002",
      name: "Another Workspace",
      email: "another@example.com",
      contact: null,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await getCustomer("cust_test002");
    expect(result.id).toBe("cust_test002");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/customers/cust_test002");
    expect(options.method).toBe("GET");
  });
});

// ---------------------------------------------------------------------------
// Dev stub mode
// ---------------------------------------------------------------------------

describe("dev stub mode (no credentials)", () => {
  beforeEach(() => {
    (getRuntimeEnv as ReturnType<typeof vi.fn>).mockResolvedValue({
      RAZORPAY_KEY_ID: undefined,
      RAZORPAY_KEY_SECRET: undefined,
    });
    // Ensure NODE_ENV is not production for stub test
    vi.stubEnv("NODE_ENV", "test");
  });

  it("returns a stub response without calling fetch", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await createSubscription({
      planId: "plan_frl001",
      workspaceId: "ws_stub",
    });

    expect(result.id).toMatch(/^stub_/);
    expect(result.short_url).toMatch(/^https:\/\/rzp\.io\/l\/stub-/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
