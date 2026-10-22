/**
 * Discovery adapter registry — the single lookup table new adapters are added
 * to. `listAdapters()` powers the Discover page's "Available sources" panel;
 * `getAdapter()` is used by the runner to resolve `sourceName` → implementation.
 */

import type { AdapterCapability, LeadSourceAdapter } from "./types";
import { manualAdapter } from "./manual";
import { csvAdapter } from "./csv";
import { placesAdapter } from "./places";
import { webSearchAdapter } from "./web-search";

const ADAPTERS: LeadSourceAdapter[] = [
  manualAdapter,
  csvAdapter,
  placesAdapter,
  webSearchAdapter,
];

export function listAdapters(): LeadSourceAdapter[] {
  return ADAPTERS;
}

export function getAdapter(name: string): LeadSourceAdapter | undefined {
  return ADAPTERS.find((a) => a.name === name);
}

export function adapterCapabilities(
  env: Readonly<Record<string, string | undefined>>
): Array<{ adapter: LeadSourceAdapter; status: AdapterCapability }> {
  return ADAPTERS.map((adapter) => ({
    adapter,
    status: adapter.capability(env),
  }));
}
