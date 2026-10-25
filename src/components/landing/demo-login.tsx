"use client";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { api, ClientApiError } from "@/lib/client/api";

/**
 * "デモを体験する" — one click: resumes the visitor's own demo firm, or creates one (no form),
 * then starts the guided journey. The code prompt only appears without an invitation cookie.
 */
export function DemoStartButton({ needsCode, label = "デモを体験する", journey = true, ...props }: { needsCode: boolean; label?: string; journey?: boolean } & ButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [askCode, setAskCode] = useState(false);
  const [code, setCode] = useState("");
  const go = async () => {
    if (needsCode && !code) {
      setAskCode(true);
      return;
    }
    setLoading(true);
    try {
      const r = await api<{ redirect: string; resumed: boolean }>("/api/auth/quickstart", { body: { mode: "auto", code: code || undefined } });
      try {
        if (journey) window.localStorage.removeItem("aiip.journey.v1");
      } catch {
        /* ignore */
      }
      router.push(journey && r.redirect === "/app" ? "/app?journey=1" : r.redirect);
      if (r.resumed) toast.success("前回のデモ事務所を再開しました");
      router.refresh();
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "DEMO_CODE_REQUIRED") setAskCode(true);
      else toast.error(e instanceof ClientApiError ? e.message : "開始できませんでした");
      setLoading(false);
    }
  };
  if (askCode) {
    return (
      <form className="flex w-full max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <Input autoFocus aria-label="デモアクセスコード" placeholder="デモアクセスコード" value={code} onChange={(e) => setCode(e.target.value)} className="bg-white" />
        <Button type="submit" variant="gold" loading={loading}>開始</Button>
      </form>
    );
  }
  return (
    <Button onClick={go} loading={loading} {...props}>
      {label} <ArrowRight />
    </Button>
  );
}
