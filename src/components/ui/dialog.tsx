"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, side }: { className?: string; children: React.ReactNode; title: string; description?: string; side?: "right" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <D.Content
        className={cn(
          "fixed z-50 bg-white shadow-lift focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-xl border-l border-line data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
            : "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[4px] border border-line data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="h-serif text-lg text-ink">{title}</D.Title>
            {description && <D.Description className="mt-1 text-xs text-slate">{description}</D.Description>}
          </div>
          <D.Close className="rounded-sm p-1 text-slate hover:bg-ivory-2 hover:text-ink" aria-label="閉じる"><X className="size-4" /></D.Close>
        </div>
        <div className={cn("px-5 py-4", side === "right" && "h-[calc(100%-73px)] overflow-y-auto")}>{children}</div>
      </D.Content>
    </D.Portal>
  );
}
