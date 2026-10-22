/**
 * Repository barrel export. Pages and API routes import from here.
 *
 * Every function in this module is owner-scoped and takes `(db, ownerId, ...)`.
 * Passing the wrong ownerId simply returns an empty result — nothing in this
 * layer leaks across tenants.
 */

export * from "./activities";
export * from "./audits";
export * from "./briefs";
export * from "./cadences";
export * from "./campaigns";
export * from "./discovery-jobs";
export * from "./drafts";
export * from "./leads";
export * from "./metrics";
export * from "./notification-prefs";
export * from "./service-offerings";
export * from "./settings";
export * from "./tasks";
export * from "./webhooks";
// Phase A additions
export * from "./workspaces";
export * from "./sessions";
// Waitlist (pre-billing)
export * from "./waitlist";
// Web Intelligence module (crawl_jobs, crawl_pages, extracted_people)
export * from "./intel";
// Web Intelligence module — crawl_snapshots (change detection + R2 archive)
export * from "./intel-snapshots";
