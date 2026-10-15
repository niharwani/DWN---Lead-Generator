import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({
  className,
  children,
  ...rest
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className={cn("w-full text-sm", className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-[var(--color-border)] bg-[var(--color-neutral-50)]",
        className
      )}
      {...rest}
    >
      {children}
    </thead>
  );
}

export function TBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("divide-y divide-[var(--color-border)]", className)} {...rest}>
      {children}
    </tbody>
  );
}

export function TR({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("hover:bg-[var(--color-neutral-50)] transition-colors", className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({
  className,
  children,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]",
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  className,
  children,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3 py-2.5 align-middle text-[var(--color-text)]", className)}
      {...rest}
    >
      {children}
    </td>
  );
}
