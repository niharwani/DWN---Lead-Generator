/**
 * Manual-entry adapter. Returns no candidates — the actual lead is created
 * via the standard `createLeadAction` form on `/leads`. The adapter exists so
 * manual entries can be grouped under the discovery-jobs audit trail with the
 * same shape as external adapters.
 */

import type { LeadSourceAdapter } from "./types";

export const manualAdapter: LeadSourceAdapter = {
  name: "manual",
  label: "Manual entry",
  capability: () => "ready",
  run: async () => ({
    candidates: [],
    note: "Manual entry does not produce candidates server-side — use the Add Lead form.",
  }),
};
