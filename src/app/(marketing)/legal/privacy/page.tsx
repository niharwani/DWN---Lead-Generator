/* ============================================================================
 * Privacy Policy — FIRST DRAFT, NOT LEGAL ADVICE
 * Pending legal review before go-live.
 * ========================================================================== */

export const metadata = {
  title: "Privacy Policy — Lead Engine",
};

const LAST_UPDATED = "2026-10-18";

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6">
      {/* Draft warning banner */}
      <div
        role="alert"
        className="mb-8 rounded-lg border-2 border-[var(--color-warning-500)] bg-[var(--color-warning-100)] px-5 py-4"
      >
        <p className="font-semibold text-[var(--color-warning-500)]">
          Draft — pending legal review before go-live
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          This is a first-draft template. It has not been reviewed by a qualified legal professional.
          The operator is solely responsible for validating and finalising this policy before it
          becomes binding.
        </p>
      </div>

      <h1 className="mb-2 text-3xl font-semibold text-[var(--color-text)]">Privacy Policy</h1>
      <p className="mb-10 text-sm text-[var(--color-text-subtle)]">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-[var(--color-text-muted)]">

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">1. Who we are</h2>
          <p>
            Lead Engine is operated by Design with Nihar, based in India. We act as a data controller
            for the personal data of our registered users, and as a data processor for the prospect
            data that users import into the Service.
          </p>
          <p className="mt-2">
            Contact:{" "}
            <a
              href="mailto:hello@designwithnihar.com"
              className="text-[var(--color-accent-600)] underline underline-offset-2"
            >
              hello@designwithnihar.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            2. What data we collect
          </h2>

          <h3 className="mb-2 font-semibold text-[var(--color-text)]">2.1 Account information</h3>
          <p>
            When you create an account we collect your email address and, optionally, your full name.
            We use your email to send magic-link authentication tokens. We do not store passwords.
          </p>

          <h3 className="mb-2 mt-4 font-semibold text-[var(--color-text)]">2.2 Lead data you import</h3>
          <p>
            You may import or discover data about third-party businesses (your prospects), including
            business names, website URLs, email addresses, phone numbers, locations, and related
            notes. This data is processed on your behalf; you are the controller of this data and
            you are responsible for ensuring you have a lawful basis for collecting and processing
            it.
          </p>

          <h3 className="mb-2 mt-4 font-semibold text-[var(--color-text)]">2.3 Usage telemetry</h3>
          <p>
            We record aggregate usage counters (number of audits run, number of AI drafts generated,
            number of discovery runs) per workspace per calendar month. This data is used solely for
            billing limit enforcement and is not shared with third parties for advertising purposes.
          </p>

          <h3 className="mb-2 mt-4 font-semibold text-[var(--color-text)]">2.4 Outreach drafts</h3>
          <p>
            Draft emails composed within the Service (including AI-generated content) are stored in
            Cloudflare D1 until you delete them or close your account. Draft content is used to
            power reply threading and follow-up cadences.
          </p>

          <h3 className="mb-2 mt-4 font-semibold text-[var(--color-text)]">2.5 Session data</h3>
          <p>
            We store session identifiers in a HttpOnly, Secure, SameSite=Lax cookie to keep you
            logged in. Session records include IP address and user agent for security purposes.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            3. Where data is stored
          </h2>
          <p>
            All structured data (accounts, leads, drafts, sessions) is stored in{" "}
            <strong className="font-medium text-[var(--color-text)]">Cloudflare D1</strong>, a
            globally distributed SQLite service operated by Cloudflare, Inc. Data is encrypted at
            rest and in transit.
          </p>
          <p className="mt-2">
            Transactional emails (magic links, digests) are sent via{" "}
            <strong className="font-medium text-[var(--color-text)]">Resend</strong> (Resend Inc,
            USA). Resend receives the recipient email address for the purposes of delivery only.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            4. Third-party processors
          </h2>
          <p>We use the following sub-processors to operate the Service:</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                  <th className="px-4 py-2 text-left font-semibold text-[var(--color-text)]">Processor</th>
                  <th className="px-4 py-2 text-left font-semibold text-[var(--color-text)]">Purpose</th>
                  <th className="px-4 py-2 text-left font-semibold text-[var(--color-text)]">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[
                  ["Cloudflare, Inc.", "Database (D1), edge compute (Workers)", "Global / USA"],
                  ["Resend Inc.", "Transactional email (magic links, digests)", "USA"],
                  ["Anthropic, PBC", "AI-generated outreach drafts (opt-in)", "USA"],
                  ["Razorpay Software Pvt Ltd", "Payment processing", "India"],
                  ["Google LLC", "Places API for lead discovery (opt-in)", "USA"],
                  ["Google LLC", "PageSpeed API for website audits", "USA"],
                ].map(([processor, purpose, location]) => (
                  <tr key={processor} className="bg-[var(--color-surface)]">
                    <td className="px-4 py-2 text-[var(--color-text)]">{processor}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{purpose}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            5. Data retention
          </h2>
          <p>
            We retain your account data for as long as your account is active. Upon account
            deletion we retain data for a 30-day recovery window and then permanently delete it.
          </p>
          <p className="mt-2">
            Session records expire after 30 days of inactivity and are purged automatically.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">6. Your rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Access a copy of your personal data</li>
            <li>Correct inaccurate personal data</li>
            <li>Request deletion of your personal data</li>
            <li>Restrict or object to the processing of your data</li>
            <li>Data portability (receive your data in a machine-readable format)</li>
          </ul>
          <p className="mt-3">
            To exercise any right, email{" "}
            <a
              href="mailto:hello@designwithnihar.com"
              className="text-[var(--color-accent-600)] underline underline-offset-2"
            >
              hello@designwithnihar.com
            </a>
            . We will respond within 30 days. You can also export your lead data directly from
            Settings → Export at any time.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">7. Cookies</h2>
          <p>
            We use one first-party cookie: a session cookie (<code className="rounded bg-[var(--color-surface-muted)] px-1 py-0.5 text-xs">sl_sid</code>). It is
            strictly necessary for authentication and does not track you across sites. We do not use
            advertising or analytics cookies.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            8. Changes to this policy
          </h2>
          <p>
            We may update this policy. Material changes will be communicated by email at least 14
            days before taking effect. The "Last updated" date at the top of this page reflects
            the most recent revision.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">9. Contact</h2>
          <p>
            Privacy questions or requests:{" "}
            <a
              href="mailto:hello@designwithnihar.com"
              className="text-[var(--color-accent-600)] underline underline-offset-2"
            >
              hello@designwithnihar.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
