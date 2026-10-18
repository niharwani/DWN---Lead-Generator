"use client";

/**
 * Invite acceptance landing page.
 *
 * Route: /invite/[token]
 *
 * Displayed states:
 *   - Loading: verifying the invite token server-side (via fetch to the API).
 *   - Valid: shows workspace name, role, and "Accept invitation" button.
 *     If the user is not signed in: shows a "Sign in to accept" flow.
 *   - Expired: shows a clear "This invite has expired" message.
 *   - Already used: shows a "This invite has already been accepted" message.
 *   - Invalid: shows "This invite link is not valid" message.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type InviteState =
  | { status: "loading" }
  | { status: "unauthenticated"; workspaceName: string; role: string }
  | { status: "ready"; workspaceName: string; role: string }
  | { status: "accepted" }
  | { status: "expired" }
  | { status: "already_used" }
  | { status: "invalid" }
  | { status: "error"; message: string };

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginStatus, setLoginStatus] = useState<"idle" | "submitting" | "sent">("idle");
  const [accepting, setAccepting] = useState(false);

  // Resolve params (Next 15 async params)
  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  // Once we have the token, try to accept via the API to discover invite status
  useEffect(() => {
    if (!token) return;

    // Probe the invite status by attempting to accept (the API handles auth check)
    // In a production app we might have a separate GET /api/invites/[token] endpoint.
    // Here we just show the appropriate UI based on cookie presence.
    setState({ status: "loading" });

    // We use a simple approach: call accept and handle the responses.
    // If we get a session-required redirect hint we show sign-in.
    fetch(`/api/invites/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.redirected) {
          // No session — show sign-in UI
          // We don't know the workspace name from here, use a generic message
          setState({ status: "unauthenticated", workspaceName: "this workspace", role: "member" });
          return;
        }
        const data = (await res.json()) as {
          accepted?: boolean;
          workspaceId?: string;
          role?: string;
          error?: { code?: string; message?: string };
        };

        if (res.ok && data.accepted) {
          setState({ status: "accepted" });
          // Redirect to overview after a brief moment
          setTimeout(() => {
            window.location.href = "/overview";
          }, 1500);
          return;
        }

        // Handle error codes
        const code = data.error?.code;
        if (code === "invite_expired") {
          setState({ status: "expired" });
        } else if (code === "invite_already_used") {
          setState({ status: "already_used" });
        } else if (code === "invalid_invite") {
          setState({ status: "invalid" });
        } else if (res.status === 401) {
          // requireOwner threw 401 — not authenticated
          setState({ status: "unauthenticated", workspaceName: "this workspace", role: "member" });
        } else {
          setState({
            status: "error",
            message: data.error?.message ?? "Something went wrong.",
          });
        }
      })
      .catch(() => {
        setState({ status: "error", message: "Network error. Please try again." });
      });
  }, [token]);

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim()) return;
    setLoginStatus("submitting");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          returnTo: `/invite/${token}`,
        }),
      });
      if (res.ok) {
        setLoginStatus("sent");
      } else {
        setLoginStatus("idle");
      }
    } catch {
      setLoginStatus("idle");
    }
  }

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setState({ status: "accepted" });
        setTimeout(() => {
          window.location.href = "/overview";
        }, 1500);
      } else {
        const data = (await res.json()) as { error?: { message?: string } };
        setState({
          status: "error",
          message: data.error?.message ?? "Could not accept invitation.",
        });
      }
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    } finally {
      setAccepting(false);
    }
  }

  /* --- Render --- */

  if (state.status === "loading") {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">Verifying invitation…</p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === "accepted") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome aboard!</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            You have successfully joined the workspace. Redirecting you now…
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === "expired") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation expired</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            This invitation link has expired. Please ask the workspace owner to send a
            new invitation.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === "already_used") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation already accepted</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            This invitation has already been used.{" "}
            <a href="/overview" className="underline">
              Go to your workspace
            </a>
            .
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === "invalid") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid invitation</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            This invitation link is not valid. It may have been revoked or the link
            may be incomplete.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-[var(--color-danger-500)]">{state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs text-[var(--color-text-subtle)] underline"
            type="button"
          >
            Try again
          </button>
        </CardBody>
      </Card>
    );
  }

  if (state.status === "unauthenticated") {
    if (loginStatus === "sent") {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Check your inbox</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              We sent a sign-in link to{" "}
              <strong className="text-[var(--color-text)]">{loginEmail}</strong>. After
              signing in you will be taken back here to accept the invitation.
            </p>
          </CardBody>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to accept invitation</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">
            You have been invited to join{" "}
            <strong className="text-[var(--color-text)]">{state.workspaceName}</strong> as a{" "}
            <Badge variant="muted">{state.role}</Badge>. Sign in to accept.
          </p>
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <Field label="Email address">
              <Input
                type="email"
                placeholder="you@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={loginStatus === "submitting"}
            >
              {loginStatus === "submitting" ? "Sending…" : "Send sign-in link"}
            </Button>
          </form>
        </CardBody>
      </Card>
    );
  }

  // state.status === "ready" — authenticated, show accept button
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept invitation</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          You have been invited to join{" "}
          <strong className="text-[var(--color-text)]">{state.workspaceName}</strong> as a{" "}
          <Badge variant="muted">{state.role}</Badge>.
        </p>
        <Button
          variant="primary"
          className="w-full"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? "Accepting…" : "Accept invitation"}
        </Button>
      </CardBody>
    </Card>
  );
}
