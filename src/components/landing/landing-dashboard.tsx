"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { IncidentTimeline, KpiStrip, type TimelineItem } from "@/components/shell/dashboard-parts";
import { api, ClientApiError } from "@/lib/client/api";
import { fmtRelative } from "@/lib/utils";

export interface LandingMetrics {
  incidents: number;
  today_detected: number;
  pending_approval: number;
  material_updates: number;
  live_pages: number;
  sources: number;
  ai_runs: number;
  last_collect: string | null;
  timeline: TimelineItem[];
}

/** The real dashboard components, fed by live aggregate counts. Clicking anything signs in to the demo. */
export function LandingDashboard({ m, needsCode }: { m: LandingMetrics; needsCode: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const enter = async () => {
    if (needsCode) {
      router.push("/login");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ redirect: string }>("/api/auth/quickstart", { body: { mode: "auto" } });
      router.push(r.redirect === "/app" ? "/app?journey=1" : r.redirect);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "開始できませんでした");
      setBusy(false);
    }
  };
  return (
    <div className="overflow-hidden rounded-[6px] border border-white/10 bg-navy shadow-frame" aria-busy={busy}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-navy-2 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" /><span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 truncate font-mono text-[11px] text-white/60">/app — 管理ダッシュボード（ライブ）</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-[2px] border border-gold/40 px-1.5 py-0.5 text-[10px] text-gold">
          <span className="size-1.5 animate-pulse rounded-full bg-gold" />デモ環境の保存データ
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <KpiStrip
          dark
          onItemClick={enter}
          items={[
            { label: "本日検出した事件候補", value: m.today_detected, sub: `累計 ${m.incidents}件` },
            { label: "承認待ちの記事", value: m.pending_approval, sub: "全デモ事務所" },
            { label: "重要な更新", value: m.material_updates, sub: "再承認が必要" },
            { label: "公開中のページ", value: m.live_pages, sub: "承認済みの版" },
            { label: "取得済みの出典", value: m.sources, sub: "公表文・報道" },
            { label: "AI処理（今月）", value: m.ai_runs, sub: "シミュレーション含む", tone: "gold" },
          ]}
        />
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-num text-[10px] uppercase tracking-[0.2em] text-white/60">Incident Timeline</p>
            <p className="text-[10px] text-white/60">最終収集 {m.last_collect ? fmtRelative(m.last_collect) : "未実行"}</p>
          </div>
          <IncidentTimeline items={m.timeline} dark onItemClick={enter} days={34} />
        </div>
        <p className="mt-3 text-[11px] text-white/60">数値・事件はデモ用に保存された架空データから算出しています。クリックするとデモ環境に入ります。</p>
      </div>
    </div>
  );
}
