/**
 * Lead-source adapter contract. Every adapter takes a validated `DiscoveryInput`
 * and returns `DiscoveredCandidate[]`. The runner (`runner.ts`) is responsible
 * for dedup, persistence, optional audit, and optional scoring — adapters are
 * pure data providers.
 */

import type { Lead } from "@/lib/demo/types";

export type DiscoveryInput = {
  niche: string;
  city?: string;
  region?: string;
  country?: string;
  keywords?: string;
  businessTypes?: string;
  limit: number;
};

export type DiscoveredCandidate = {
  businessName: string;
  category?: string;
  websiteUrl?: string;
  publicEmail?: string;
  publicPhone?: string;
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  externalId?: string;
  sourceUrl?: string;
  evidence?: Record<string, unknown>;
};

export type AdapterCapability = "ready" | "needs-key" | "disabled";

export type LeadSourceAdapter = {
  name: string;
  label: string;
  capability(env: Readonly<Record<string, string | undefined>>): AdapterCapability;
  run(input: DiscoveryInput, env: Readonly<Record<string, string | undefined>>): Promise<{
    candidates: DiscoveredCandidate[];
    note?: string;
  }>;
};

export type DiscoveryResult = {
  jobId: string;
  created: number;
  dedupedDomain: number;
  dedupedName: number;
  errors: Array<{ businessName?: string; reason: string }>;
  leadIds: string[];
  note?: string;
};

export type DiscoveredToLeadInput = Pick<
  Lead,
  "businessName" | "niche" | "city" | "country"
>;
