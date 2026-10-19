"use client";

/**
 * Client component for subscription management actions on /billing/manage.
 * Wires Pause, Resume, and Cancel to the respective server actions.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ManageSubscriptionButtons() {
  const [loading, setLoading] = useState<"pause" | "resume" | "cancel" | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function callAction(action: "pause" | "resume" | "cancel") {
    setLoading(action);
    setMessage(null);
    try {
      const formData = new FormData();
      if (action === "cancel") {
        formData.append("cancelAtCycleEnd", "true");
      }

      const endpoint =
        action === "pause"
          ? "/api/billing/manage/pause"
          : action === "resume"
          ? "/api/billing/manage/resume"
          : "/api/billing/manage/cancel";

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? `Failed to ${action} subscription.` });
      } else {
        setMessage({
          type: "success",
          text:
            action === "pause"
              ? "Subscription paused."
              : action === "resume"
              ? "Subscription resumed."
              : "Cancellation scheduled for end of billing cycle.",
        });
        // Reload to reflect updated state
        window.location.reload();
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={loading !== null}
          onClick={() => callAction("pause")}
        >
          {loading === "pause" ? "Pausing…" : "Pause subscription"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={loading !== null}
          onClick={() => callAction("resume")}
        >
          {loading === "resume" ? "Resuming…" : "Resume subscription"}
        </Button>
      </div>

      <div>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading !== null}
          onClick={() => {
            if (
              window.confirm(
                "Cancel your subscription? You will retain access until the end of the billing cycle."
              )
            ) {
              void callAction("cancel");
            }
          }}
          className="text-red-600 hover:text-red-700"
        >
          {loading === "cancel" ? "Cancelling…" : "Cancel subscription"}
        </Button>
        <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
          Cancels at end of current billing cycle. You keep access until then.
        </p>
      </div>

      {message && (
        <p
          className={`text-xs ${
            message.type === "error" ? "text-red-600" : "text-[var(--color-success-700)]"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
