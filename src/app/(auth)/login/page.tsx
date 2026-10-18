"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok) {
        setStatus("sent");
      } else {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(data.error?.message ?? "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-[var(--color-text-muted)]">
            We sent a sign-in link to{" "}
            <strong className="text-[var(--color-text)]">{email}</strong>.
            Click the link in the email to continue. It expires in 15 minutes.
          </p>
          <button
            onClick={() => { setStatus("idle"); setEmail(""); }}
            className="mt-4 text-xs text-[var(--color-text-subtle)] underline underline-offset-2 hover:text-[var(--color-text-muted)]"
            type="button"
          >
            Use a different email
          </button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          Enter your email address and we&apos;ll send you a sign-in link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email address">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </Field>

          {error && (
            <p className="text-xs text-[var(--color-danger-500)]">{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
