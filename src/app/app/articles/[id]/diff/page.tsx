import { ArrowRight, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { WorkflowActions } from "@/components/editor/workflow";
import { SmartDiffView } from "@/components/diff/smart-diff";
import { PageHeader } from "@/components/shell/page-header";
import { Pill, StatusBadge } from "@/components/ui/badges";
import type { ArticleContent } from "@/lib/domain/article";
import { diffArticles, diffStats } from "@/lib/domain/diff";
import { getVersionContent } from "@/lib/server/articles";
import { loadBundle } from "@/lib/server/load-article";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Smart Diff" };

export default async function DiffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  const { viewer, bundle } = await loadBundle(id);
  const a = bundle.article;
  const versions = bundle.versions;
  const fromVersion = versions.find((v) => v.id === from)
    ?? versions.find((v) => v.id === a.published_version_id)
    ?? versions[1]
    ?? versions[0];
  const before: ArticleContent = fromVersion ? await getVersionContent(viewer, id, fromVersion.id) : a.working;
  const rows = diffArticles(before, a.working);
  const stats = diffStats(rows);
  const isPublishedBase = fromVersion?.id === a.published_version_id && bundle.page;
  const latestNo = versions[0]?.version_no;

  return (
    <div className="mx-auto max-w-[1300px]">
      <Link href={`/app/articles/${id}`} className="text-xs text-slate hover:text-ink">← エディタに戻る</Link>
      <PageHeader
        className="mt-3"
        eyebrow="Smart Diff"
        title="続報による変更の確認"
        description="承認済みの公開版と、編集中の最新版を別々に保持しています。最新版は承認されるまで公開ページに反映されません。"
        actions={<StatusBadge status={a.status} />}
      />

      {a.pending_update && (
        <div className="mb-6 grid grid-cols-1 gap-px border border-st-revision/30 bg-st-revision/20 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.2fr)]" data-testid="material-change">
          <div className="bg-white px-5 py-4">
            <p className="text-2xs text-slate">変更前（{a.pending_update.label}）</p>
            <p className="mt-1 font-num text-xl text-ink-3 line-through decoration-st-suspended/40 tnum">{a.pending_update.before}</p>
          </div>
          <div className="hidden items-center bg-white px-2 md:flex"><ArrowRight className="size-5 text-st-revision" /></div>
          <div className="bg-white px-5 py-4">
            <p className="text-2xs text-slate">変更後</p>
            <p className="mt-1 font-num text-xl font-semibold text-st-revision tnum">{a.pending_update.after}</p>
          </div>
          <div className="flex items-start gap-2.5 bg-st-revision/5 px-5 py-4 text-xs leading-relaxed text-st-revision">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>重要な変更を検出したため、記事は再承認待ちになっています（検出 {fmtDate(a.pending_update.detected_at, { time: true })}）。{bundle.page?.status === "live" && "公開中のページは承認済みの旧版を表示し続けています。"}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <Pill tone="ok">追加 {stats.added}</Pill>
        <Pill tone="danger">削除 {stats.removed}</Pill>
        <Pill tone="warn">修正 {stats.modified}</Pill>
        <Pill>変更なし {stats.unchanged}</Pill>
        <form className="ml-auto flex items-center gap-2" action="">
          <label htmlFor="from" className="text-slate">比較元</label>
          <select id="from" name="from" defaultValue={fromVersion?.id} className="h-8 border border-line-strong bg-white px-2 text-xs">
            {versions.map((v) => <option key={v.id} value={v.id}>v{v.version_no}{v.id === a.published_version_id ? "（公開版）" : ""}</option>)}
          </select>
          <button className="h-8 border border-line-strong bg-white px-3 text-xs hover:bg-ivory-2">比較</button>
        </form>
      </div>

      <SmartDiffView
        rows={rows}
        beforeLabel={`v${fromVersion?.version_no ?? "?"}${isPublishedBase ? `・公開版（${bundle.page?.status === "live" ? "公開中" : "停止中"}・承認済み）` : ""}`}
        afterLabel={`最新版（編集中 v${latestNo}）`}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 border-t border-line pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex gap-3 text-xs leading-relaxed text-ink-3">
          <ShieldCheck className="size-5 shrink-0 text-navy" />
          <p>公開済みの記事は、新しい下書きが生成されても自動的に上書きされません。最新版を確認し、承認申請 → 弁護士の承認 → 公開 の順で反映します。</p>
        </div>
        <WorkflowActions articleId={a.id} status={a.status} role={viewer.role} />
      </div>
    </div>
  );
}
