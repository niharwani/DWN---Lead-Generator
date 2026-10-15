import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "accent" | "success" | "warning";
};

const toneBorder: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-[var(--color-border)]",
  accent: "border-[var(--color-accent-300)]",
  success: "border-[var(--color-success-100)]",
  warning: "border-[var(--color-warning-100)]",
};

const toneIcon: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-[var(--color-text-subtle)]",
  accent: "text-[var(--color-accent-600)]",
  success: "text-[var(--color-success-600)]",
  warning: "text-[color:#8c6a00]",
};

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: Props) {
  return (
    <div
      className={cn(
        "rounded-md border bg-[var(--color-surface)] px-4 py-3",
        toneBorder[tone]
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          {label}
        </span>
        {Icon ? <Icon aria-hidden className={cn("h-3.5 w-3.5", toneIcon[tone])} /> : null}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--color-text)]">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-[var(--color-text-subtle)]">{hint}</div>
      ) : null}
    </div>
  );
}
