"use client";

/**
 * IntegrationsSection — Phase G
 *
 * Shows connection state for Gmail, Outlook, Google Places, PageSpeed,
 * Anthropic AI, Cal.com, and Slack webhook. Replaces the scattered inline
 * integration rows on the main settings page.
 *
 * Flash banners at the top handle ?gmail=connected / ?gmail=error&reason=...
 * and the Outlook equivalents returned by the OAuth callbacks.
 */

import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  Plug,
  Mail,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  X,
  Calendar,
  Link2,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { setCalcomLinkAction, updateNotificationPrefsAction } from "@/lib/actions";
import type { CalendarConfig } from "@/lib/calendar/calcom";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type IntegrationsSectionProps = {
  gmailConnected: boolean;
  gmailEmail?: string;
  outlookConnected: boolean;
  outlookEmail?: string;
  googlePlacesConfigured: boolean;
  pageSpeedConfigured: boolean;
  anthropicConfigured: boolean;
  calcomConfig?: CalendarConfig | null;
  slackWebhookUrl?: string;
};

/* --------------------------------------------------------------------------
 * Flash banner
 * -------------------------------------------------------------------------- */

function FlashBanner({
  type,
  message,
  onDismiss,
}: {
  type: "success" | "error";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className={`mb-4 flex items-start justify-between gap-3 rounded-sm border px-3 py-2 text-sm ${
        type === "success"
          ? "border-[var(--color-success-200)] bg-[var(--color-success-50)] text-[var(--color-success-700)]"
          : "border-[var(--color-danger-200)] bg-[var(--color-danger-50)] text-[color:#991b1b]"
      }`}
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * OAuth row (Gmail / Outlook)
 * -------------------------------------------------------------------------- */

function OAuthIntegrationRow({
  name,
  connected,
  connectedEmail,
  connectHref,
  disconnectAction,
}: {
  name: string;
  connected: boolean;
  connectedEmail?: string;
  connectHref: string;
  disconnectAction: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Mail
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)]"
          />
          <span className="text-sm text-[var(--color-text)]">{name}</span>
          {connected ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="muted">Not connected</Badge>
          )}
        </div>
        {connected && connectedEmail ? (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Sending as {connectedEmail}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Connect to send outreach emails directly from this app.
          </p>
        )}
      </div>
      <div className="shrink-0">
        {connected ? (
          <form method="POST" action={disconnectAction}>
            <Button variant="ghost" size="sm" type="submit">
              Disconnect
            </Button>
          </form>
        ) : (
          <a href={connectHref}>
            <Button variant="secondary" size="sm" type="button">
              Connect
            </Button>
          </a>
        )}
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------------
 * API key status row
 * -------------------------------------------------------------------------- */

function ApiKeyRow({
  name,
  envKey,
  configured,
  description,
}: {
  name: string;
  envKey: string;
  configured: boolean;
  description: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <KeyRound
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-subtle)]"
          />
          <span className="text-sm text-[var(--color-text)]">{name}</span>
          {configured ? (
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
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {description}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
          env:{" "}
          <code className="rounded bg-[var(--color-neutral-100)] px-1 py-0.5">
            {envKey}
          </code>
          {" — "}
          <code className="rounded bg-[var(--color-neutral-100)] px-1 py-0.5">
            wrangler secret put {envKey}
          </code>
        </p>
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------------
 * Main component
 * -------------------------------------------------------------------------- */

export function IntegrationsSection(props: IntegrationsSectionProps) {
  const searchParams = useSearchParams();

  // Flash banner state
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const dismiss = useCallback(
    (key: string) => setDismissed((d) => ({ ...d, [key]: true })),
    []
  );

  const gmailFlash = searchParams.get("gmail");
  const gmailReason = searchParams.get("reason");
  const outlookFlash = searchParams.get("outlook");
  const outlookReason = searchParams.get("reason");

  // Cal.com form state
  const calFormRef = useRef<HTMLFormElement>(null);
  const [calStatus, setCalStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [calError, setCalError] = useState("");

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <Plug aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle>Integrations</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Email providers, API keys, calendar, and webhooks. Secrets are
              stored server-side — only configured/missing status is shown here.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {/* Flash banners */}
        {gmailFlash === "connected" && !dismissed["gmail_connected"] && (
          <FlashBanner
            type="success"
            message="Gmail connected successfully."
            onDismiss={() => dismiss("gmail_connected")}
          />
        )}
        {gmailFlash === "error" && !dismissed["gmail_error"] && (
          <FlashBanner
            type="error"
            message={`Gmail connection failed: ${gmailReason ?? "unknown error"}`}
            onDismiss={() => dismiss("gmail_error")}
          />
        )}
        {outlookFlash === "connected" && !dismissed["outlook_connected"] && (
          <FlashBanner
            type="success"
            message="Outlook connected successfully."
            onDismiss={() => dismiss("outlook_connected")}
          />
        )}
        {outlookFlash === "error" && !dismissed["outlook_error"] && (
          <FlashBanner
            type="error"
            message={`Outlook connection failed: ${outlookReason ?? "unknown error"}`}
            onDismiss={() => dismiss("outlook_error")}
          />
        )}

        {/* Email providers */}
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
            Email providers
          </h3>
          <ul className="divide-y divide-[var(--color-border)]">
            <OAuthIntegrationRow
              name="Gmail"
              connected={props.gmailConnected}
              connectedEmail={props.gmailEmail}
              connectHref="/api/gmail/oauth/start"
              disconnectAction="/api/gmail/disconnect"
            />
            <OAuthIntegrationRow
              name="Outlook / Microsoft 365"
              connected={props.outlookConnected}
              connectedEmail={props.outlookEmail}
              connectHref="/api/outlook/oauth/start"
              disconnectAction="/api/outlook/disconnect"
            />
          </ul>
        </div>

        {/* API keys */}
        <div className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
            API keys
          </h3>
          <ul className="divide-y divide-[var(--color-border)]">
            <ApiKeyRow
              name="Google Places API"
              envKey="GOOGLE_PLACES_API_KEY"
              configured={props.googlePlacesConfigured}
              description="Discovery adapter for local business search."
            />
            <ApiKeyRow
              name="PageSpeed Insights API"
              envKey="PAGESPEED_API_KEY"
              configured={props.pageSpeedConfigured}
              description="Optional enhancement to the website audit."
            />
            <ApiKeyRow
              name="Anthropic API (AI provider)"
              envKey="ANTHROPIC_API_KEY"
              configured={props.anthropicConfigured}
              description="Powers AI-generated opportunity briefs and outreach drafts. Falls back to templates if absent."
            />
          </ul>
        </div>

        {/* Cal.com */}
        <div className="mb-4 rounded-sm border border-[var(--color-border)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Calendar
              aria-hidden
              className="h-4 w-4 text-[var(--color-text-subtle)]"
            />
            <span className="text-sm font-medium text-[var(--color-text)]">
              Cal.com booking link
            </span>
            {props.calcomConfig ? (
              <Badge variant="success">
                <CheckCircle2 aria-hidden className="h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="muted">Not set</Badge>
            )}
          </div>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            Your public Cal.com scheduling URL. Once saved, use the
            &ldquo;Insert booking link&rdquo; button on any draft to append it
            to the email body.
          </p>
          <form
            ref={calFormRef}
            action={async (fd: FormData) => {
              setCalStatus("saving");
              setCalError("");
              try {
                await setCalcomLinkAction(fd);
                setCalStatus("saved");
                setTimeout(() => setCalStatus("idle"), 2000);
              } catch (err) {
                setCalError((err as Error).message);
                setCalStatus("error");
              }
            }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Cal.com URL"
                hint="e.g. https://cal.com/yourname/30min"
              >
                <Input
                  name="calcomUrl"
                  type="url"
                  placeholder="https://cal.com/yourname/30min"
                  defaultValue={props.calcomConfig?.calcomUrl ?? ""}
                  required
                />
              </Field>
              <Field label="Default meeting duration (minutes)">
                <select
                  name="defaultDuration"
                  defaultValue={String(props.calcomConfig?.defaultDuration ?? 30)}
                  className="h-8 w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm"
                >
                  {[15, 20, 30, 45, 60, 90].map((d) => (
                    <option key={d} value={String(d)}>
                      {d} min
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {calError && (
              <p className="text-xs text-[color:#991b1b]">{calError}</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={calStatus === "saving"}
              >
                {calStatus === "saving"
                  ? "Saving…"
                  : calStatus === "saved"
                    ? "Saved!"
                    : "Save Cal.com link"}
              </Button>
              {props.calcomConfig && (
                <a
                  href={props.calcomConfig.calcomUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[var(--color-accent-700)] hover:underline"
                >
                  <Link2 aria-hidden className="h-3 w-3" />
                  Preview
                </a>
              )}
            </div>
          </form>
        </div>

        {/* Slack webhook (informational — full CRUD in notification prefs) */}
        <div className="rounded-sm border border-[var(--color-border)] p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
            Slack webhook URL
            {props.slackWebhookUrl ? (
              <Badge variant="success">
                <CheckCircle2 aria-hidden className="h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="muted">Not set</Badge>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Manages hot-lead alerts and weekly digests. Full settings under
            Notifications preferences.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
