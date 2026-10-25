"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { useJourney } from "./journey";

export function JourneyAutoStart() {
  const params = useSearchParams();
  const j = useJourney();
  const router = useRouter();
  useEffect(() => {
    if (params.get("journey") === "1" && j) {
      if (params.get("welcome") === "1") {
        toast.success("あなた専用のデモ事務所を作成しました", { description: "他の閲覧者の操作の影響を受けません。次回はボタンひとつで続きから再開できます。", duration: 7000 });
      }
      j.start();
      router.replace("/app");
    }
  }, [params, j, router]);
  return null;
}
