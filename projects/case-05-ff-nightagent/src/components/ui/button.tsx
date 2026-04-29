import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ease-out-slow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alive/60 focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap select-none [&>a]:inline-flex [&>a]:items-center [&>a]:justify-center [&>a]:gap-2 [&>a]:h-full [&>a]:w-full [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        accent:
          "text-void bg-[linear-gradient(90deg,#00D4FF_0%,#C084FC_50%,#F472B6_100%)] bg-[length:200%_100%] hover:bg-[position:100%_0] shadow-[0_0_0_0_rgba(0,212,255,0.5)] hover:shadow-[0_8px_32px_-6px_rgba(0,212,255,0.45)]",
        solid:
          "bg-white text-void hover:bg-white/90",
        ghost:
          "glass text-text-hi hover:bg-white/[0.06] border-white/10",
        outline:
          "border border-stroke-strong text-text-hi hover:bg-white/[0.03]",
        link:
          "text-alive hover:text-alive underline underline-offset-4",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-full",
        md: "h-10 px-5 text-sm rounded-xl",
        lg: "h-12 px-6 text-sm rounded-xl",
        xl: "h-14 px-7 text-base rounded-2xl",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };
