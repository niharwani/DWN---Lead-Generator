import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "block w-full rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus-visible:border-[var(--color-accent-600)] focus-visible:outline-none disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input ref={ref} className={cn(base, "h-8", className)} {...rest} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(base, "min-h-[88px] py-2 leading-relaxed resize-y", className)}
    {...rest}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...rest }, ref) => (
  <select
    ref={ref}
    className={cn(base, "h-8 pr-7 appearance-none bg-[length:12px] bg-[right_8px_center] bg-no-repeat", className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2371717a'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
    }}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  children,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-xs font-medium text-[var(--color-text-muted)]",
        className
      )}
      {...rest}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? (
        <p className="text-[11px] text-[var(--color-text-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}
