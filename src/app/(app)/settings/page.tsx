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
import { requirePageOwner } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { listFactors } from "@/lib/db/repos/custom-factors";
import { listSignals } from "@/lib/db/repos/custom-signals";
import { getProfileSettings, getWorkspace, listMembers } from "@/lib/db/repos/workspaces";
import { getSetting } from "@/lib/db/repos/settings";
import { getCurrentPeriodUsage } from "@/lib/db/repos/usage";
import { getRuntimeEnv } from "@/lib/env";
import { PLANS, comparePlans, type PlanId } from "@/lib/billing/plans";
import { listPendingInvites } from "@/lib/db/repos/invites";
import { listAuditLog } from "@/lib/db/repos/audit-log";
import { listWebhooks } from "@/lib/db/repos/webhooks";
import { profiles } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { BrandingSection } from "./_sections/branding";
import { CustomFactorsSection } from "./_sections/custom-factors";
import { CustomSignalsSection } from "./_sections/custom-signals";
import { TemplatesSection } from "./_sections/templates";
import { BillingSection } from "./_sections/billing";
import { MembersSection } from "./_sections/members";
import { AuditLogSection } from "./_sections/audit-log";
import { WebhooksSection } from "./_sections/webhooks";
import type { DraftTemplateData } from "@/lib/actions";
import type { MemberRow, PendingInvite } from "./_sections/members";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [services, weights] = await Promise.all([
    pageListServices(),
    pageScoringWeights(),
  ]);

  // Phase C data
  const owner = await requirePageOwner();
  const db = await getDb();
  const [customFactors, customSignals, profile, templatesRaw, workspace, usage, billingState, env] = await Promise.all([
    listFactors(db, owner.id),
    listSignals(db, owner.id),
    getProfileSettings(db, owner.id),
    getSetting<DraftTemplateData[]>(db, owner.id, "templates/v1"),
    getWorkspace(db, owner.id),
    getCurrentPeriodUsage(db, owner.id),
    getSetting<{ paymentFailed?: boolean }>(db, owner.id, "billing_state/v1"),
    getRuntimeEnv(),
  ]);

  // Phase E — Next upgradeable plan's price ID (monthly as default)
  const currentPlan = owner.workspace.plan as PlanId;
  const planOrder: PlanId[] = ["free", "freelancer", "teams", "studio"];
  const nextUpgradePlanId = planOrder.find((p) => comparePlans(p, currentPlan) > 0) ?? null;
  const nextPriceIdMap: Partial<Record<PlanId, string>> = {
    freelancer: env.STRIPE_PRICE_ID_FREELANCER_MONTHLY ?? undefined,
    teams: env.STRIPE_PRICE_ID_TEAMS_MONTHLY ?? undefined,
  };
  const nextPriceId = nextUpgradePlanId ? (nextPriceIdMap[nextUpgradePlanId] ?? null) : null;
  const nextPlanName = nextUpgradePlanId ? PLANS[nextUpgradePlanId].name : null;

  // Phase F data — members, invites, audit log, webhooks
  const [rawMembers, pendingInvites, auditEntries, webhooks] = await Promise.all([
    listMembers(db, owner.id),
    listPendingInvites(db, owner.id),
    listAuditLog(db, owner.id, { limit: 51 }),
    listWebhooks(db, owner.id),
  ]);

  // Hydrate member rows with profile email/name
  const profileIds = rawMembers.map((m) => m.profileId);
  const profileRows =
    profileIds.length > 0
      ? await db.select().from(profiles).where(inArray(profiles.id, profileIds))
      : [];
  const profileMap = new Map(profileRows.map((p) => [p.id, p]));

  const memberRows: MemberRow[] = rawMembers.map((m) => {
    const p = profileMap.get(m.profileId);
    return {
      profileId: m.profileId,
      email: p?.email ?? m.profileId,
      fullName: p?.fullName ?? null,
      role: m.role as MemberRow["role"],
      acceptedAt: m.acceptedAt,
    };
  });

  const pendingInviteRows: PendingInvite[] = pendingInvites.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role as PendingInvite["role"],
    expiresAt: inv.expiresAt,
  }));

  const auditHasMore = auditEntries.length > 50;
  const auditPage = auditEntries.slice(0, 50);

  // Members for audit log actor filter
  const auditMembers = memberRows.map((m) => ({
    profileId: m.profileId,
    email: m.email,
    fullName: m.fullName,
  }));

  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace, scoring, templates, and integrations. API keys never render here — only their configured / missing status."
      />

      <div className="space-y-6">
        {/* --- Branding (Phase C) -------------------------------------- */}
        <BrandingSection
          initialName={profile.studioName ?? ""}
          initialLogoUrl={profile.logoUrl ?? ""}
          initialAccentColor={profile.accentColor ?? ""}
          initialPitch={profile.pitch ?? ""}
        />

        {/* --- Members (Phase F) --------------------------------------- */}
        <MembersSection
          members={memberRows}
          pendingInvites={pendingInviteRows}
          currentProfileId={owner.profileId}
        />

        {/* --- Business profile ---------------------------------------- */}
        <SettingsSection
          icon={<Building2 aria-hidden className="h-4 w-4" />}
          title="Business profile"
          description="Used in outreach drafts and campaign framing."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Studio name">
              <Input defaultValue={profile.studioName ?? ""} name="studioName" />
            </Field>
            <Field label="Public website">
              <Input defaultValue={profile.publicWebsite ?? ""} name="publicWebsite" />
            </Field>
            <Field label="Default city" hint="Discovery falls back to this.">
              <Input defaultValue={profile.defaultCity ?? ""} name="defaultCity" />
            </Field>
            <Field label="Default currency">
              <Input defaultValue={profile.defaultCurrency ?? "INR"} name="defaultCurrency" />
            </Field>
            <Field
              label="Short pitch"
              className="sm:col-span-2"
              hint="Appears as the fallback value proposition on draft templates."
            >
              <Textarea defaultValue={profile.pitch ?? ""} name="pitch" />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            {/* TODO: wire up saveProfileAction when Phase C profile form action is added */}
            <Button variant="primary" size="sm">
              Save profile
            </Button>
          </div>
        </SettingsSection>

        {/* --- Services -------------------------------------------------- */}
        <SettingsSection
          icon={<Package aria-hidden className="h-4 w-4" />}
          title="Services &amp; offers"
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

        {/* --- Templates (Phase C) ------------------------------------- */}
        <TemplatesSection initialTemplates={templatesRaw ?? []} />

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

        {/* --- Custom scoring factors (Phase C) ------------------------- */}
        <CustomFactorsSection initialFactors={customFactors} />

        {/* --- Custom audit signals (Phase C) --------------------------- */}
        <CustomSignalsSection initialSignals={customSignals} />

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
              <Input defaultValue="Lead-Engine/0.1 (audit bot; +https://getleadengine.com/)" />
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

        {/* --- Billing (Phase E) --------------------------------------- */}
        <BillingSection
          currentPlan={currentPlan}
          hasStripeCustomer={!!workspace?.stripeCustomerId}
          usage={usage}
          trialEndsAt={workspace?.trialEndsAt ?? null}
          paymentFailed={billingState?.paymentFailed ?? false}
          nextPriceId={nextPriceId}
          nextPlanName={nextPlanName}
        />

        {/* --- Webhooks (Phase F) --------------------------------------- */}
        <WebhooksSection initialWebhooks={webhooks} />

        {/* --- Audit log (Phase F) -------------------------------------- */}
        <AuditLogSection
          initialEntries={auditPage}
          hasMore={auditHasMore}
          members={auditMembers}
        />

        <p className="pt-2 text-[11px] text-[var(--color-text-subtle)]">
          Users are responsible for complying with applicable laws, provider
          terms, and outreach rules. The app&apos;s design encourages human-approved
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
