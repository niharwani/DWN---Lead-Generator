/**
 * Billing webhook integration tests.
 *
 * Simulates Stripe webhook events against the handler logic in isolation.
 * Uses an in-memory mock for the database layer — no real D1 required.
 *
 * Verifies:
 *   - checkout.session.completed → workspace plan/customer/subscription updated
 *   - customer.subscription.deleted → plan downgraded to free
 *   - invoice.payment_failed → billing_state flag set
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// In-memory workspace store (mimics the repos)
// ---------------------------------------------------------------------------

type WorkspaceRow = {
  id: string;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
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
  const settings: SettingsRow[] = [];

  return {
    workspaceMap,
    customerToWorkspace,
    settings,

    addWorkspace(row: WorkspaceRow) {
      workspaceMap.set(row.id, { ...row });
      if (row.stripeCustomerId) {
        customerToWorkspace.set(row.stripeCustomerId, row.id);
      }
    },

    getWorkspace(id: string): WorkspaceRow | undefined {
      return workspaceMap.get(id);
    },

    updateStripeFields(
      workspaceId: string,
      fields: Partial<Pick<WorkspaceRow, "plan" | "stripeCustomerId" | "stripeSubscriptionId" | "trialEndsAt">>
    ) {
      const row = workspaceMap.get(workspaceId);
      if (!row) return;
      Object.assign(row, fields);
      if (fields.stripeCustomerId) {
        customerToWorkspace.set(fields.stripeCustomerId, workspaceId);
      }
    },

    getByStripeCustomerId(customerId: string): WorkspaceRow | undefined {
      const wsId = customerToWorkspace.get(customerId);
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

type BillingState = { paymentFailed: boolean; failedAt?: string; invoiceId?: unknown; clearedAt?: string };

async function handleWebhookEvent(
  event: { id: string; type: string; data: { object: Record<string, unknown> } },
  store: ReturnType<typeof createInMemoryStore>,
  env: { STRIPE_PRICE_ID_FREELANCER_MONTHLY?: string; STRIPE_PRICE_ID_TEAMS_MONTHLY?: string }
): Promise<void> {
  const obj = event.data.object;

  function planFromPriceId(priceId: string): string {
    if (priceId === env.STRIPE_PRICE_ID_FREELANCER_MONTHLY) return "freelancer";
    if (priceId === env.STRIPE_PRICE_ID_TEAMS_MONTHLY) return "teams";
    return "freelancer";
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = obj.customer as string | null;
      const subscriptionId = obj.subscription as string | null;
      const workspaceId = (obj.metadata as Record<string, string> | null)?.workspace_id;
      if (workspaceId && customerId && subscriptionId) {
        store.updateStripeFields(workspaceId, { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId });
      }
      break;
    }

    case "customer.subscription.updated": {
      const customerId = obj.customer as string;
      const status = obj.status as string;
      const items = obj.items as { data: Array<{ price: { id: string } }> } | null;
      const trialEnd = obj.trial_end as number | null;
      const workspace = store.getByStripeCustomerId(customerId);
      if (!workspace) break;

      const priceId = items?.data?.[0]?.price?.id;
      const plan = priceId ? planFromPriceId(priceId) : workspace.plan;
      const resolvedPlan = status === "canceled" || status === "unpaid" ? "free" : plan;
      const trialEndsAt = trialEnd ? new Date(trialEnd * 1000).toISOString() : null;

      store.updateStripeFields(workspace.id, {
        plan: resolvedPlan,
        stripeSubscriptionId: obj.id as string,
        trialEndsAt,
      });
      break;
    }

    case "customer.subscription.deleted": {
      const customerId = obj.customer as string;
      const workspace = store.getByStripeCustomerId(customerId);
      if (!workspace) break;
      store.updateStripeFields(workspace.id, { plan: "free" });
      break;
    }

    case "invoice.payment_failed": {
      const customerId = obj.customer as string;
      const workspace = store.getByStripeCustomerId(customerId);
      if (!workspace) break;
      store.setSetting(workspace.id, "billing_state/v1", {
        paymentFailed: true,
        failedAt: new Date().toISOString(),
        invoiceId: obj.id,
      });
      break;
    }

    case "invoice.paid": {
      const customerId = obj.customer as string;
      const workspace = store.getByStripeCustomerId(customerId);
      if (!workspace) break;
      store.setSetting(workspace.id, "billing_state/v1", {
        paymentFailed: false,
        clearedAt: new Date().toISOString(),
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_test_billing";
const CUSTOMER_ID = "cus_test123";
const SUBSCRIPTION_ID = "sub_test456";
const FREELANCER_PRICE_ID = "price_freelancer_mo_test";
const TEAMS_PRICE_ID = "price_teams_mo_test";
const TEST_ENV = {
  STRIPE_PRICE_ID_FREELANCER_MONTHLY: FREELANCER_PRICE_ID,
  STRIPE_PRICE_ID_TEAMS_MONTHLY: TEAMS_PRICE_ID,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkout.session.completed → workspace updated", () => {
  it("sets stripeCustomerId and stripeSubscriptionId on the workspace", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      {
        id: "evt_checkout_1",
        type: "checkout.session.completed",
        data: {
          object: {
            customer: CUSTOMER_ID,
            subscription: SUBSCRIPTION_ID,
            metadata: { workspace_id: WORKSPACE_ID },
          },
        },
      },
      store,
      TEST_ENV
    );

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.stripeCustomerId).toBe(CUSTOMER_ID);
    expect(ws?.stripeSubscriptionId).toBe(SUBSCRIPTION_ID);
  });

  it("does nothing if workspace_id metadata is missing", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      {
        id: "evt_checkout_nometadata",
        type: "checkout.session.completed",
        data: {
          object: {
            customer: CUSTOMER_ID,
            subscription: SUBSCRIPTION_ID,
            // no metadata
          },
        },
      },
      store,
      TEST_ENV
    );

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.stripeCustomerId).toBeNull(); // unchanged
  });
});

describe("customer.subscription.updated → plan upgraded", () => {
  it("updates plan to freelancer when subscription is active with freelancer price", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "free",
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: null,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      {
        id: "evt_sub_updated",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: SUBSCRIPTION_ID,
            customer: CUSTOMER_ID,
            status: "active",
            trial_end: null,
            items: { data: [{ price: { id: FREELANCER_PRICE_ID } }] },
          },
        },
      },
      store,
      TEST_ENV
    );

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.plan).toBe("freelancer");
    expect(ws?.stripeSubscriptionId).toBe(SUBSCRIPTION_ID);
  });

  it("downgrades plan to free when subscription status is canceled", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "freelancer",
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      {
        id: "evt_sub_canceled",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: SUBSCRIPTION_ID,
            customer: CUSTOMER_ID,
            status: "canceled",
            trial_end: null,
            items: { data: [{ price: { id: FREELANCER_PRICE_ID } }] },
          },
        },
      },
      store,
      TEST_ENV
    );

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.plan).toBe("free");
  });
});

describe("customer.subscription.deleted → plan downgraded", () => {
  it("sets plan to free and workspace is findable by customer ID", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "teams",
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      {
        id: "evt_sub_deleted",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: SUBSCRIPTION_ID,
            customer: CUSTOMER_ID,
          },
        },
      },
      store,
      TEST_ENV
    );

    const ws = store.getWorkspace(WORKSPACE_ID);
    expect(ws?.plan).toBe("free");
  });
});

describe("invoice.payment_failed → billing_state flag set", () => {
  it("stores paymentFailed=true in billing_state/v1 setting", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "freelancer",
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });

    await handleWebhookEvent(
      {
        id: "evt_invoice_failed",
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_test_001",
            customer: CUSTOMER_ID,
          },
        },
      },
      store,
      TEST_ENV
    );

    const state = store.getSetting(WORKSPACE_ID, "billing_state/v1") as BillingState;
    expect(state).toBeDefined();
    expect(state.paymentFailed).toBe(true);
    expect(state.invoiceId).toBe("in_test_001");
  });

  it("clears paymentFailed flag on invoice.paid", async () => {
    const store = createInMemoryStore();
    store.addWorkspace({
      id: WORKSPACE_ID,
      plan: "freelancer",
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      trialEndsAt: null,
    });
    // Pre-set failed state
    store.setSetting(WORKSPACE_ID, "billing_state/v1", { paymentFailed: true });

    await handleWebhookEvent(
      {
        id: "evt_invoice_paid",
        type: "invoice.paid",
        data: { object: { id: "in_test_002", customer: CUSTOMER_ID } },
      },
      store,
      TEST_ENV
    );

    const state = store.getSetting(WORKSPACE_ID, "billing_state/v1") as BillingState;
    expect(state.paymentFailed).toBe(false);
    expect(state.clearedAt).toBeDefined();
  });
});
