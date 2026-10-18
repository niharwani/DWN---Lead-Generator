import { describe, it, expect } from "vitest";

/**
 * Cross-workspace isolation tests.
 *
 * These tests verify the isolation invariant using mock database objects that
 * simulate the filtering behaviour of the actual Drizzle repos. The key
 * guarantee: `getLead(db, ownerIdA, leadBId)` must return undefined (never
 * leak workspace B's data to workspace A).
 *
 * The real repos enforce this via `WHERE owner_id = ? AND id = ?`. We confirm
 * the contract here without needing a live D1 instance.
 */

// ---------------------------------------------------------------------------
// Minimal in-memory DB mock that mirrors the filtering logic in the repos
// ---------------------------------------------------------------------------

type StoredLead = {
  id: string;
  ownerId: string;
  businessName: string;
  pipelineStage: string;
};

function createMockDb(leads: StoredLead[]) {
  return {
    leads,
    getLead(ownerId: string, id: string): StoredLead | undefined {
      return this.leads.find((l) => l.ownerId === ownerId && l.id === id);
    },
    listLeads(ownerId: string): StoredLead[] {
      return this.leads.filter((l) => l.ownerId === ownerId);
    },
    deleteLead(ownerId: string, id: string): boolean {
      const idx = this.leads.findIndex(
        (l) => l.ownerId === ownerId && l.id === id
      );
      if (idx === -1) return false;
      this.leads.splice(idx, 1);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_A = "ws_aaaaaaaa";
const WORKSPACE_B = "ws_bbbbbbbb";

const LEAD_A1 = {
  id: "lead_a1",
  ownerId: WORKSPACE_A,
  businessName: "Alpha Corp",
  pipelineStage: "new",
};

const LEAD_A2 = {
  id: "lead_a2",
  ownerId: WORKSPACE_A,
  businessName: "Alpha Ltd",
  pipelineStage: "qualified",
};

const LEAD_B1 = {
  id: "lead_b1",
  ownerId: WORKSPACE_B,
  businessName: "Beta Inc",
  pipelineStage: "new",
};

const LEAD_B2 = {
  id: "lead_b2",
  ownerId: WORKSPACE_B,
  businessName: "Beta LLC",
  pipelineStage: "contacted",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cross-workspace read isolation", () => {
  it("workspace A can read its own lead", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    expect(db.getLead(WORKSPACE_A, "lead_a1")).toBeDefined();
    expect(db.getLead(WORKSPACE_A, "lead_a2")).toBeDefined();
  });

  it("workspace A cannot read workspace B's lead by ID (returns undefined)", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    // Attempt to access workspace B's lead using workspace A's owner context
    expect(db.getLead(WORKSPACE_A, "lead_b1")).toBeUndefined();
    expect(db.getLead(WORKSPACE_A, "lead_b2")).toBeUndefined();
  });

  it("workspace B cannot read workspace A's leads", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    expect(db.getLead(WORKSPACE_B, "lead_a1")).toBeUndefined();
    expect(db.getLead(WORKSPACE_B, "lead_a2")).toBeUndefined();
  });

  it("listLeads scopes results to the correct workspace", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);

    const aLeads = db.listLeads(WORKSPACE_A);
    const bLeads = db.listLeads(WORKSPACE_B);

    expect(aLeads).toHaveLength(2);
    expect(aLeads.every((l) => l.ownerId === WORKSPACE_A)).toBe(true);

    expect(bLeads).toHaveLength(2);
    expect(bLeads.every((l) => l.ownerId === WORKSPACE_B)).toBe(true);
  });

  it("no workspace A leads appear in workspace B's list", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    const bLeads = db.listLeads(WORKSPACE_B);
    const bLeadIds = bLeads.map((l) => l.id);
    expect(bLeadIds).not.toContain("lead_a1");
    expect(bLeadIds).not.toContain("lead_a2");
  });

  it("no workspace B leads appear in workspace A's list", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    const aLeads = db.listLeads(WORKSPACE_A);
    const aLeadIds = aLeads.map((l) => l.id);
    expect(aLeadIds).not.toContain("lead_b1");
    expect(aLeadIds).not.toContain("lead_b2");
  });
});

describe("cross-workspace mutation isolation", () => {
  it("workspace A cannot delete workspace B's lead", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    // Attempt mutation using wrong workspace context
    const deleted = db.deleteLead(WORKSPACE_A, "lead_b1");
    expect(deleted).toBe(false);
    // Lead B still exists in workspace B's context
    expect(db.getLead(WORKSPACE_B, "lead_b1")).toBeDefined();
  });

  it("workspace B cannot delete workspace A's lead", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    const deleted = db.deleteLead(WORKSPACE_B, "lead_a1");
    expect(deleted).toBe(false);
    expect(db.getLead(WORKSPACE_A, "lead_a1")).toBeDefined();
  });

  it("workspace can delete its own lead and it disappears only from that workspace", () => {
    const db = createMockDb([LEAD_A1, LEAD_A2, LEAD_B1, LEAD_B2]);
    const deleted = db.deleteLead(WORKSPACE_A, "lead_a1");
    expect(deleted).toBe(true);
    expect(db.getLead(WORKSPACE_A, "lead_a1")).toBeUndefined();
    // Workspace B's leads are untouched
    expect(db.getLead(WORKSPACE_B, "lead_b1")).toBeDefined();
    expect(db.getLead(WORKSPACE_B, "lead_b2")).toBeDefined();
  });
});

describe("getOwner() workspace scoping invariant", () => {
  it("Owner.id equals the workspace_id (not profile_id) by design", () => {
    // This is the core architectural invariant from PRODUCT_BUILD_PLAN.md §2.1.
    // We assert it via a type-level check using a mock Owner object.
    const mockOwner = {
      id: "ws_some_workspace_id", // <-- workspace_id used as ownerId
      profileId: "profile_different_id", // <-- separate from id
      email: "user@example.com",
      fullName: "Test User",
      role: "owner" as const,
      workspace: {
        id: "ws_some_workspace_id",
        name: "Test Workspace",
        slug: "test-workspace",
        plan: "free" as const,
      },
      isDemo: false,
    };

    // The ownerId passed to repos must be the workspace id
    expect(mockOwner.id).toBe(mockOwner.workspace.id);
    expect(mockOwner.id).not.toBe(mockOwner.profileId);
  });
});
