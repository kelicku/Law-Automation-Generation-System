import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { OpsButtons, TenantControls } from "@/components/ops/ops-controls";
import { PageHeader, Section } from "@/components/shell/page-header";
import { Pill } from "@/components/ui/badges";
import { requireViewer } from "@/lib/auth/session";
import { operationsOverview, runContractSweep } from "@/lib/server/ops";
import { cn, fmtDate, fmtRelative } from "@/lib/utils";

export const metadata = { title: "Operations Center" };
const PLAN: Record<string, string> = { starter: "Starter", standard: "Standard", professional: "Professional" };

export default async function OperationsPage() {
  const viewer = await requireViewer();
  if (viewer.platformRole !== "operator") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="eyebrow">Operations Center</p>
        <h1 className="h-serif mt-2 text-2xl font-semibold">運営者のみが閲覧できます</h1>
        <p className="mt-3 text-sm text-ink-3">このページはサーバー側で権限を確認しています。デモでは画面上部の切替から「運営管理者」を選ぶと表示できます。</p>
      </div>
    );
  }
  await runContractSweep();
  const o = await operationsOverview(viewer);
  const lastBackup = o.backups[0];
  const maxCalls = Math.max(1, ...o.usageByDay.map((d) => d.calls as number));
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Operations Center"
        title="運営状況"
        description="事務所ごとの利用状況、AI利用量と上限、契約期限、処理失敗、バックアップを管理します。運営者は記事の本文など事務所の非公開データにはアクセスしません（集計値のみ）。"
        actions={<OpsButtons />}
      />

      <Section eyebrow="Tenants" title="事務所別の利用状況">
        <div className="scroll-x border-y border-line bg-white">
          <table className="w-full min-w-[1150px] text-[13px]" data-testid="ops-tenants">
            <thead className="border-b border-line bg-ivory/60 text-left text-2xs text-slate">
              <tr>
                <th className="px-4 py-2.5 font-medium">事務所</th><th className="px-3 py-2.5 font-medium">契約</th><th className="px-3 py-2.5 font-medium">AI利用（今月）</th>
                <th className="px-3 py-2.5 font-medium">記事生成</th><th className="px-3 py-2.5 font-medium">公開ページ</th><th className="px-3 py-2.5 font-medium">処理失敗</th><th className="px-3 py-2.5 pr-4 font-medium">操作（デモ用）</th>
              </tr>
            </thead>
            <tbody>
              {o.tenants.map((t) => {
                const pct = t.ai_monthly_call_limit ? Math.min(100, (t.ai_calls / t.ai_monthly_call_limit) * 100) : 100;
                const days = Number(t.days_left);
                return (
                  <tr key={t.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-2 font-medium"><span className="size-2.5" style={{ background: t.brand_primary }} />{t.short_name}</p>
                      <p className="mt-0.5 text-2xs text-slate">{PLAN[t.plan]} · ¥{Number(t.monthly_fee_jpy).toLocaleString()}/月</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-num tnum">{fmtDate(t.ends_on)} まで</p>
                      <p className={cn("mt-0.5", days <= 7 ? "text-st-suspended" : days <= 30 ? "text-st-revision" : "text-slate")} data-testid={`days-left-${t.slug}`}>残り{days}日{days <= 30 && " · 更新確認"}</p>
                    </td>
                    <td className="w-[220px] px-3 py-3">
                      <p className="font-num text-xs tnum"><b>{t.ai_calls}</b> / {t.ai_monthly_call_limit}回{t.ai_calls >= t.ai_monthly_call_limit && <Pill tone="danger" className="ml-1.5">上限到達・停止中</Pill>}</p>
                      <div className="mt-1 h-1.5 bg-ivory-3"><div className={cn("h-full", pct >= 100 ? "bg-st-suspended" : pct >= 80 ? "bg-st-revision" : "bg-navy")} style={{ width: `${pct}%` }} /></div>
                      <p className="mt-1 font-num text-[11px] text-slate tnum">{Number(t.ai_tokens).toLocaleString()} tokens · ${Number(t.ai_cost).toFixed(4)}</p>
                    </td>
                    <td className="px-3 py-3 font-num tnum">{t.generations}</td>
                    <td className="px-3 py-3 font-num tnum">{t.live_pages}<span className="text-2xs text-slate"> / 記事{t.articles}</span></td>
                    <td className={cn("px-3 py-3 font-num tnum", t.failures > 0 && "text-st-suspended")}>{t.failures}</td>
                    <td className="px-3 py-3 pr-4"><TenantControls tenantId={t.id} limit={t.ai_monthly_call_limit} used={t.ai_calls} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-2xs text-slate">AI利用量が上限に達すると、その事務所の新規AI処理はサーバー側で拒否されます（情報収集の分類はルール分類に自動で切り替わります）。</p>
      </Section>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <Section eyebrow="AI usage" title="AI処理回数（14日・全事務所）">
          <div className="flex h-28 items-end gap-1">
            {o.usageByDay.map((d) => (
              <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.calls}回`}>
                <div className="bg-navy-3" style={{ height: `${((d.calls as number) / maxCalls) * 100}%`, minHeight: 2 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-num text-[10px] text-slate"><span>{o.usageByDay[0]?.day}</span><span>今日</span></div>
          <p className="mt-3 text-xs text-ink-3">今月の失敗：情報収集 {o.failures.collection}件 / AI処理 {o.failures.ai}件</p>
        </Section>

        <Section eyebrow="Backup" title="バックアップ状態">
          {lastBackup ? (
            <div className="text-xs" data-testid="backup-status">
              <p className={cn("flex items-center gap-1.5 text-sm font-medium", lastBackup.status === "succeeded" ? "text-st-approved" : lastBackup.status === "failed" ? "text-st-suspended" : "text-st-review")}>
                {lastBackup.status === "succeeded" ? <CheckCircle2 className="size-4" /> : lastBackup.status === "failed" ? <XCircle className="size-4" /> : <CircleDashed className="size-4" />}
                {{ succeeded: "成功", failed: "失敗", running: "実行中" }[lastBackup.status as string]}
                <span className="font-normal text-slate">（{fmtRelative(lastBackup.started_at)}）</span>
              </p>
              {lastBackup.file_name && <p className="mt-1 break-all font-mono text-[11px] text-ink-3">{lastBackup.file_name}</p>}
              {lastBackup.size_bytes && <p className="mt-0.5 text-ink-3">{(Number(lastBackup.size_bytes) / 1024).toFixed(1)} KB · sha256 {String(lastBackup.checksum).slice(0, 12)}…</p>}
              {lastBackup.error && <p className="mt-1 text-st-suspended">{lastBackup.error}</p>}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-slate" data-testid="backup-status"><CircleDashed className="size-4" />未実行（まだバックアップは取得されていません）</p>
          )}
          <p className="mt-3 text-2xs leading-relaxed text-slate">デモではアプリケーションが全業務テーブルをJSONに書き出し、ファイルサイズを再確認してから成功として記録します。本番ではマネージドDBのPITRと併用します。</p>
        </Section>

        <Section eyebrow="Notifications" title="通知履歴（運営者向け）">
          <ul className="max-h-72 divide-y divide-line overflow-y-auto text-xs" data-testid="ops-notifications">
            {o.notifications.length === 0 && <li className="py-3 text-slate">通知はありません</li>}
            {o.notifications.map((n) => (
              <li key={n.id} className="py-2">
                <p className={cn("font-medium", n.severity === "critical" ? "text-st-suspended" : n.severity === "warning" ? "text-st-revision" : "text-ink")}>{n.title}</p>
                {n.body && <p className="text-ink-3">{n.body}</p>}
                <p className="font-num text-[10.5px] text-slate">{fmtDate(n.created_at, { time: true })}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
