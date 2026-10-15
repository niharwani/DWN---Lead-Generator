import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createCampaignAction } from "@/lib/actions";
import { pageDistinctNiches } from "@/lib/data";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const niches = await pageDistinctNiches();
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
          href="/campaigns"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft aria-hidden className="h-3 w-3" />
          Back to Campaigns
        </Link>
      </div>

      <PageHeader
        kicker="New campaign"
        title="Create a campaign"
        description="A campaign scopes an audience and offer — not an automated send. Leads get associated afterwards from the Leads list."
      />

      <Card className="max-w-3xl">
        <CardBody>
          <form
            action={createCampaignAction}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Campaign name" className="sm:col-span-2">
              <Input name="name" required maxLength={200} autoFocus />
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

            <Field label="Status">
              <Select name="status" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>

            <Field label="City">
              <Input name="city" defaultValue="Mumbai" maxLength={120} />
            </Field>

            <Field label="Region / state">
              <Input name="region" defaultValue="Maharashtra" maxLength={120} />
            </Field>

            <Field
              label="Ideal customer description"
              className="sm:col-span-2"
              hint="Who exactly is this campaign for? Use this to decide if a new lead belongs."
            >
              <Textarea name="idealCustomerDescription" maxLength={2000} />
            </Field>

            <Field label="Offer" className="sm:col-span-2">
              <Input name="offer" maxLength={500} placeholder="e.g. Website redesign + enquiry flow" />
            </Field>

            <Field
              label="Value proposition"
              className="sm:col-span-2"
              hint="The one-sentence reason this audience should listen."
            >
              <Textarea name="valueProposition" maxLength={2000} />
            </Field>

            <Field label="Case study URL">
              <Input name="caseStudyUrl" type="url" maxLength={2000} />
            </Field>

            <Field label="Minimum score to qualify">
              <Input
                name="minimumScore"
                type="number"
                min={0}
                max={100}
                defaultValue={60}
              />
            </Field>

            <Field label="Notes" className="sm:col-span-2">
              <Textarea name="notes" maxLength={4000} />
            </Field>

            <div className="flex items-center justify-end gap-2 sm:col-span-2">
              <Link
                href="/campaigns"
                className="h-8 inline-flex items-center justify-center rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)]"
              >
                Cancel
              </Link>
              <Button type="submit" variant="primary">
                Create campaign
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
