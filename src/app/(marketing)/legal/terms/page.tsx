/* ============================================================================
 * Terms of Service — FIRST DRAFT, NOT LEGAL ADVICE
 * Pending legal review before go-live.
 * ========================================================================== */

export const metadata = {
  title: "Terms of Service — Lead Engine",
};

const LAST_UPDATED = "2026-10-18";

export default function TermsPage() {
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
          The operator of Lead Engine is solely responsible for validating and finalising these terms
          before making them binding on users.
        </p>
      </div>

      <h1 className="mb-2 text-3xl font-semibold text-[var(--color-text)]">Terms of Service</h1>
      <p className="mb-10 text-sm text-[var(--color-text-subtle)]">
        Last updated: {LAST_UPDATED}
      </p>

      <div className="prose prose-sm max-w-none space-y-8 text-[var(--color-text-muted)]">

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            1. Acceptance of terms
          </h2>
          <p>
            By accessing or using Lead Engine (the "Service"), you agree to be bound by these Terms
            of Service ("Terms"). If you do not agree, do not use the Service.
          </p>
          <p className="mt-2">
            These Terms govern your use of the Service provided by Design with Nihar ("we", "us",
            "our"), a business based in India.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            2. Acceptable use
          </h2>
          <p>You agree to use the Service only for lawful purposes. You must not:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              Send unsolicited bulk commercial email ("spam") to any person who has not given their
              explicit prior consent to receive it.
            </li>
            <li>
              Harvest, scrape, or collect email addresses or other personal data without the data
              subject's knowledge and consent.
            </li>
            <li>
              Use the Service in a way that violates the CAN-SPAM Act (USA), the GDPR (EU/UK),
              India's Information Technology Act 2000 and DPDP Act 2023, Canada's CASL, or any
              other applicable law governing commercial electronic messages.
            </li>
            <li>
              Attempt to bypass the Service's human-approval gate or auto-send outreach to
              recipients.
            </li>
            <li>
              Import or process data relating to individuals who have exercised their right to opt
              out or have been marked "do not contact" in any system you control.
            </li>
            <li>
              Use the Service to facilitate illegal discrimination, harassment, or any activity that
              violates applicable law.
            </li>
            <li>
              Reverse-engineer, decompile, or attempt to extract the source code of the Service.
            </li>
          </ul>
          <p className="mt-3">
            You are solely responsible for ensuring that your use of the Service complies with all
            applicable laws in your jurisdiction. We reserve the right to suspend or terminate
            accounts engaged in activities we reasonably determine to be harmful or in violation of
            these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            3. Service availability
          </h2>
          <p>
            The Service is provided "as is" and "as available." We do not guarantee uninterrupted,
            error-free, or secure access to the Service. We may modify, suspend, or discontinue any
            part of the Service at any time, with or without notice.
          </p>
          <p className="mt-2">
            Scheduled maintenance, Cloudflare infrastructure incidents, and force-majeure events
            may cause temporary unavailability. We will endeavour to communicate planned outages in
            advance.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            4. Accounts and security
          </h2>
          <p>
            You are responsible for maintaining the security of your account credentials. You must
            notify us immediately at{" "}
            <a href="mailto:hello@designwithnihar.com" className="text-[var(--color-accent-600)] underline underline-offset-2">
              hello@designwithnihar.com
            </a>{" "}
            if you become aware of unauthorised access to your account.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            5. Data processing
          </h2>
          <p>
            Your use of the Service involves the processing of personal data about third parties
            (your prospects) that you import or discover via the Service. You are the data controller
            for that data; we act as a data processor on your behalf. Our obligations as a processor
            are set out in our{" "}
            <a href="/legal/dpa" className="text-[var(--color-accent-600)] underline underline-offset-2">
              Data Processing Addendum
            </a>
            .
          </p>
          <p className="mt-2">
            You warrant that you have a lawful basis for processing the personal data you upload, and
            that you will honour any opt-out or erasure request from data subjects without undue
            delay.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            6. Intellectual property
          </h2>
          <p>
            We own all intellectual property rights in the Service, including software, design, and
            documentation. You retain all rights to the lead data and content you upload. We do not
            claim any ownership over your data.
          </p>
          <p className="mt-2">
            By using the Service you grant us a limited, non-exclusive licence to process your data
            solely for the purpose of providing the Service to you.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            7. Payment and subscriptions
          </h2>
          <p>
            Paid plans are billed via Razorpay. Subscription fees are billed monthly or annually as
            selected at checkout. You may cancel at any time; cancellation takes effect at the end of
            the current billing period. We do not provide refunds for unused portions of a billing
            period except as required by applicable law.
          </p>
          <p className="mt-2">
            We reserve the right to change pricing with at least 30 days' notice to active paying
            subscribers.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            8. Termination
          </h2>
          <p>
            We may suspend or terminate your access to the Service immediately and without notice if
            we reasonably believe you have violated these Terms. You may terminate your account at
            any time from the Settings page. Upon termination, your data is retained for 30 days (to
            allow export) and then permanently deleted.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            9. Limitation of liability
          </h2>
          <p>
            To the maximum extent permitted by applicable law, we shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, including loss of
            profits, data, or goodwill, arising from your use of or inability to use the Service.
          </p>
          <p className="mt-2">
            Our total liability for any claim arising under or related to these Terms shall not
            exceed the total amount you paid us in the twelve months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            10. Governing law and jurisdiction
          </h2>
          <p>
            These Terms are governed by the laws of India. Any disputes arising from or related to
            these Terms shall be subject to the exclusive jurisdiction of the courts in Mumbai,
            Maharashtra, India.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">
            11. Changes to these Terms
          </h2>
          <p>
            We may update these Terms from time to time. Material changes will be communicated by
            email to account holders at least 14 days before taking effect. Continued use of the
            Service after changes take effect constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">12. Contact</h2>
          <p>
            Questions about these Terms? Email us at{" "}
            <a
              href="mailto:hello@designwithnihar.com"
              className="text-[var(--color-accent-600)] underline underline-offset-2"
            >
              hello@designwithnihar.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
