/* ============================================================================
 * Data Processing Addendum — FIRST DRAFT, NOT LEGAL ADVICE
 * Pending legal review before go-live.
 * ========================================================================== */

export const metadata = {
  title: "Data Processing Addendum — Lead Engine",
};

const LAST_UPDATED = "2026-10-18";

export default function DpaPage() {
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
          This is a first-draft DPA template. It has not been reviewed by a qualified legal
          professional. Before using this with any EU/EEA customers, it must be reviewed and
          approved by a qualified GDPR practitioner.
        </p>
      </div>

      <h1 className="mb-2 text-3xl font-semibold text-[var(--color-text)]">
        Data Processing Addendum
      </h1>
      <p className="mb-10 text-sm text-[var(--color-text-subtle)]">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="space-y-8 text-sm leading-relaxed text-[var(--color-text-muted)]">

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">1. Overview</h2>
          <p>
            This Data Processing Addendum ("DPA") forms part of the agreement between Design with
            Nihar ("Processor") and the customer ("Controller") and governs the processing of
            personal data by the Processor on behalf of the Controller in connection with Lead
            Engine (the "Service").
          </p>
          <p className="mt-2">
            This DPA is intended to satisfy the requirements of Article 28 of the GDPR (EU) 2016/679
            and equivalent provisions under UK GDPR and other applicable data protection law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">2. Definitions</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-medium text-[var(--color-text)]">Personal Data</strong> — any
              information relating to an identified or identifiable natural person.
            </li>
            <li>
              <strong className="font-medium text-[var(--color-text)]">Processing</strong> — any
              operation performed on personal data, including collection, storage, retrieval,
              disclosure, and deletion.
            </li>
            <li>
              <strong className="font-medium text-[var(--color-text)]">Controller</strong> — the
              Customer who determines the purposes and means of processing.
            </li>
            <li>
              <strong className="font-medium text-[var(--color-text)]">Processor</strong> — Design
              with Nihar, who processes personal data on the Controller's behalf.
            </li>
            <li>
              <strong className="font-medium text-[var(--color-text)]">Sub-processor</strong> — a
              third party engaged by the Processor to process personal data.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            3. Subject matter, nature, and duration of processing
          </h2>
          <p>
            The Processor processes personal data on behalf of the Controller solely for the purpose
            of providing the Service. Processing includes storage, retrieval, and deletion of lead
            records, outreach drafts, and usage metrics. Processing continues for the duration of the
            agreement and for the 30-day post-termination retention window described in the Privacy
            Policy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            4. Types of personal data and categories of data subjects
          </h2>
          <p>
            The personal data processed may include names, business email addresses, phone numbers,
            website URLs, and business locations of the Controller's prospects (data subjects). Data
            subjects are typically employees or representatives of businesses targeted for outreach.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            5. Processor obligations
          </h2>
          <p>The Processor shall:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              Process personal data only on documented instructions from the Controller (as set out
              in the Service agreement and these Terms).
            </li>
            <li>
              Ensure that persons authorised to process personal data have committed themselves to
              confidentiality.
            </li>
            <li>
              Implement appropriate technical and organisational measures to ensure a level of
              security appropriate to the risk (Article 32 GDPR), including encryption at rest and in
              transit, access controls, and regular security reviews.
            </li>
            <li>
              Assist the Controller in fulfilling its obligations to respond to requests from data
              subjects (access, erasure, portability) within commercially reasonable timescales.
            </li>
            <li>
              Notify the Controller without undue delay (and in any event within 72 hours of becoming
              aware) of a personal data breach affecting the Controller's data.
            </li>
            <li>
              Delete or return all personal data to the Controller upon termination of the agreement,
              subject to the 30-day retention window.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">6. Sub-processors</h2>
          <p>
            The Controller grants the Processor general authorisation to engage the sub-processors
            listed below. The Processor will notify the Controller of any intended changes (additions
            or replacements) to this list at least 14 days in advance, giving the Controller the
            opportunity to object.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                  <th className="px-4 py-2 text-left font-semibold text-[var(--color-text)]">Sub-processor</th>
                  <th className="px-4 py-2 text-left font-semibold text-[var(--color-text)]">Purpose</th>
                  <th className="px-4 py-2 text-left font-semibold text-[var(--color-text)]">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {[
                  ["Cloudflare, Inc.", "Database storage, edge compute", "USA (global CDN)"],
                  ["Resend Inc.", "Transactional email delivery", "USA"],
                  ["Anthropic, PBC", "AI model inference (opt-in)", "USA"],
                  ["Razorpay Software Pvt Ltd", "Payment processing", "India"],
                  ["Google LLC", "Places API, PageSpeed API (opt-in)", "USA"],
                ].map(([name, purpose, location]) => (
                  <tr key={name} className="bg-[var(--color-surface)]">
                    <td className="px-4 py-2 text-[var(--color-text)]">{name}</td>
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
            7. International data transfers
          </h2>
          <p>
            Processing may involve transfers of personal data to countries outside the European
            Economic Area (EEA) including the USA. Where such transfers occur, the Processor relies
            on the European Commission's Standard Contractual Clauses (SCCs) or equivalent transfer
            mechanisms as the legal basis for the transfer.
          </p>
          <p className="mt-2">
            A copy of the applicable SCCs can be provided on request by emailing{" "}
            <a
              href="mailto:hello@designwithnihar.com"
              className="text-[var(--color-accent-600)] underline underline-offset-2"
            >
              hello@designwithnihar.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            8. Audits and compliance
          </h2>
          <p>
            The Processor shall make available to the Controller all information necessary to
            demonstrate compliance with this DPA and shall allow for and contribute to audits,
            including inspections, conducted by the Controller or a mandated auditor, subject to
            reasonable advance notice and agreed confidentiality obligations.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">9. Governing law</h2>
          <p>
            This DPA is governed by the laws of India. Disputes shall be subject to the exclusive
            jurisdiction of the courts in Mumbai, Maharashtra, India, except where a different
            jurisdiction is required by applicable data protection law.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">10. Contact</h2>
          <p>
            Data protection enquiries:{" "}
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
