import { ArrowUpRight, Radar } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { JourneyAutoStart } from "@/components/journey/autostart";
import { DetectionChart, IncidentTimeline, KpiStrip } from "@/components/shell/dashboard-parts";
import { PageHeader, Section } from "@/components/shell/page-header";
import { AiModeBadge, Pill } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { requireTenantViewer } from "@/lib/auth/session";
import { STEP_LABEL } from "@/lib/collector/events";
import { runContractSweep } from "@/lib/server/ops";
import { getDashboard } from "@/lib/server/queries";
import { cn, fmtDate, fmtRelative } from "@/lib/utils";

export const metadata = { title: "ダッシュボード" };

const TASK_LABEL: Record<string, string> = {
  classify: "事件分類", article_generate: "記事生成", update_proposal: "続報更新案", seo_title: "SEOタイトル", meta_description: "メタ説明", sns_post: "SNS投稿文", paragraph_regenerate: "段落再生成",
};

export default async function DashboardPage() {
  const viewer = await requireTenantViewer();
  await runContractSweep();
  const d = await getDashboard(viewer);
  const usagePct = d.ai.limit ? Math.min(100, Math.round((d.ai.used / d.ai.limit) * 100)) : 0;
  const lastStats = d.ai.lastRun?.stats ?? {};

  return (
    <div className="mx-auto max-w-[1400px]">
      <Suspense><JourneyAutoStart /></Suspense>
      <PageHeader
        eyebrow={`Dashboard · ${fmtDate(new Date())}`}
        title={<>{viewer.tenant.shortName}<span className="text-ink-3">の情報発信状況</span></>}
        description={<>収集した事件候補、承認待ちの記事、公開中のページを一望できます。数値はすべて保存データから算出しています{d.isDemo && <Pill tone="gold" className="ml-2 align-middle">デモデータ</Pill>}</>}
        actions={
          <Button asChild variant="primary">
            <Link href="/app/radar"><Radar /> 情報を収集する</Link>
          </Button>
        }
      />

      <KpiStrip
        items={[
          { label: "本日検出した事件候補", value: d.kpi.todayDetected, sub: "日本時間 0:00 以降", href: "/app/radar", testId: "kpi-today" },
          { label: "未確認の事件", value: d.kpi.unreviewed, sub: "自所で確認状態が未設定", href: "/app/radar?review=unreviewed" },
          { label: "承認待ちの記事", value: d.kpi.pendingApproval, sub: "In Review", href: "/app/approvals", testId: "kpi-pending" },
          { label: "重要な更新", value: d.kpi.materialUpdates, sub: `再承認待ち ${d.kpi.revisionRequired}件`, href: "/app/articles", tone: "warn", testId: "kpi-material" },
          { label: "公開中のページ", value: d.kpi.livePages, sub: "承認済みの版のみ", href: "/app/site", testId: "kpi-live" },
          { label: "AI処理（今月）", value: d.ai.used, sub: `上限 ${d.ai.limit.toLocaleString()}回`, href: "/app/inspector", tone: "gold" },
        ]}
      />

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          <Section eyebrow="Incident Timeline" title="公表日ベースの事件タイムライン" actions={<Link href="/app/radar" className="text-xs text-navy hover:underline">Radarで見る →</Link>}>
            <IncidentTimeline items={d.timeline} links />
            <div className="mt-2 flex flex-wrap gap-4 text-2xs text-slate">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-cat-personal" />個人情報漏えい</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-cat-cyber" />サイバー攻撃</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-cat-consumer" />消費者被害</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-cat-other" />その他</span>
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <Section eyebrow="Detections" title="検出・続報の推移（14日）">
              <DetectionChart data={d.detections} />
              <p className="mt-2 text-2xs text-slate">新規事件と、既存事件に追加された続報・関連報道の件数。</p>
            </Section>
            <Section eyebrow="Recent Activity" title="最近の操作履歴">
              <ol className="relative space-y-3 border-l border-line pl-4" data-testid="activity">
                {d.activity.length === 0 && <li className="text-xs text-slate">操作履歴はまだありません</li>}
                {d.activity.map((a, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[19.5px] top-1.5 size-[7px] rounded-full border border-white bg-navy-3" aria-hidden />
                    <p className="text-xs text-ink">
                      <span className="font-medium">{a.actor ?? "システム"}</span>が{a.action}
                    </p>
                    {a.target && (a.link ? <Link href={a.link} className="block truncate text-2xs text-navy hover:underline">{a.target}</Link> : <p className="truncate text-2xs text-slate">{a.target}</p>)}
                    <p className="font-num text-[10px] text-slate tnum">{fmtRelative(a.at)}</p>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
        </div>

        <aside className="space-y-8">
          <Section eyebrow="AI Processing" title="AI処理状況" actions={<AiModeBadge provider={d.ai.provider} model={d.ai.model} />}>
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-ink-3">今月の利用量</span>
                  <span className="font-num tnum text-ink"><b>{d.ai.used}</b> / {d.ai.limit}</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-ivory-3" role="progressbar" aria-valuenow={usagePct} aria-valuemin={0} aria-valuemax={100} aria-label="AI利用量">
                  <div className={cn("h-full", usagePct >= 90 ? "bg-st-suspended" : "bg-navy")} style={{ width: `${usagePct}%` }} />
                </div>
              </div>
              <div className="border-t border-line pt-3">
                <p className="text-xs text-ink-3">最終の情報収集</p>
                {d.ai.lastRun ? (
                  <>
                    <p className="mt-0.5 text-[13px] text-ink">{fmtDate(d.ai.lastRun.started_at, { time: true })} <span className="text-slate">({fmtRelative(d.ai.lastRun.started_at)})</span></p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(Object.keys(STEP_LABEL) as (keyof typeof STEP_LABEL)[]).map((s) => (
                        <span key={s} className="rounded-[2px] border border-st-approved/30 bg-st-approved/5 px-1.5 py-0.5 text-2xs text-st-approved">{STEP_LABEL[s].ja}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-2xs text-slate">新規 {lastStats.newIncidents ?? 0} · 続報 {lastStats.updates ?? 0} · 重複除外 {lastStats.duplicates ?? 0} · 取得失敗 {lastStats.failedSources ?? 0}</p>
                  </>
                ) : (
                  <p className="mt-0.5 text-[13px] text-slate">まだ実行されていません</p>
                )}
              </div>
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-xs text-ink-3">直近のAIタスク</p>
                <ul className="space-y-1.5">
                  {d.ai.recent.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-xs">
                      <span className={cn("size-1.5 rounded-full", r.status === "succeeded" ? "bg-st-approved" : r.status === "running" ? "bg-st-review" : "bg-st-suspended")} aria-hidden />
                      <span className="flex-1 truncate text-ink">{TASK_LABEL[r.task] ?? r.task}</span>
                      <span className="font-num text-[11px] text-slate tnum">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/app/inspector" className="mt-3 inline-flex items-center gap-1 text-xs text-navy hover:underline">AI Processing Inspector <ArrowUpRight className="size-3" /></Link>
              </div>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
