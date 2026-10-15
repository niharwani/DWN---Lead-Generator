/**
 * CSV adapter. Discovery through CSV is handled by the existing /api/leads/import
 * endpoint and the `/leads` import UI (Phase 3). The adapter records a discovery
 * job entry so CSV imports show up in the Discover history alongside live
 * adapter runs.
 */

import type { LeadSourceAdapter } from "./types";

export const csvAdapter: LeadSourceAdapter = {
  name: "csv_import",
  label: "CSV import",
  capability: () => "ready",
  run: async () => ({
    candidates: [],
    note: "CSV imports are driven by the /leads import flow. This job entry records the request.",
  }),
};
