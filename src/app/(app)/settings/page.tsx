import type { Metadata } from "next";
import {
  Building2,
  Package,
  SlidersHorizontal,
  Plug,
  Sparkles,
  Globe,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { pageListServices, pageScoringWeights } from "@/lib/data";
import { saveScoringWeightsAction, resetScoringWeightsAction } from "@/lib/actions";
import { FACTOR_LABELS, type ScoreFactorCode } from "@/lib/scoring/engine";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [services, weights] = await Promise.all([
    pageListServices(),
    pageScoringWeights(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business profile, scoring, and integrations. API keys never render here — only their configured / missing status."
      />

      <div className="space-y-6">
        {/* --- Business profile ---------------------------------------- */}
        <SettingsSection
          icon={<Building2 aria-hidden className="h-4 w-4" />}
          title="Business profile"
          description="Used in outreach drafts and campaign framing."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Studio name">
              <Input defaultValue="Design with Nihar" />
            </Field>
            <Field label="Public website">
              <Input defaultValue="https://dwn-site.pages.dev/" />
            </Field>
            <Field label="Default city" hint="Discovery falls back to this.">
              <Input defaultValue="Mumbai" />
            </Field>
            <Field label="Default currency">
              <Input defaultValue="INR" />
            </Field>
            <Field
              label="Short pitch"
              className="sm:col-span-2"
              hint="Appears as the fallback value proposition on draft templates."
            >
              <Textarea defaultValue="A small studio in Mumbai focused on websites, software, and automation. We work with brands and businesses who care about the details." />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="primary" size="sm">
              Save profile
            </Button>
          </div>
        </SettingsSection>

        {/* --- Services -------------------------------------------------- */}
        <SettingsSection
          icon={<Package aria-hidden className="h-4 w-4" />}
          title="Services & offers"
          description="Edit the service list used for fit matching. Not hardcoded — add, hide, or reorder."
        >
          <ul className="divide-y divide-[var(--color-border)]">
            {services.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {s.name}
                    </span>
                    {s.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="muted">Hidden</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {s.description}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
                    Ideal customer: {s.idealCustomer}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm">
                    {s.isActive ? "Hide" : "Show"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm">
              Add service
            </Button>
          </div>
        </SettingsSection>

        {/* --- Scoring weights ------------------------------------------ */}
        <SettingsSection
          icon={<SlidersHorizontal aria-hidden className="h-4 w-4" />}
          title="Lead scoring weights"
          description="Point values for each factor. Uncheck 'enabled' to drop a factor entirely."
        >
          <form action={saveScoringWeightsAction}>
            <ul className="divide-y divide-[var(--color-border)]">
              {(Object.keys(FACTOR_LABELS) as ScoreFactorCode[]).map((code) => {
                const w = weights[code];
                return (
                  <li
                    key={code}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--color-text)]">
                        {FACTOR_LABELS[code]}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                        code:{" "}
                        <code className="rounded bg-[var(--color-neutral-100)] px-1">
                          {code}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                        <input
                          type="checkbox"
                          name={`enabled.${code}`}
                          defaultChecked={w.enabled}
                        />
                        on
                      </label>
                      <Input
                        type="number"
                        name={`points.${code}`}
                        defaultValue={w.points}
                        className="h-7 w-20 text-right"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-[var(--color-text-subtle)]">
              Final scores are clamped to 0–100 and store a per-factor breakdown + version. Re-score runs when audit or campaign criteria change.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                formAction={resetScoringWeightsAction}
                variant="secondary"
                size="sm"
                type="submit"
              >
                Reset defaults
              </Button>
              <Button variant="primary" size="sm" type="submit">
                Save weights
              </Button>
            </div>
          </form>
        </SettingsSection>

        {/* --- Integrations --------------------------------------------- */}
        <SettingsSection
          icon={<Plug aria-hidden className="h-4 w-4" />}
          title="Source integrations"
          description="Secrets are stored server-side. Only configured / missing status is shown here, never the key itself."
        >
          <ul className="divide-y divide-[var(--color-border)]">
            <IntegrationRow
              name="Google Places API"
              envKey="GOOGLE_PLACES_API_KEY"
              status="missing"
              description="Server-side discovery adapter. Field-masked, quota-aware."
            />
            <IntegrationRow
              name="PageSpeed Insights API"
              envKey="PAGESPEED_API_KEY"
              status="missing"
              description="Optional enhancement to the website audit."
            />
          </ul>
        </SettingsSection>

        {/* --- AI provider --------------------------------------------- */}
        <SettingsSection
          icon={<Sparkles aria-hidden className="h-4 w-4" />}
          title="AI provider"
          description="Optional. The app runs usefully without an AI key — opportunity briefs and drafts fall back to deterministic templates."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider">
              <select
                className="h-8 w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm"
                defaultValue="none"
              >
                <option value="none">Templates only (no provider)</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </Field>
            <Field label="Model" hint="Suggested: claude-sonnet-4-6">
              <Input placeholder="claude-sonnet-4-6" />
            </Field>
          </div>
          <IntegrationRow
            name="Anthropic API key"
            envKey="ANTHROPIC_API_KEY"
            status="missing"
            description="Server-side only."
            inline
          />
        </SettingsSection>

        {/* --- Audit settings ------------------------------------------- */}
        <SettingsSection
          icon={<Globe aria-hidden className="h-4 w-4" />}
          title="Website audit settings"
          description="Bounds for the SSRF-protected audit engine. Hardcoded defaults are safe; tune if a site needs more time."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Request timeout (ms)">
              <Input type="number" defaultValue={8000} />
            </Field>
            <Field label="Response size cap (KB)">
              <Input type="number" defaultValue={2048} />
            </Field>
            <Field label="Max redirects">
              <Input type="number" defaultValue={5} />
            </Field>
            <Field label="User agent" className="sm:col-span-3">
              <Input defaultValue="DWN-Lead-Engine/0.1 (+https://dwn-site.pages.dev/)" />
            </Field>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-[var(--color-text-subtle)]">
            <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
            The audit engine rejects localhost, loopback, private, link-local,
            multicast, reserved, and cloud-metadata IPs for both IPv4 and IPv6,
            and revalidates after every redirect. These controls cannot be
            disabled.
          </p>
        </SettingsSection>

        <p className="pt-2 text-[11px] text-[var(--color-text-subtle)]">
          Users are responsible for complying with applicable laws, provider
          terms, and outreach rules. The app's design encourages human-approved
          outreach only — it does not provide blanket legal-compliance
          guarantees.
        </p>
      </div>
    </>
  );
}

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            {icon}
          </div>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {description}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function IntegrationRow({
  name,
  envKey,
  status,
  description,
  inline,
}: {
  name: string;
  envKey: string;
  status: "configured" | "missing";
  description: string;
  inline?: boolean;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <KeyRound
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)]"
          />
          <span className="text-sm text-[var(--color-text)]">{name}</span>
          {status === "configured" ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden className="h-3 w-3" />
              Configured
            </Badge>
          ) : (
            <Badge variant="warning">
              <AlertTriangle aria-hidden className="h-3 w-3" />
              Not configured
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {description}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
          env:{" "}
          <code className="rounded bg-[var(--color-neutral-100)] px-1 py-0.5">
            {envKey}
          </code>
          {" — set with "}
          <code className="rounded bg-[var(--color-neutral-100)] px-1 py-0.5">
            wrangler secret put {envKey}
          </code>
        </p>
      </div>
      <div className="shrink-0">
        <Button variant="ghost" size="sm">
          Instructions
        </Button>
      </div>
    </>
  );
  if (inline) {
    return (
      <div className="mt-4 flex items-start justify-between gap-3 rounded-sm border border-[var(--color-border)] bg-[var(--color-neutral-50)] p-3">
        {content}
      </div>
    );
  }
  return (
    <li className="flex items-start justify-between gap-3 py-3">{content}</li>
  );
}
