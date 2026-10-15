import * as React from "react";
import Link from "next/link";
import type { LinkProps } from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md";

type StyleProps = {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-600)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent-600)] text-white hover:bg-[var(--color-accent-700)]",
  secondary:
    "border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-neutral-100)]",
  ghost:
    "text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]",
  subtle:
    "bg-[var(--color-neutral-100)] text-[var(--color-text)] hover:bg-[var(--color-neutral-200)]",
  danger:
    "bg-[var(--color-danger-500)] text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
};

export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: StyleProps & { className?: string } = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & StyleProps;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    />
  )
);
Button.displayName = "Button";

type ButtonLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  Pick<LinkProps, "href"> &
  StyleProps;

export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...rest}>
      {children}
    </Link>
  );
}
