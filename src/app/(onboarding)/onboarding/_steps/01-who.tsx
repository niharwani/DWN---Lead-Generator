"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { saveOnboardingStepAction } from "@/lib/actions";
import { StepHeader } from "./_shared";
import type { OnboardingState } from "@/lib/onboarding/state";

export function WhoStep({ state }: { state: OnboardingState }) {
  const [pending, startTransition] = useTransition();
  const who = state.data.who ?? {};

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await saveOnboardingStepAction(1, {
        workspaceName: String(fd.get("workspaceName") ?? "").trim(),
        fullName: String(fd.get("fullName") ?? "").trim(),
        websiteUrl: String(fd.get("websiteUrl") ?? "").trim(),
        attributionSource: String(fd.get("attributionSource") ?? "").trim(),
      });
    });
  }

  return (
    <div className="space-y-8">
      <StepHeader
        step={1}
        total={5}
        title="Who are you?"
        description="Let's set up your workspace. This takes about a minute."
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Workspace name"
          hint="This is how your workspace appears in the app. You can change it later."
        >
          <Input
            name="workspaceName"
            defaultValue={who.workspaceName ?? ""}
            placeholder="Acme Studio"
            required
            maxLength={120}
            aria-label="Workspace name"
          />
        </Field>

        <Field label="Your full name">
          <Input
            name="fullName"
            defaultValue={who.fullName ?? ""}
            placeholder="Alex Johnson"
            maxLength={120}
            aria-label="Your full name"
          />
        </Field>

        <Field
          label="Your website"
          hint="Optional — used in outreach drafts as your 'from' URL."
        >
          <Input
            name="websiteUrl"
            type="url"
            defaultValue={who.websiteUrl ?? ""}
            placeholder="https://yoursite.com"
            maxLength={500}
            aria-label="Your website URL"
          />
        </Field>

        <Field label="How did you hear about us?" hint="Optional — helps us improve.">
          <Select
            name="attributionSource"
            defaultValue={who.attributionSource ?? ""}
            aria-label="Attribution source"
          >
            <option value="">Choose one (optional)</option>
            <option value="twitter_x">Twitter / X</option>
            <option value="linkedin">LinkedIn</option>
            <option value="word_of_mouth">Word of mouth</option>
            <option value="product_hunt">Product Hunt</option>
            <option value="search">Google / search</option>
            <option value="newsletter">Newsletter</option>
            <option value="other">Other</option>
          </Select>
        </Field>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Next →"}
          </Button>
        </div>
      </form>
    </div>
  );
}
