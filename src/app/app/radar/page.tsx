import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { CollectPanel } from "@/components/radar/collect-panel";
import { RadarFilters, RadarTable, type RadarRowView } from "@/components/radar/radar-table";
import { requireTenantViewer } from "@/lib/auth/session";
import { lastCollectionRuns, listIncidents, RadarQuery } from "@/lib/server/queries";
import { cn, fmtDate } from "@/lib/utils";

export const metadata = { title: "Incident Radar" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireTenantViewer();
  const sp = await searchParams;
  const parsed = RadarQuery.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const query = parsed.success ? parsed.data : RadarQuery.parse({});
  const [rows, runs] = await Promise.all([listIncidents(viewer, query), lastCollectionRuns(viewer)]);
  const view: RadarRowView[] = rows.map((r) => ({ ...r, last_updated_at: new Date(r.last_updated_at).toISOString(), created_at: new Date(r.created_at).toISOString() }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="AI Incident Radar"
        title="事件情報の収集と分類"
        description="登録された情報源から公開情報を取得し、正規化・重複判定・AI分類を経て事件として保存します。事件の共通データは全事務所で共有され、確認状態や記事は事務所ごとに非公開で管理されます。"
      />
      <CollectPanel canRun={viewer.role !== "viewer"} />

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Suspense><RadarFilters /></Suspense>
        <p className="text-xs text-slate" data-testid="radar-count">{rows.length}件を表示</p>
      </div>
      <div className="mt-3">
        <Suspense><RadarTable rows={view} /></Suspense>
      </div>

      <section className="mt-10">
        <h2 className="h-serif mb-3 text-[15px] font-semibold">収集の実行履歴</h2>
        <ul className="divide-y divide-line border-y border-line text-xs">
          {runs.length === 0 && <li className="py-3 text-slate">まだ実行されていません</li>}
          {runs.map((r) => {
            const s = r.stats as Record<string, number>;
            const failed = ((r.source_results as { ok: boolean; name: string; error: string | null }[]) ?? []).filter((x) => !x.ok);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="font-num text-ink-2 tnum">{fmtDate(r.started_at, { time: true })}</span>
                <span className={cn("font-medium", r.status === "succeeded" ? "text-st-approved" : r.status === "partial" ? "text-st-revision" : r.status === "running" ? "text-st-review" : "text-st-suspended")}>
                  {{ succeeded: "成功", partial: "一部失敗", failed: "失敗", running: "実行中" }[r.status as string]}
                </span>
                <span className="text-ink-3">新規 {s.newIncidents ?? 0} / 続報・関連 {s.updates ?? 0} / 重複除外 {s.duplicates ?? 0}</span>
                {failed.map((f) => <span key={f.name} className="text-st-revision">取得失敗: {f.name}（{f.error}）</span>)}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
