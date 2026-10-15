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
export * from "./campaigns";
export * from "./discovery-jobs";
export * from "./drafts";
export * from "./leads";
export * from "./metrics";
export * from "./service-offerings";
export * from "./settings";
export * from "./tasks";
