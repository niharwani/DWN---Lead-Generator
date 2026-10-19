/**
 * Billing webhook integration tests (Razorpay).
 *
 * Simulates Razorpay webhook events against the handler logic in isolation.
 * Uses an in-memory mock for the database layer — no real D1 required.
 *
 * Verifies:
 *   - subscription.authenticated → subscription ID stored
 *   - subscription.activated     → plan activated based on plan_id
 *   - subscription.cancelled     → plan downgraded to free
 *   - subscription.completed     → plan downgraded to free
 *   - payment.failed             → billing_state flag set
 *   - subscription.charged       → billing_state flag cleared
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// In-memory workspace store (mimics the repos)
// ---------------------------------------------------------------------------

type WorkspaceRow = {
  id: string;
  plan: string;
  razorpayCustomerId: string | null;
  razorpaySubscriptionId: string | null;
  trialEndsAt: string | null;
};

type SettingsRow = {
  ownerId: string;
  key: string;
  value: unknown;
};

function createInMemoryStore() {
  const workspaceMap = new Map<string, WorkspaceRow>();
  const customerToWorkspace = new Map<string, string>();
  const subscriptionToWorkspace = new Map<string, string>();
  const settings: SettingsRow[] = [];

  return {
    workspaceMap,
    customerToWorkspace,
    subscriptionToWorkspace,
    settings,

    addWorkspace(row: WorkspaceRow) {
      workspaceMap.set(row.id, { ...row });
      if (row.razorpayCustomerId) {
        customerToWorkspace.set(row.razorpayCustomerId, row.id);
      }
      if (row.razorpaySubscriptionId) {
        subscriptionToWorkspace.set(row.razorpaySubscriptionId, row.id);
      }
    },

    getWorkspace(id: string): WorkspaceRow | undefined {
      return workspaceMap.get(id);
    },

    updateRazorpayFields(
      workspaceId: string,
      fields: Partial<
        Pick<
          WorkspaceRow,
          "plan" | "razorpayCustomerId" | "razorpaySubscriptionId" | "trialEndsAt"
        >
      >
    ) {
      const row = workspaceMap.get(workspaceId);
      if (!row) return;
      Object.assign(row, fields);
      if (fields.razorpayCustomerId) {
        customerToWorkspace.set(fields.razorpayCustomerId, workspaceId);
      }
      if (fields.razorpaySubscriptionId) {
        subscriptionToWorkspace.set(fields.razorpaySubscriptionId, workspaceId);
      }
    },

    getByRazorpayCustomerId(customerId: string): WorkspaceRow | undefined {
      const wsId = customerToWorkspace.get(customerId);
      return wsId ? workspaceMap.get(wsId) : undefined;
    },

    getByRazorpaySubscriptionId(subscriptionId: string): WorkspaceRow | undefined {
      const wsId = subscriptionToWorkspace.get(subscriptionId);
      return wsId ? workspaceMap.get(wsId) : undefined;
    },

    setSetting(ownerId: string, key: string, value: unknown) {
      const existing = settings.find((s) => s.ownerId === ownerId && s.key === key);
      if (existing) {
        existing.value = value;
      } else {
        settings.push({ ownerId, key, value });
      }
    },

    getSetting(ownerId: string, key: string): unknown {
      return settings.find((s) => s.ownerId === ownerId && s.key === key)?.value;
    },
  };
}

// ---------------------------------------------------------------------------
// Webhook event handler under test (extracted from the route logic)
// ---------------------------------------------------------------------------

type BillingState = {
  paymentFailed: boolean;
  failedAt?: string;
  clearedAt?: string;
  paymentId?: string;
  subscriptionId?: string;
};

type SubEntity = {
  id: string;
  plan_id: string;
  customer_id: string | null;
  status: string;
  notes: Record<string, string> | null;
};

type PayEntity = {
  id: string;
  subscription_id: string | null;
  customer_id: string | null;
  status: string;
  error_code: string | null;
};

type RazorpayEvent = {
  event: string;
  created_at: number;
  payload: {
    subscription?: { entity: SubEntity };
    payment?: { entity: PayEntity };
  };
};

async function handleWebhookEvent(
  event: RazorpayEvent,
  store: ReturnType<typeof createInMemoryStore>,
  env: {
    RAZORPAY_PLAN_ID_FREELANCER_MONTHLY?: string;
    RAZORPAY_PLAN_ID_TEAMS_MONTHLY?: string;
  }
): Promise<void> {
  const subEntity = event.payload?.subscription?.entity;
  const payEntity = event.payload?.payment?.entity;

  function planFromPlanId(planId: string): string {
    if (planId === env.RAZORPAY_PLAN_ID_FREELANCER_MONTHLY) return "freelancer";
    if (planId === env.RAZORPAY_PLAN_ID_TEAMS_MONTHLY) return "teams";
    return "freelancer";
  }

  switch (event.event) {
    case "subscription.authenticated": {
      if (!subEntity) break;
      const workspaceId = subEntity.notes?.workspace_id;
      if (workspaceId) {
        store.updateRazorpayFields(workspaceId, {
          razorpaySubscriptionId: subEntity.id,
        });
      }
      break;
    }

    case "subscription.activated": {
      if (!subEntity) break;
      const workspaceId = subEntity.notes?.workspace_id;
      let workspace = workspaceId ? store.getWorkspace(workspaceId) : null;
      if (!workspace && subEntity.customer_id) {
        workspace = store.getByRazorpayCustomerId(subEntity.customer_id) ?? null;
      }
      if (!workspace) break;

      const plan = planFromPlanId(subEntity.plan_id);
      store.updateRazorpayFields(workspace.id, {
        plan,
        razorpaySubscriptionId: subEntity.id,
      });
      store.setSetting(workspace.id, "billing_state/v1", {
        paymentFailed: false,
        clearedAt: new Date().toISOString(),
      });
      break;
    }

    case "subscription.charged": {
      if (!subEntity) break;
      let workspace = store.getByRazorpaySubscriptionId(subEntity.id) ?? null;
      if (!workspace && subEntity.customer_id) {
        workspace = store.getByRazorpayCustomerId(subEntity.customer_id) ?? null;
      }
      if (!workspace) break;
      store.setSetting(workspace.id, "billing_state/v1", {
        paymentFailed: false,
        clearedAt: new Date().toISOString(),
      });
      break;
    }

    case "subscription.halted": {
      if (!subEntity) break;
      let workspace = store.getByRazorpaySubscriptionId(subEntity.id) ?? null;
      if (!workspace && subEntity.customer_id) {
        workspace = store.getByRazorpayCustomerId(subEntity.customer_id) ?? null;
      }
      if (!workspace) break;
      store.setSetting(workspace.id, "billing_state/v1", {
        paymentFailed: true,
        failedAt: new Date().toISOString(),
        subscriptionId: subEntity.id,
      });
      break;
    }

    case "subscription.cancelled":
    case "subscription.completed": {
      if (!subEntity) break;
      let workspace = store.getByRazorpaySubscriptionId(subEntity.id) ?? null;
      if (!workspace && subEntity.customer_id) {
        workspace = store.getByRazorpayCustomerId(subEntity.customer_id) ?? null;
      }
      if (!workspace) break;
      store.updateRazorpayFields(workspace.id, {
        plan: "free",
        razorpaySubscriptionId: undefined,
      });
      break;
    }

    case "payment.failed": {
      if (!payEntity) break;
      let workspace = null;
      if (payEntity.subscription_id) {
        workspace = store.getByRazorpaySubscriptionId(payEntity.subscription_id) ?? null;
      }
      if (!workspace && payEntity.customer_id) {
        workspace = store.getByRazorpayCustomerId(payEntity.customer_id) ?? null;
      }
      if (!workspace) break;
      store.setSetting(workspace.id, "billing_state/v1", {
        paymentFailed: true,
        failedAt: new Date().toISOString(),
        paymentId: payEntity.id,
        errorCode: payEntity.error_code,
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_test_billing";
const CUSTOMER_ID = "cust_test123";
const SUBSCRIPTION_ID = "sub_test456";
const FREELANCER_PLAN_ID = "plan_freelancer_mo_test";
const TEAMS_PLAN_ID = "plan_teams_mo_test";
const TEST_ENV = {
  RAZORPAY_PLAN_ID_FREELANCER_MONTHLY: FREELANCER_PLAN_ID,
  RAZORPAY_PLAN_ID_TEAMS_MONTHLY: TEAMS_PLAN_ID,
};

function makeSubEvent(eventType: string, overrides: Partial<SubEntity> = {}): RazorpayEvent {
  return {
    event: eventType,
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      subscription: {
        entity: {
          id: SUBSCRIPTION_ID,
          plan_id: FREELANCER_PLAN_ID,
          customer_id: CUSTOMER_ID,
          status: "active",
          notes: { workspace_id: WORKSPACE_ID },
          ...overrides,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("subscription.authenticated → subscription ID stored", () => {
  it("stores subscription ID on workspace when notes contain workspace_id", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "free",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: null,
      trialEndsAt: null,
    });

    await handleWebhookEvent(makeSubEvent("subscription.authenticated"), store, TEST_ENV);

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.razorpaySubscriptionId).toBe(SUBSCRIPTION_ID);
  });
});

describe("subscription.activated → plan activated", () => {
  it("sets plan to freelancer when plan_id matches FREELANCER_MONTHLY", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "free",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: null,
      trialEndsAt: null,
    });

    await handleWebhookEvent(makeSubEvent("subscription.activated"), store, TEST_ENV);

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.plan).toBe("freelancer");
    expect(ws?.razorpaySubscriptionId).toBe(SUBSCRIPTION_ID);
  });

  it("sets plan to teams when plan_id matches TEAMS_MONTHLY", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "free",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: null,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      makeSubEvent("subscription.activated", { plan_id: TEAMS_PLAN_ID }),
      store,
      TEST_ENV
    );

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.plan).toBe("teams");
  });

  it("clears payment-failed state on activation", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "free",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: null,
      trialEndsAt: null,
    });
    store.setSetting(WORKSPACE_ID, "billing_state/v1", { paymentFailed: true });

    await handleWebhookEvent(makeSubEvent("subscription.activated"), store, TEST_ENV);

    const state = store.getSetting(WORKSPACE_ID, "billing_state/v1") as BillingState;
    expect(state.paymentFailed).toBe(false);
  });
});

describe("subscription.cancelled → plan downgraded", () => {
  it("sets plan to free on cancellation", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "freelancer",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });

    await handleWebhookEvent(makeSubEvent("subscription.cancelled"), store, TEST_ENV);

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.plan).toBe("free");
  });
});

describe("subscription.completed → plan downgraded", () => {
  it("sets plan to free when subscription runs out of cycles", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "teams",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });

    await handleWebhookEvent(makeSubEvent("subscription.completed"), store, TEST_ENV);

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.plan).toBe("free");
  });
});

describe("payment.failed → billing_state flag set", () => {
  it("stores paymentFailed=true in billing_state/v1 setting", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "freelancer",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      {
        event: "payment.failed",
        created_at: Math.floor(Date.now() / 1000),
        payload: {
          payment: {
            entity: {
              id: "pay_test_001",
              subscription_id: SUBSCRIPTION_ID,
              customer_id: CUSTOMER_ID,
              status: "failed",
              error_code: "BAD_REQUEST_ERROR",
            },
          },
        },
      },
      store,
      TEST_ENV
    );

    const state = store.getSetting(WORKSPACE_ID, "billing_state/v1") as BillingState;
    expect(state).toBeDefined();
    expect(state.paymentFailed).toBe(true);
    expect(state.paymentId).toBe("pay_test_001");
  });
});

describe("subscription.charged → billing_state flag cleared", () => {
  it("clears paymentFailed flag on successful charge", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "freelancer",
      razorpayCustomerId: CUSTOMER_ID,
      razorpaySubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });
    // Pre-set failed state
    store.setSetting(WORKSPACE_ID, "billing_state/v1", { paymentFailed: true });

    await handleWebhookEvent(makeSubEvent("subscription.charged"), store, TEST_ENV);

    const state = store.getSetting(WORKSPACE_ID, "billing_state/v1") as BillingState;
    expect(state.paymentFailed).toBe(false);
    expect(state.clearedAt).toBeDefined();
  });
});
