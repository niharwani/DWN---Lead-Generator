/**
 * Web Intelligence domain types.
 *
 * These are the shapes the crawler, extractors, and repository layer share.
 * They sit next to the Drizzle row types but describe the richer in-memory
 * values the engine builds up during a crawl (parsed structured data,
 * extracted people, derived company intel).
 */

import type { AuditFinding } from "@/lib/demo/types";

export type CrawlStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type DiscoveredVia = "seed" | "link" | "sitemap" | "search";

export type PageFetchStatus = "queued" | "fetched" | "skipped" | "blocked" | "failed";

export type Confidence = "low" | "medium" | "high";

export type CompanyIntel = {
  domain: string;
  name?: string;
  description?: string;
  industry?: string[];
  services: string[];
  categories: string[];
  address?: string;
  city?: string;
  region?: string;
  country?: string;
  emails: string[];
  phones: string[];
  contactPageUrl?: string;
  socialUrls: string[];
  techIndicators: string[];
};

export type ExtractedPersonCandidate = {
  fullName: string;
  jobTitle?: string;
  profileUrl?: string;
  sourceUrl: string;
  evidence?: string;
  confidence: Confidence;
};

export type CrawlPageResult = {
  url: string;
  finalUrl?: string;
  discoveredVia: DiscoveredVia;
  depth: number;
  status: PageFetchStatus;
  httpStatus?: number;
  contentType?: string;
  bytes?: number;
  elapsedMs?: number;
  title?: string;
  errorStage?: string;
  errorReason?: string;
  /** True when the page's HTML was obtained via the JS rendering fallback. */
  rendered?: boolean;
};

export type CrawlOutcome = {
  intel: CompanyIntel;
  pages: CrawlPageResult[];
  people: ExtractedPersonCandidate[];
  findings: AuditFinding[]; // per-page website intelligence findings
};

export type CrawlJobInput = {
  seedUrl: string;
  seedLabel?: string;
  niche?: string;
  city?: string;
  region?: string;
  country?: string;
  maxPages?: number;
  maxDepth?: number;
  perDomainCap?: number;
};
