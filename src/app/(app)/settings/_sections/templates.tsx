"use client";

/**
 * Draft templates settings section.
 *
 * Editable draft templates stored in `app_settings` under `templates/v1`.
 * Provides a variable autocomplete picker and a preview button.
 */

import { useTransition, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { saveTemplateAction, previewTemplateAction } from "@/lib/actions";
import { KNOWN_VARIABLE_KEYS } from "@/lib/variables/registry";
import { FileText, Eye } from "lucide-react";

export type DraftTemplate = {
  key: string;
  label: string;
  subject?: string;
  body: string;
};

type Props = {
  initialTemplates: DraftTemplate[];
};

export function TemplatesSection({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<DraftTemplate[]>(
    initialTemplates.length > 0
      ? initialTemplates
      : [
          {
            key: "default_email",
            label: "Default email",
            subject: "Quick note for {{lead.business_name}} from {{owner.studio_name}}",
            body:
              "Hi {{lead.business_name}} team,\n\nWe took a look at {{lead.website_url}} to prepare for this note.\n\n{{owner.pitch}}\n\nIf this feels off, no worries at all — I won't follow up again unless you reply.\n\n— {{owner.signature}}",
          },
        ]
  );
  const [activeKey, setActiveKey] = useState(templates[0]?.key ?? "");
  const [isPending, startTransition] = useTransition();
  const [previewOutput, setPreviewOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const activeTemplate = templates.find((t) => t.key === activeKey) ?? templates[0];

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveTemplateAction(fd);
        setSaved(true);
        const updated = {
          key: String(fd.get("key") ?? ""),
          label: String(fd.get("label") ?? ""),
          subject: String(fd.get("subject") ?? ""),
          body: String(fd.get("body") ?? ""),
        };
        setTemplates((prev) =>
          prev.some((t) => t.key === updated.key)
            ? prev.map((t) => (t.key === updated.key ? updated : t))
            : [...prev, updated]
        );
      } catch (err) {
        setError((err as Error).message ?? "Save failed.");
      }
    });
  }

  function handlePreview(e: React.MouseEvent) {
    e.preventDefault();
    if (!bodyRef.current) return;
    const body = bodyRef.current.value;
    setError(null);
    setPreviewOutput(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("body", body);
        const result = await previewTemplateAction(fd);
        setPreviewOutput(result);
      } catch (err) {
        setError((err as Error).message ?? "Preview failed.");
      }
    });
  }

  function insertVariable(key: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const token = `{{${key}}}`;
    ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(start + token.length, start + token.length);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
            <FileText aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle>Draft templates</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Editable templates with{" "}
              <code className="rounded bg-[var(--color-neutral-100)] px-1">
                {"{{variable}}"}
              </code>{" "}
              substitution.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {templates.length > 1 ? (
          <div className="mb-4 flex gap-2">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setActiveKey(t.key);
                  setPreviewOutput(null);
                  setSaved(false);
                }}
                className={
                  "rounded-sm border px-2.5 py-1 text-xs " +
                  (t.key === activeKey
                    ? "border-[var(--color-accent-600)] bg-[var(--color-accent-100)] text-[var(--color-accent-700)]"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-600)]")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        {activeTemplate ? (
          <form onSubmit={handleSave}>
            <input type="hidden" name="key" value={activeTemplate.key} />
            <div className="grid gap-3">
              <Field label="Template label">
                <Input
                  name="label"
                  defaultValue={activeTemplate.label}
                  required
                  maxLength={100}
                />
              </Field>
              <Field label="Subject (email only)">
                <Input
                  name="subject"
                  defaultValue={activeTemplate.subject ?? ""}
                  maxLength={300}
                />
              </Field>
              <Field label="Body">
                <Textarea
                  ref={bodyRef}
                  name="body"
                  defaultValue={activeTemplate.body}
                  className="min-h-[160px] font-mono text-xs"
                  required
                />
              </Field>
            </div>

            {/* Variable picker */}
            <div className="mt-3">
              <p className="mb-2 text-[11px] text-[var(--color-text-subtle)]">
                Insert variable:
              </p>
              <div className="flex flex-wrap gap-1">
                {KNOWN_VARIABLE_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => insertVariable(k)}
                    className="rounded bg-[var(--color-neutral-100)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-accent-100)] hover:text-[var(--color-accent-700)]"
                  >
                    {`{{${k}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview output */}
            {previewOutput !== null ? (
              <div className="mt-3 rounded-sm border border-[var(--color-border)] bg-[var(--color-neutral-50)] p-3">
                <p className="mb-1 text-[11px] font-medium text-[var(--color-text-muted)]">Preview (sample lead):</p>
                <pre className="whitespace-pre-wrap text-xs text-[var(--color-text)]">
                  {previewOutput}
                </pre>
              </div>
            ) : null}

            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            {saved ? <p className="mt-2 text-xs text-green-600">Template saved.</p> : null}

            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={handlePreview}
                disabled={isPending}
              >
                <Eye aria-hidden className="h-3.5 w-3.5" />
                Preview
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save template"}
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
