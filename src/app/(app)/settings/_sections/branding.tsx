"use client";

/**
 * Branding settings section.
 * Workspace name, logo URL, accent color, and short pitch.
 * Calls `updateBrandingAction` on submit.
 */

import { useTransition, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { updateBrandingAction } from "@/lib/actions";
import { Palette } from "lucide-react";

type Props = {
  initialName?: string;
  initialLogoUrl?: string;
  initialAccentColor?: string;
  initialPitch?: string;
};

export function BrandingSection({
  initialName = "",
  initialLogoUrl = "",
  initialAccentColor = "",
  initialPitch = "",
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateBrandingAction(formData);
        setSaved(true);
      } catch (err) {
        setError((err as Error).message ?? "Save failed.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <Palette aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle>Branding</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Workspace name, logo, accent color, and pitch used in outreach.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workspace / Studio name">
              <Input
                name="name"
                defaultValue={initialName}
                placeholder="Your Studio Name"
                maxLength={200}
              />
            </Field>
            <Field label="Logo URL" hint="Publicly accessible image URL.">
              <Input
                name="logoUrl"
                defaultValue={initialLogoUrl}
                placeholder="https://example.com/logo.png"
                maxLength={2000}
              />
            </Field>
            <Field
              label="Accent color"
              hint="CSS color value: hex (#3b82f6), HSL, or named."
            >
              <div className="flex items-center gap-2">
                <Input
                  name="accentColor"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#3b82f6"
                  maxLength={80}
                />
                {accentColor ? (
                  <span
                    className="h-8 w-8 shrink-0 rounded-sm border border-[var(--color-border)]"
                    style={{ backgroundColor: accentColor }}
                    title={accentColor}
                  />
                ) : null}
              </div>
            </Field>
            <Field
              label="Short pitch"
              className="sm:col-span-2"
              hint="Appears as the fallback value proposition in draft templates."
            >
              <Textarea
                name="pitch"
                defaultValue={initialPitch}
                maxLength={500}
                placeholder="A small studio focused on websites and software."
              />
            </Field>
          </div>

          {error ? (
            <p className="mt-3 text-xs text-red-600">{error}</p>
          ) : null}
          {saved ? (
            <p className="mt-3 text-xs text-green-600">Branding saved.</p>
          ) : null}

          <div className="mt-3 flex justify-end">
            <Button variant="primary" size="sm" type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save branding"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
