"use client";

/**
 * ComposeButtons — mailto / web-compose links for an approved email draft.
 *
 * Renders three compose-link buttons:
 *   1. Gmail web compose (mail.google.com)
 *   2. Outlook web compose (outlook.live.com)
 *   3. Default mail client (mailto:)
 *
 * Plus a "Mark as sent" button that calls markDraftSentManuallyAction when the
 * user has finished sending manually.
 *
 * Opened in new tabs so the user never leaves the page.
 * Values are URL-encoded by buildComposeLinks().
 */

import { useState } from "react";
import { Mail, ExternalLink, CheckCircle2 } from "lucide-react";
import { markDraftSentManuallyAction } from "@/lib/actions";

export type ComposeButtonsProps = {
  draftId: string;
  to: string;
  subject: string;
  body: string;
};

function buildComposeLinks(to: string, subject: string, body: string) {
  const encTo = encodeURIComponent(to);
  const encSubject = encodeURIComponent(subject);
  const encBody = encodeURIComponent(body);

  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${encTo}&su=${encSubject}&body=${encBody}`,
    outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${encTo}&subject=${encSubject}&body=${encBody}`,
    mailto: `mailto:${encTo}?subject=${encSubject}&body=${encBody}`,
  };
}

export function ComposeButtons({ draftId, to, subject, body }: ComposeButtonsProps) {
  const [marking, setMarking] = useState(false);
  const [markedSent, setMarkedSent] = useState(false);
  const [error, setError] = useState("");

  const links = buildComposeLinks(to, subject, body);

  async function handleMarkSent() {
    setMarking(true);
    setError("");
    try {
      await markDraftSentManuallyAction(draftId);
      setMarkedSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMarking(false);
    }
  }

  if (markedSent) {
    return (
      <div
        role="status"
        className="flex items-center gap-1.5 text-xs text-[var(--color-success-700)]"
      >
        <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
        Marked as sent.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Gmail web compose */}
      <a
        href={links.gmail}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex h-7 items-center gap-1 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[11px] font-medium text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
        title="Open Gmail web compose in a new tab"
      >
        <Mail aria-hidden className="h-3 w-3" />
        Gmail
        <ExternalLink aria-hidden className="h-2.5 w-2.5 opacity-60" />
      </a>

      {/* Outlook web compose */}
      <a
        href={links.outlook}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex h-7 items-center gap-1 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[11px] font-medium text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
        title="Open Outlook web compose in a new tab"
      >
        <Mail aria-hidden className="h-3 w-3" />
        Outlook
        <ExternalLink aria-hidden className="h-2.5 w-2.5 opacity-60" />
      </a>

      {/* Default mail client */}
      <a
        href={links.mailto}
        className="inline-flex h-7 items-center gap-1 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[11px] font-medium text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]"
        title="Open in your default mail client"
      >
        <Mail aria-hidden className="h-3 w-3" />
        Mail app
      </a>

      {/* Mark as sent */}
      <button
        type="button"
        onClick={handleMarkSent}
        disabled={marking}
        className="inline-flex h-7 items-center gap-1 rounded-sm bg-[var(--color-accent-600)] px-2.5 text-[11px] font-medium text-white hover:bg-[var(--color-accent-700)] disabled:opacity-60"
        title="After sending manually, click here to mark this draft as contacted"
      >
        <CheckCircle2 aria-hidden className="h-3 w-3" />
        {marking ? "Saving…" : "Mark as sent"}
      </button>

      {error && (
        <span className="text-[11px] text-[color:#991b1b]">{error}</span>
      )}
    </div>
  );
}
