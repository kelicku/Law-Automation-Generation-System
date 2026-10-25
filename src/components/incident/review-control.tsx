"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, ClientApiError } from "@/lib/client/api";
import { REVIEW_LABEL, type ReviewStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function ReviewControl({ incidentId, status }: { incidentId: string; status: ReviewStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const set = async (s: ReviewStatus) => {
    const prev = value;
    setValue(s);
    try {
      await api(`/api/incidents/${incidentId}/review`, { body: { status: s } });
      toast.success(`確認状態を「${REVIEW_LABEL[s]}」に変更しました`);
      router.refresh();
    } catch (e) {
      setValue(prev);
      toast.error(e instanceof ClientApiError ? e.message : "変更できませんでした");
    }
  };
  return (
    <div role="radiogroup" aria-label="自所での確認状態" className="inline-flex border border-line-strong bg-white">
      {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((s) => (
        <button key={s} role="radio" aria-checked={value === s} onClick={() => set(s)} className={cn("border-l border-line px-3 py-1.5 text-xs first:border-l-0", value === s ? "bg-navy text-white" : "text-ink-2 hover:bg-ivory-2")}>
          {REVIEW_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
