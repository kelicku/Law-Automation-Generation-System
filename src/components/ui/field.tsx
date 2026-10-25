import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-9 w-full rounded-[3px] border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-slate focus:border-navy/50 focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:opacity-60", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("w-full rounded-[3px] border border-line-strong bg-white px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-slate focus:border-navy/50 focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:opacity-60", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn("h-9 rounded-[3px] border border-line-strong bg-white pl-3 pr-8 text-sm text-ink focus:border-navy/50 focus:outline-none focus:ring-2 focus:ring-gold/30", className)} {...props}>
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-ink-2", className)} {...props} />;
}
