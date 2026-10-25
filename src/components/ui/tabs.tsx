"use client";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...p }: T.TabsListProps) {
  return <T.List className={cn("flex items-end gap-5 border-b border-line", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn("-mb-px border-b-2 border-transparent pb-2 pt-1 text-xs font-medium text-slate transition-colors hover:text-ink data-[state=active]:border-gold data-[state=active]:text-ink", className)}
      {...p}
    />
  );
}
export const TabsContent = T.Content;
