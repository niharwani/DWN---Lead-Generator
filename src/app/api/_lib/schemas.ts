import { z } from "zod";

/**
 * Shared Zod schemas used by API handlers. Keep them narrow — any enum values
 * that drift from `src/lib/db/schema.ts` will surface as 400s rather than
 * silent corruption of the DB.
 */

export const pipelineStageSchema = z.enum([
  "new",
  "reviewing",
  "qualified",
  "contacted",
  "replied",
  "meeting_booked",
  "proposal_sent",
  "won",
  "lost",
  "not_a_fit",
]);

export const websiteConditionSchema = z.enum([
  "no_website",
  "inaccessible",
  "outdated",
  "weak",
  "acceptable",
  "strong",
  "unknown",
]);

export const outreachStatusSchema = z.enum([
  "draft",
  "needs_review",
  "approved",
  "contacted",
  "replied",
  "archived",
]);

export const outreachChannelSchema = z.enum([
  "email",
  "contact_form",
  "instagram_dm",
  "linkedin_manual",
  "other",
]);

export const taskPrioritySchema = z.enum(["low", "normal", "high"]);
export const taskStatusSchema = z.enum([
  "open",
  "in_progress",
  "done",
  "cancelled",
]);
export const taskTypeSchema = z.enum([
  "review_lead",
  "verify_contact",
  "send_approved_message",
  "follow_up",
  "prepare_proposal",
  "book_meeting",
  "other",
]);

export const campaignStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
]);

/* Light web-friendly validators */

export const businessNameSchema = z
  .string()
  .trim()
  .min(1, "Business name is required")
  .max(200);

export const websiteUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .optional()
  .nullable();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320)
  .optional()
  .nullable();

export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .optional()
  .nullable();

export const nicheSchema = z.string().trim().min(1).max(120);
export const citySchema = z.string().trim().max(120);
