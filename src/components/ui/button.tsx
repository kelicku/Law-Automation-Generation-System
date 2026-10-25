import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-navy text-white hover:bg-navy-2 shadow-hair",
        gold: "bg-gold text-navy hover:bg-[#cdb385] shadow-hair",
        outline: "border border-line-strong bg-white text-ink hover:border-navy/40 hover:bg-ivory-2",
        ghost: "text-ink-2 hover:bg-ivory-2 hover:text-ink",
        danger: "border border-st-suspended/30 bg-white text-st-suspended hover:bg-st-suspended/5",
        link: "text-navy underline-offset-4 hover:underline px-0",
        onDark: "border border-white/15 bg-white/5 text-white hover:bg-white/10",
      },
      size: { sm: "h-8 px-3 text-xs rounded-[3px]", md: "h-9 px-4 rounded-[3px]", lg: "h-11 px-6 text-[15px] rounded-[3px]", icon: "size-9 rounded-[3px]" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (<>{loading && <Loader2 className="animate-spin" aria-hidden />}{children}</>)}
    </Comp>
  );
});
Button.displayName = "Button";
export { buttonVariants };
