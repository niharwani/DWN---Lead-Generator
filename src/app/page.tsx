/**
 * Root page — Phase H.
 *
 * Auth-aware landing:
 *   - Authenticated owner → redirect to /overview
 *   - Unauthenticated visitor → render the public marketing landing page
 *
 * This file replaces the previous "redirect to /overview" stub.
 *
 * ROUTE CONFLICT NOTE: src/app/(marketing)/page.tsx would also resolve to "/".
 * To avoid a Next.js build error, src/app/(marketing)/page.tsx exports a
 * redirect-to-root, yielding the actual "/" rendering to this file.
 * The (marketing) layout wraps /pricing, /features, and /legal/* pages.
 */

import { redirect } from "next/navigation";
import { getOwner } from "@/lib/auth/session";
import Link from "next/link";
import {
  Search,
  BarChart2,
  Shield,
  Mail,
  GitBranch,
  Globe,
  Zap,
  Users,
  CheckCircle,
} from "lucide-react";

export const metadata = {
  title: "Lead Engine — Evidence-based outreach for people who care about reply rates",
  description:
    "Find businesses that need what you sell, qualify them with evidence, and send outreach you'd actually want to receive — in one tool, without becoming a spammer.",
};

const PROBLEMS = [
  {
    icon: <Zap className="h-5 w-5" />,
    problem: "Mass-send tools tank reply rates",
    solution:
      "Every prospect is scored against real evidence — website quality, category fit, ICP match — before you write a single word.",
  },
  {
    icon: <Shield className="h-5 w-5" />,
    problem: "One spam report can kill a domain",
    solution:
      "A human-approval gate is built in to every outreach action. Nothing auto-sends. Your reputation stays intact.",
  },
  {
    icon: <Search className="h-5 w-5" />,
    problem: "Discovery and CRM live in different tools",
    solution:
      "Find leads, audit them, score them, draft personalized outreach, and track the pipeline — all in one place.",
  },
];

const FEATURES = [
  {
    icon: <BarChart2 className="h-5 w-5 text-[var(--color-accent-600)]" />,
    title: "Evidence-based scoring",
    desc: "Leads are ranked by real signals: website condition, ICP fit, category match, contact availability.",
  },
  {
    icon: <Shield className="h-5 w-5 text-[var(--color-accent-600)]" />,
    title: "Website audit engine",
    desc: "Automated audits check HTTPS, page weight, mobile viewport, alt text, contact info — with SSRF defense baked in.",
  },
  {
    icon: <GitBranch className="h-5 w-5 text-[var(--color-accent-600)]" />,
    title: "Follow-up cadences",
    desc: "Schedule gentle follow-ups at +3, +7, +14 days. Drafts land in your review queue — you still click send.",
  },
  {
    icon: <Mail className="h-5 w-5 text-[var(--color-accent-600)]" />,
    title: "AI reply triage",
    desc: "Incoming replies are classified as interested, needs info, unsubscribe, or unclear — then routed to the right next action.",
  },
  {
    icon: <Globe className="h-5 w-5 text-[var(--color-accent-600)]" />,
    title: "Multi-source discovery",
    desc: "Find prospects via Google Places, CSV import, or manual entry. Deduplication runs automatically on every import.",
  },
  {
    icon: <Users className="h-5 w-5 text-[var(--color-accent-600)]" />,
    title: "Team collaboration",
    desc: "Invite your team, assign leads, share an inbox view for replies, and keep everyone in sync with role-based access.",
  },
];

export default async function HomePage() {
  const owner = await getOwner();
  if (owner) redirect("/overview");

  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-[var(--color-accent-600)] text-xs font-bold text-white">
              L
            </div>
            <span className="font-semibold tracking-tight text-[var(--color-text)]">
              Lead Engine
            </span>
          </Link>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Main navigation">
            <Link href="/features" className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]">
              Features
            </Link>
            <Link href="/pricing" className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]">
              Pricing
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-neutral-100)]"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-sm bg-[var(--color-accent-600)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-700)]"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-20 text-center md:px-6 md:pt-28">
          <div className="mx-auto max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success-600)]" />
              Now in early access
            </p>
            <h1 className="mb-6 font-display text-4xl font-normal leading-tight tracking-tight text-[var(--color-text)] md:text-5xl lg:text-6xl">
              Outreach that earns a reply.
              <br />
              <span className="text-[var(--color-accent-600)]">Not a reputation.</span>
            </h1>
            <p className="mb-10 text-lg leading-relaxed text-[var(--color-text-muted)] md:text-xl">
              Find businesses that need what you sell, qualify them with evidence, and send outreach
              you&apos;d actually want to receive — in one tool, without becoming a spammer.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-md bg-[var(--color-accent-600)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-700)]"
              >
                Start for free
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-6 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-neutral-100)]"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-xs text-[var(--color-text-subtle)]">
              Free tier available. No credit card required to start.
            </p>
          </div>
        </section>

        {/* Problem / Solution */}
        <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
            <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-[var(--color-accent-600)]">
              The problem
            </h2>
            <p className="mb-12 text-center text-2xl font-semibold text-[var(--color-text)] md:text-3xl">
              Most outreach tools optimize for volume.
              <br className="hidden md:block" /> We optimize for replies.
            </p>
            <div className="grid gap-6 md:grid-cols-3">
              {PROBLEMS.map((item) => (
                <div key={item.problem} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-accent-100)] text-[var(--color-accent-600)]">
                    {item.icon}
                  </div>
                  <p className="mb-2 text-sm font-semibold text-[var(--color-text-muted)] line-through decoration-[var(--color-danger-500)]">
                    {item.problem}
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{item.solution}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
          <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-[var(--color-accent-600)]">
            What&apos;s inside
          </h2>
          <p className="mb-12 text-center text-2xl font-semibold text-[var(--color-text)] md:text-3xl">
            Every piece of the outreach workflow, connected.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-accent-50)]">
                  {f.icon}
                </div>
                <h3 className="mb-1.5 text-sm font-semibold text-[var(--color-text)]">{f.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/features" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent-600)] hover:text-[var(--color-accent-700)]">
              See all features →
            </Link>
          </div>
        </section>

        {/* Tagline strip */}
        <section className="border-y border-[var(--color-border)] bg-[var(--color-accent-50)]">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 text-center md:px-6">
            <div className="flex flex-col items-center gap-3 md:flex-row md:justify-center md:gap-8">
              {["No auto-send — ever", "Human approval on every outreach", "Evidence-based, not volume-based", "Your domain reputation stays clean"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-medium text-[var(--color-accent-700)]">
                  <CheckCircle className="h-4 w-4 text-[var(--color-accent-600)]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center md:px-6">
          <h2 className="mb-4 text-3xl font-semibold text-[var(--color-text)] md:text-4xl">
            Ready to send outreach that gets replies?
          </h2>
          <p className="mb-8 text-[var(--color-text-muted)]">
            Start free. No credit card. Upgrade when you&apos;re ready.
          </p>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-md bg-[var(--color-accent-600)] px-8 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-700)]"
          >
            Get started free
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[var(--color-accent-600)] text-[10px] font-bold text-white">
                  L
                </div>
                <span className="text-sm font-semibold text-[var(--color-text)]">Lead Engine</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)]">
                Built by{" "}
                <a href="https://designwithnihar.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--color-text-muted)]">
                  Design with Nihar
                </a>
                {" · "}Based in India
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-subtle)]" aria-label="Footer navigation">
              <Link href="/legal/terms" className="hover:text-[var(--color-text-muted)]">Terms</Link>
              <Link href="/legal/privacy" className="hover:text-[var(--color-text-muted)]">Privacy</Link>
              <Link href="/legal/dpa" className="hover:text-[var(--color-text-muted)]">DPA</Link>
              <span className="text-[var(--color-border-strong)]">·</span>
              <span>{year}</span>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
