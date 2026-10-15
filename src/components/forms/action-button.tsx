import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

/**
 * Wraps a server-action button in its own `<form>` so the action fires on
 * click without any client JS. Use this for discrete one-button mutations
 * (approve a draft, mark contacted, complete a task).
 *
 * For multi-field forms, write a `<form action={serverAction}>` directly.
 */
export function ActionButton({
  action,
  hiddenFields = {},
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  children,
  title,
}: {
  action: (formData: FormData) => Promise<void>;
  hiddenFields?: Record<string, string | undefined>;
  variant?: Variant;
  size?: Size;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <form action={action} className="inline-flex">
      {Object.entries(hiddenFields).map(([k, v]) =>
        v != null ? <input key={k} type="hidden" name={k} value={v} /> : null
      )}
      <button
        type="submit"
        title={title}
        disabled={disabled}
        className={cn(buttonClasses({ variant, size }), className)}
      >
        {children}
      </button>
    </form>
  );
}
