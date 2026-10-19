import Link from "next/link";

/* ============================================================================
 * Features deep-dive page — public, unauthenticated
 * ========================================================================== */

export const metadata = {
  title: "Features — Lead Engine",
  description:
    "Evidence-based scoring, automated audits, reply triage, follow-up cadences, and multi-source discovery — all in one tool built for people who care about reply rates.",
};

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div className="mt-6 flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)]">
      <p className="text-sm text-[var(--color-text-subtle)]">
        TODO: screenshot — {label}
      </p>
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 md:px-6">
      {/* Hero */}
      <div className="mb-20 text-center">
        <h1 className="mb-4 text-4xl font-semibold text-[var(--color-text)] md:text-5xl">
          Built for evidence-based outreach
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-[var(--color-text-muted)]">
          Lead Engine is not a "send 10,000 emails" tool. It is a tool for people who care about
          reply rates and domain reputation — built around a human-approval gate that nothing can
          bypass.
        </p>
      </div>

      {/* Section 1: Evidence-based scoring */}
      <section className="mb-20">
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--color-accent-600)]">
          01 — Scoring
        </div>
        <h2 className="mb-4 text-3xl font-semibold text-[var(--color-text)]">
          Evidence-based lead scoring
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="mb-4 leading-relaxed text-[var(--color-text-muted)]">
              Every lead gets a score built from real observable signals, not vibes. Factors
              include:
            </p>
            <ul className="flex flex-col gap-3">
              {[
                {
                  title: "Website condition",
                  desc: "HTTPS, mobile viewport, page weight, alt text, contact availability — all checked automatically on every audit.",
                },
                {
                  title: "ICP fit",
                  desc: "How closely the lead matches your defined ideal customer profile, based on industry, category, and niche.",
                },
                {
                  title: "Deal value estimate",
                  desc: "Estimated deal size relative to your pricing floor and ceiling.",
                },
                {
                  title: "Engagement likelihood",
                  desc: "Signals like a reachable contact email, active website, and category alignment.",
                },
                {
                  title: "Custom factors (Teams)",
                  desc: "Define your own scoring criteria — a fitness coach might score for an Instagram link; a SaaS founder for a pricing page.",
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <p className="mb-1 text-sm font-semibold text-[var(--color-text)]">
                    {item.title}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">{item.desc}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <ScreenshotPlaceholder label="Lead scoring dashboard with factor breakdown" />
            <p className="mt-3 text-xs text-[var(--color-text-subtle)]">
              Scoring weights are fully editable per workspace. Switch industry presets at any time.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Audit engine */}
      <section className="mb-20 border-t border-[var(--color-border)] pt-16">
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--color-accent-600)]">
          02 — Audit
        </div>
        <h2 className="mb-4 text-3xl font-semibold text-[var(--color-text)]">
          Website audit engine with SSRF defense
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="mb-4 leading-relaxed text-[var(--color-text-muted)]">
              The audit engine fetches a prospect's public URL and runs eight baseline checks. Every
              finding feeds directly into the lead score.
            </p>
            <ul className="flex flex-col gap-2">
              {[
                "HTTPS / TLS — is the connection secure?",
                "Page title and meta description — basic SEO hygiene",
                "Mobile viewport — does it work on phones?",
                "Page weight — is it slow to load?",
                "Image alt text — accessibility coverage",
                "Headings structure — is the page organized?",
                "Contact path — is there a way to reach them?",
                "Overall website condition: strong / acceptable / outdated / weak",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent-600)]" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                SSRF defense
              </p>
              <p className="text-sm text-[var(--color-text-muted)]">
                Every outbound fetch runs through a strict URL validator that blocks RFC 1918
                private IPs, localhost, link-local addresses, cloud metadata endpoints, and every
                redirect target. On Cloudflare Workers the runtime adds a second DNS-layer defense
                via <code className="text-xs">global_fetch_strictly_public</code>.
              </p>
            </div>
          </div>
          <div>
            <ScreenshotPlaceholder label="Website audit results card with check list" />
          </div>
        </div>
      </section>

      {/* Section 3: Reply triage + cadences */}
      <section className="mb-20 border-t border-[var(--color-border)] pt-16">
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--color-accent-600)]">
          03 — Automation
        </div>
        <h2 className="mb-4 text-3xl font-semibold text-[var(--color-text)]">
          Reply triage and follow-up cadences
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="mb-4 leading-relaxed text-[var(--color-text-muted)]">
              When a reply arrives in your Gmail or Outlook inbox, the engine classifies it into one
              of five buckets — and queues the right next action for your review.
            </p>
            <div className="flex flex-col gap-3">
              {[
                {
                  label: "Interested",
                  color: "bg-[var(--color-success-100)] text-[var(--color-success-700)]",
                  action: "Creates a book_meeting task, priority high",
                },
                {
                  label: "Needs info",
                  color: "bg-[var(--color-info-100)] text-[var(--color-info-500)]",
                  action: "Creates a follow_up task with a suggested answer draft",
                },
                {
                  label: "Not a fit",
                  color: "bg-[var(--color-neutral-100)] text-[var(--color-text-muted)]",
                  action: "Auto-moves lead to not_a_fit, archives thread",
                },
                {
                  label: "Unsubscribe",
                  color: "bg-[var(--color-danger-100)] text-[var(--color-danger-500)]",
                  action: "Sets doNotContact = true, logs reason, archives drafts",
                },
                {
                  label: "Unclear",
                  color: "bg-[var(--color-warning-100)] text-[var(--color-warning-500)]",
                  action: "Surfaces in triage queue for manual review",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${item.color}`}
                  >
                    {item.label}
                  </span>
                  <p className="text-sm text-[var(--color-text-muted)]">{item.action}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <ScreenshotPlaceholder label="Reply triage queue with classified responses" />
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
              <strong className="font-medium text-[var(--color-text)]">Follow-up cadences</strong>{" "}
              let you set a schedule — for example, +3 days, +7 days, +14 days — per campaign. Draft
              follow-ups land in your queue on the configured day. You review and click send; nothing
              fires automatically.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Integrations */}
      <section className="mb-20 border-t border-[var(--color-border)] pt-16">
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-[var(--color-accent-600)]">
          04 — Integrations
        </div>
        <h2 className="mb-4 text-3xl font-semibold text-[var(--color-text)]">
          Integrations that fit your stack
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { name: "Gmail", tier: "Freelancer+", desc: "Send outreach and poll replies directly through your Gmail inbox." },
            { name: "Google Places", tier: "All plans", desc: "Discover prospects with a natural-language search. Bring your own key for unlimited runs." },
            { name: "Anthropic Claude", tier: "Freelancer+", desc: "AI-assisted outreach drafts. BYO key for unlimited monthly drafts." },
            { name: "PageSpeed API", tier: "All plans", desc: "Page weight and performance data feeds directly into audit scoring." },
            { name: "Outlook / M365", tier: "Teams", desc: "Full send + reply polling via Microsoft Graph API." },
            { name: "Slack + Discord", tier: "Teams", desc: "Hot-lead alerts and digest notifications to your team channel." },
            { name: "Zapier / n8n", tier: "Teams", desc: "Outbound webhooks on lead.created, draft.approved, reply.received, and more." },
            { name: "Cal.com / Calendly", tier: "Teams", desc: "One-click booking link insertion when a reply classifies as interested." },
            { name: "Razorpay", tier: "Billing", desc: "Cards and UPI for Indian and international customers." },
          ].map((item) => (
            <div
              key={item.name}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold text-[var(--color-text)]">{item.name}</p>
                <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-subtle)]">
                  {item.tier}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="rounded-xl bg-[var(--color-accent-50)] p-8 text-center">
        <h2 className="mb-3 text-2xl font-semibold text-[var(--color-text)]">
          See it all in action
        </h2>
        <p className="mb-6 text-[var(--color-text-muted)]">
          Free tier available. No card required.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-md bg-[var(--color-accent-600)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-700)]"
          >
            Get started free
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-6 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-neutral-100)]"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
