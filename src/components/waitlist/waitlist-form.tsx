"use client";

/**
 * WaitlistForm — Soft-launch waitlist capture.
 *
 * Shows email + optional phone + optional note fields.
 * Hidden requestedPlan and source props control what gets submitted.
 * On success shows inline "Thanks — we'll be in touch." message.
 */

import { useState } from "react";

type WaitlistSource =
  | "pricing_page"
  | "billing_page"
  | "settings_banner"
  | "checkout_cta";

type RequestedPlan = "freelancer" | "teams" | "studio";

type WaitlistFormProps = {
  source?: WaitlistSource;
  requestedPlan?: RequestedPlan;
  /** Label for the CTA button (default: "Join the waitlist") */
  ctaLabel?: string;
  /** Optional compact mode hides phone/note fields */
  compact?: boolean;
};

export function WaitlistForm({
  source,
  requestedPlan,
  ctaLabel = "Join the waitlist",
  compact = false,
}: WaitlistFormProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("submitting");
    setError("");

    try {
      const payload: Record<string, string> = { email: email.trim() };
      if (phone.trim()) payload.phone = phone.trim();
      if (note.trim()) payload.note = note.trim();
      if (source) payload.source = source;
      if (requestedPlan) payload.requestedPlan = requestedPlan;

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Request failed.");
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-lg border border-[var(--color-success-200)] bg-[var(--color-success-50)] px-4 py-3 text-sm text-[var(--color-success-700)]"
      >
        <strong>Thanks — we&apos;ll be in touch.</strong>
        {requestedPlan && (
          <span className="ml-1 opacity-80">
            We noted your interest in the {requestedPlan.charAt(0).toUpperCase() + requestedPlan.slice(1)} plan.
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className={compact ? "flex gap-2" : "space-y-3"}>
        {/* Email */}
        <div className={compact ? "flex-1" : ""}>
          <label htmlFor="waitlist-email" className="sr-only">
            Email address
          </label>
          <input
            id="waitlist-email"
            type="email"
            required
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-600)]"
          />
        </div>

        {compact && (
          <button
            type="submit"
            disabled={status === "submitting"}
            className="h-9 shrink-0 rounded-md bg-[var(--color-accent-600)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-700)] disabled:opacity-60"
          >
            {status === "submitting" ? "Joining…" : ctaLabel}
          </button>
        )}
      </div>

      {!compact && (
        <>
          {/* Phone (optional) */}
          <div>
            <label htmlFor="waitlist-phone" className="mb-1 block text-xs text-[var(--color-text-muted)]">
              Phone number <span className="text-[var(--color-text-subtle)]">(optional)</span>
            </label>
            <input
              id="waitlist-phone"
              type="tel"
              placeholder="+1 555 555 5555"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-600)]"
            />
          </div>

          {/* Note (optional) */}
          <div>
            <label htmlFor="waitlist-note" className="mb-1 block text-xs text-[var(--color-text-muted)]">
              Anything you&apos;d like us to know? <span className="text-[var(--color-text-subtle)]">(optional)</span>
            </label>
            <textarea
              id="waitlist-note"
              rows={2}
              placeholder="e.g. team size, use case, timing…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-600)] resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={status === "submitting"}
            className="h-9 rounded-md bg-[var(--color-accent-600)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-700)] disabled:opacity-60"
          >
            {status === "submitting" ? "Joining…" : ctaLabel}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-[color:#991b1b]">
          {error}
        </p>
      )}
    </form>
  );
}
