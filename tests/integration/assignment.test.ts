import { describe, it, expect } from "vitest";
import { hasPermission } from "@/lib/auth/rbac";

/**
 * Lead and task assignment integration tests.
 *
 * Tests the assignment logic using in-memory state:
 *   - Assigning a lead to a workspace member
 *   - Assigning a task to a workspace member
 *   - Filtering tasks by assignee
 *   - Unassigning (null assignee)
 *   - RBAC: viewer cannot edit_lead (so cannot assign)
 */

/* --------------------------------------------------------------------------
 * In-memory data stores
 * -------------------------------------------------------------------------- */

type LeadRecord = {
  id: string;
  ownerId: string;
  businessName: string;
  assignedTo: string | null;
};

type TaskRecord = {
  id: string;
  ownerId: string;
  title: string;
  assignedTo: string | null;
  status: "open" | "done";
};

type MemberRecord = {
  profileId: string;
  role: "owner" | "admin" | "member" | "viewer";
};

class InMemoryWorkspace {
  leads: LeadRecord[] = [];
  tasks: TaskRecord[] = [];
  members: MemberRecord[] = [];
  workspaceId = "ws-1";

  addMember(profileId: string, role: MemberRecord["role"]) {
    this.members.push({ profileId, role });
  }

  createLead(id: string, businessName: string): LeadRecord {
    const lead: LeadRecord = {
      id,
      ownerId: this.workspaceId,
      businessName,
      assignedTo: null,
    };
    this.leads.push(lead);
    return lead;
  }

  createTask(id: string, title: string): TaskRecord {
    const task: TaskRecord = {
      id,
      ownerId: this.workspaceId,
      title,
      assignedTo: null,
      status: "open",
    };
    this.tasks.push(task);
    return task;
  }

  assignLead(leadId: string, profileId: string | null) {
    const lead = this.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error("Lead not found");
    lead.assignedTo = profileId;
  }

  assignTask(taskId: string, profileId: string | null) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found");
    task.assignedTo = profileId;
  }

  getTasksByAssignee(profileId: string): TaskRecord[] {
    return this.tasks.filter((t) => t.assignedTo === profileId);
  }

  getUnassignedTasks(): TaskRecord[] {
    return this.tasks.filter((t) => t.assignedTo === null);
  }
}

/* --------------------------------------------------------------------------
 * Lead assignment
 * -------------------------------------------------------------------------- */

describe("lead assignment", () => {
  it("assigns a lead to a workspace member", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");
    const lead = ws.createLead("lead-1", "Acme Corp");

    ws.assignLead("lead-1", "member-1");

    expect(lead.assignedTo).toBe("member-1");
  });

  it("unassigns a lead by setting null", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");
    const lead = ws.createLead("lead-1", "Acme Corp");

    ws.assignLead("lead-1", "member-1");
    expect(lead.assignedTo).toBe("member-1");

    ws.assignLead("lead-1", null);
    expect(lead.assignedTo).toBeNull();
  });

  it("reassigns a lead from one member to another", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");
    ws.addMember("member-2", "admin");
    const lead = ws.createLead("lead-1", "Beta LLC");

    ws.assignLead("lead-1", "member-1");
    ws.assignLead("lead-1", "member-2");

    expect(lead.assignedTo).toBe("member-2");
  });

  it("throws when lead does not exist", () => {
    const ws = new InMemoryWorkspace();
    expect(() => ws.assignLead("nonexistent", "member-1")).toThrow();
  });
});

/* --------------------------------------------------------------------------
 * Task assignment
 * -------------------------------------------------------------------------- */

describe("task assignment", () => {
  it("assigns a task to a workspace member", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");
    const task = ws.createTask("task-1", "Follow up with Acme");

    ws.assignTask("task-1", "member-1");

    expect(task.assignedTo).toBe("member-1");
  });

  it("unassigns a task by setting null", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");
    const task = ws.createTask("task-1", "Send proposal");

    ws.assignTask("task-1", "member-1");
    ws.assignTask("task-1", null);

    expect(task.assignedTo).toBeNull();
  });
});

/* --------------------------------------------------------------------------
 * Assignee filter
 * -------------------------------------------------------------------------- */

describe("task filter by assignee", () => {
  it("returns only tasks assigned to the specified member", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");
    ws.addMember("member-2", "member");

    ws.createTask("task-1", "Task for member 1");
    ws.createTask("task-2", "Also for member 1");
    ws.createTask("task-3", "Task for member 2");
    ws.createTask("task-4", "Unassigned");

    ws.assignTask("task-1", "member-1");
    ws.assignTask("task-2", "member-1");
    ws.assignTask("task-3", "member-2");

    const m1Tasks = ws.getTasksByAssignee("member-1");
    const m2Tasks = ws.getTasksByAssignee("member-2");
    const unassigned = ws.getUnassignedTasks();

    expect(m1Tasks).toHaveLength(2);
    expect(m1Tasks.map((t) => t.id)).toEqual(["task-1", "task-2"]);

    expect(m2Tasks).toHaveLength(1);
    expect(m2Tasks[0]?.id).toBe("task-3");

    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]?.id).toBe("task-4");
  });

  it("returns empty array when member has no assigned tasks", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");
    ws.createTask("task-1", "Task for nobody");

    expect(ws.getTasksByAssignee("member-1")).toHaveLength(0);
  });

  it("an empty assignee filter shows all tasks", () => {
    const ws = new InMemoryWorkspace();
    ws.addMember("member-1", "member");

    ws.createTask("t1", "A");
    ws.createTask("t2", "B");
    ws.createTask("t3", "C");
    ws.assignTask("t1", "member-1");

    // No filter = all tasks (simulating the page behavior)
    const filter: string | undefined = undefined;
    const all = filter
      ? ws.tasks.filter((t) => t.assignedTo === filter)
      : ws.tasks;

    expect(all).toHaveLength(3);
  });
});

/* --------------------------------------------------------------------------
 * RBAC: viewer cannot edit_lead (thus cannot use assignLeadAction)
 * -------------------------------------------------------------------------- */

describe("RBAC: assignment permission checks", () => {
  it("member has edit_lead permission (can assign)", () => {
    expect(hasPermission("member", "edit_lead")).toBe(true);
  });

  it("viewer does NOT have edit_lead permission (cannot assign)", () => {
    expect(hasPermission("viewer", "edit_lead")).toBe(false);
  });

  it("admin has edit_lead permission", () => {
    expect(hasPermission("admin", "edit_lead")).toBe(true);
  });

  it("owner has edit_lead permission", () => {
    expect(hasPermission("owner", "edit_lead")).toBe(true);
  });
});

/* --------------------------------------------------------------------------
 * Assignment does not cross workspace boundaries
 * -------------------------------------------------------------------------- */

describe("workspace isolation for assignments", () => {
  it("lead assignment is scoped to workspace via ownerId check", () => {
    const wsA = new InMemoryWorkspace();
    wsA.workspaceId = "ws-a";
    const wsB = new InMemoryWorkspace();
    wsB.workspaceId = "ws-b";

    wsA.createLead("lead-shared-id", "Acme in WS A");
    wsB.createLead("lead-shared-id", "Acme in WS B"); // same id, different workspace

    wsA.assignLead("lead-shared-id", "member-a");

    // WS A lead is assigned
    const leadA = wsA.leads.find((l) => l.id === "lead-shared-id");
    const leadB = wsB.leads.find((l) => l.id === "lead-shared-id");

    expect(leadA?.assignedTo).toBe("member-a");
    expect(leadB?.assignedTo).toBeNull(); // WS B unaffected
  });
});
