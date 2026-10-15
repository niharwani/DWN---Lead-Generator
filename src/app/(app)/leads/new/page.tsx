import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { createLeadAction } from "@/lib/actions";
import { pageDistinctCities, pageDistinctNiches } from "@/lib/data";

export const metadata: Metadata = { title: "Add lead" };

export default async function AddLeadPage() {
  // Pre-populate niche / city choices from the owner's existing leads so the
  // form matches what filters already show.
  const [niches, cities] = await Promise.all([
    pageDistinctNiches(),
    pageDistinctCities(),
  ]);

  const nicheOptions = Array.from(
    new Set([
      ...niches,
      "Jewellery & luxury",
      "D2C consumer brands",
      "Restaurants & hospitality",
      "Interior designers & architects",
      "Consultants & professional services",
      "Clinics & local services",
      "SMB operations",
    ])
  );

  return (
    <>
      <div className="mb-2">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft aria-hidden className="h-3 w-3" />
          Back to Leads
        </Link>
      </div>

      <PageHeader
        kicker="New lead"
        title="Add a lead manually"
        description="Dedup runs on save — if a lead with the same website or (name + city) already exists, you'll be prompted to open the existing one instead."
      />

      <Card className="max-w-3xl">
        <CardBody>
          <form action={createLeadAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2">
              <Input name="businessName" required maxLength={200} autoFocus />
            </Field>

            <Field label="Niche">
              <Select name="niche" required defaultValue="">
                <option value="" disabled>
                  Choose a niche…
                </option>
                {nicheOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Category" hint="A short label — e.g. “Jeweller” or “Café”.">
              <Input name="category" maxLength={120} />
            </Field>

            <Field label="City">
              <Input
                name="city"
                required
                list="dwn-cities"
                maxLength={120}
                defaultValue="Mumbai"
              />
              <datalist id="dwn-cities">
                {cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <Field label="Region / state">
              <Input name="region" maxLength={120} defaultValue="Maharashtra" />
            </Field>

            <Field label="Website URL" hint="Optional. Used for dedup + audits.">
              <Input name="websiteUrl" type="url" maxLength={2000} placeholder="https://…" />
            </Field>

            <Field label="Public business email">
              <Input name="publicEmail" type="email" maxLength={320} />
            </Field>

            <Field label="Phone">
              <Input name="publicPhone" maxLength={40} />
            </Field>

            <Field label="Source" hint="Where you found this lead.">
              <Select name="sourceName" defaultValue="manual">
                <option value="manual">Manual entry</option>
                <option value="csv_import">CSV import</option>
                <option value="google_places">Google Places</option>
                <option value="referral">Referral</option>
                <option value="instagram">Instagram</option>
                <option value="linkedin">LinkedIn</option>
              </Select>
            </Field>

            <Field label="Source URL" className="sm:col-span-2">
              <Input
                name="sourceUrl"
                type="url"
                maxLength={2000}
                placeholder="https://… (Instagram / LinkedIn / Google Business)"
              />
            </Field>

            <Field label="Address" className="sm:col-span-2">
              <Input name="address" maxLength={400} />
            </Field>

            <Field label="Tags" hint="Comma-separated. Used in filters." className="sm:col-span-2">
              <Input name="tags" maxLength={400} placeholder="heritage, referred, high-priority" />
            </Field>

            <div className="flex items-center justify-end gap-2 sm:col-span-2">
              <Link
                href="/leads"
                className="h-8 inline-flex items-center justify-center rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)]"
              >
                Cancel
              </Link>
              <Button type="submit" variant="primary" size="md">
                Add lead
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <p className="mt-3 text-[11px] text-[var(--color-text-subtle)]">
        Prefer bulk entry? Use <strong>Import CSV</strong> on the Leads page.
      </p>
    </>
  );
}
