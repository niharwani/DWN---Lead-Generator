import * as React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted"
  | "outline";

const variants: Record<Variant, string> = {
  default: "bg-[var(--color-neutral-100)] text-[var(--color-text-muted)]",
  accent: "bg-[var(--color-accent-100)] text-[var(--color-accent-700)]",
  success: "bg-[var(--color-success-100)] text-[var(--color-success-700)]",
  warning: "bg-[var(--color-warning-100)] text-[color:#8c6a00]",
  danger: "bg-[var(--color-danger-100)] text-[color:#991b1b]",
  info: "bg-[var(--color-info-100)] text-[color:#1e40af]",
  muted: "bg-[var(--color-neutral-100)] text-[var(--color-text-subtle)]",
  outline:
    "border border-[var(--color-border-strong)] bg-transparent text-[var(--color-text-muted)]",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        variants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
