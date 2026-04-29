import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary-tint text-primary border border-primary/15",
        outline: "border border-border bg-surface text-ink-soft",
        success: "bg-success-tint text-success border border-success/20",
        warning: "bg-warning-tint text-warning border border-warning/20",
        danger: "bg-danger-tint text-danger border border-danger/20",
        info: "bg-info-tint text-info border border-info/20",
        accent: "bg-accent-tint text-ink border border-accent/30",
        mono: "border border-border bg-elevated font-mono text-ink-soft",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}
