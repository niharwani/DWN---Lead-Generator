import type {
  AuditFindingSeverity,
  CampaignStatus,
  EvidenceConfidence,
  OutreachChannel,
  OutreachStatus,
  PipelineStage,
  ScoreBreakdown,
  TaskPriority,
  TaskStatus,
  WebsiteCondition,
} from "./types";

/** Human-readable labels for enum values. Centralised so every screen stays consistent. */

export const STAGE_LABEL: Record<PipelineStage, string> = {
  new: "New",
  reviewing: "Reviewing",
  qualified: "Qualified",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
  not_a_fit: "Not a fit",
};

export const STAGE_ORDER: PipelineStage[] = [
  "new",
  "reviewing",
  "qualified",
  "contacted",
  "replied",
  "meeting_booked",
  "proposal_sent",
  "won",
];

export const WEBSITE_CONDITION_LABEL: Record<WebsiteCondition, string> = {
  no_website: "No website",
  inaccessible: "Inaccessible",
  outdated: "Outdated",
  weak: "Weak",
  acceptable: "Acceptable",
  strong: "Strong",
  unknown: "Unknown",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  approved: "Approved",
  contacted: "Contacted",
  replied: "Replied",
  archived: "Archived",
};

export const OUTREACH_CHANNEL_LABEL: Record<OutreachChannel, string> = {
  email: "Email",
  contact_form: "Contact form",
  instagram_dm: "Instagram DM",
  linkedin_manual: "LinkedIn (manual)",
  other: "Other",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

export const CONFIDENCE_LABEL: Record<EvidenceConfidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
  insufficient: "Insufficient evidence",
};

export const SEVERITY_LABEL: Record<AuditFindingSeverity, string> = {
  info: "Info",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const SCORE_BAND_LABEL: Record<ScoreBreakdown["band"], string> = {
  priority_review: "Priority review",
  strong_candidate: "Strong candidate",
  needs_manual_review: "Needs manual review",
  low_priority: "Low priority",
  insufficient_evidence: "Insufficient evidence",
};

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  csv_import: "CSV import",
  google_places: "Google Places",
  web_intel: "Web Intelligence crawl",
};

export function sourceLabel(id: string): string {
  return SOURCE_LABEL[id] ?? id;
}

/** Date formatters. All timestamps are stored as ISO UTC and rendered in IST by default. */

const IST = "Asia/Kolkata";

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IST,
  });
}

/** Relative to real "now" by default; pass `nowIso` to pin against a fixture time. */
export function formatRelative(iso: string | undefined, nowIso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  const diffMs = then - now;
  const absMs = Math.abs(diffMs);
  const future = diffMs > 0;

  const minutes = Math.round(absMs / 60_000);
  const hours = Math.round(absMs / 3_600_000);
  const days = Math.round(absMs / 86_400_000);

  if (absMs < 60_000) return future ? "in a moment" : "just now";
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  if (hours < 36) return future ? `in ${hours}h` : `${hours}h ago`;
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  const months = Math.round(days / 30);
  return future ? `in ${months}mo` : `${months}mo ago`;
}

export function formatCurrency(amount: number | undefined, currency = "INR"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatMs(ms: number | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function scoreBandClass(band: ScoreBreakdown["band"]): string {
  switch (band) {
    case "priority_review":
      return "bg-[var(--color-accent-100)] text-[var(--color-accent-700)]";
    case "strong_candidate":
      return "bg-[var(--color-success-100)] text-[var(--color-success-700)]";
    case "needs_manual_review":
      return "bg-[var(--color-warning-100)] text-[color:#8c6a00]";
    case "low_priority":
      return "bg-[var(--color-neutral-200)] text-[var(--color-neutral-700)]";
    case "insufficient_evidence":
      return "bg-[var(--color-neutral-100)] text-[var(--color-text-subtle)] italic";
  }
}

export function stageDotClass(stage: PipelineStage): string {
  switch (stage) {
    case "new":
    case "reviewing":
      return "bg-[var(--color-neutral-400)]";
    case "qualified":
      return "bg-[var(--color-info-500)]";
    case "contacted":
    case "replied":
    case "meeting_booked":
    case "proposal_sent":
      return "bg-[var(--color-accent-600)]";
    case "won":
      return "bg-[var(--color-success-600)]";
    case "lost":
    case "not_a_fit":
      return "bg-[var(--color-neutral-500)]";
  }
}

export function severityClass(sev: AuditFindingSeverity): string {
  switch (sev) {
    case "high":
      return "bg-[var(--color-danger-100)] text-[color:#991b1b]";
    case "medium":
      return "bg-[var(--color-warning-100)] text-[color:#8c6a00]";
    case "low":
      return "bg-[var(--color-info-100)] text-[color:#1e40af]";
    case "info":
      return "bg-[var(--color-neutral-100)] text-[var(--color-text-muted)]";
  }
}
