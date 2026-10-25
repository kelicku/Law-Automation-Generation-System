"use client";
import * as Sw from "@radix-ui/react-switch";
import * as Tt from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function Switch({ className, ...p }: Sw.SwitchProps) {
  return (
    <Sw.Root className={cn("relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-navy", className)} {...p}>
      <Sw.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </Sw.Root>
  );
}

export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tt.Provider delayDuration={200}>
      <Tt.Root>
        <Tt.Trigger asChild>{children}</Tt.Trigger>
        <Tt.Portal>
          <Tt.Content sideOffset={6} className="z-50 max-w-xs rounded-[3px] bg-navy px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-lift">
            {content}
            <Tt.Arrow className="fill-navy" />
          </Tt.Content>
        </Tt.Portal>
      </Tt.Root>
    </Tt.Provider>
  );
}
