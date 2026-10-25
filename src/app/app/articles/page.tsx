import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { CategoryTag, Pill, StatusBadge } from "@/components/ui/badges";
import { requireTenantViewer } from "@/lib/auth/session";
import { ARTICLE_STATUSES, STATUS_LABEL, type ArticleStatus, type Category } from "@/lib/domain/types";
import { listArticles } from "@/lib/server/queries";
import { cn, fmtRelative } from "@/lib/utils";

export const metadata = { title: "記事" };

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const viewer = await requireTenantViewer();
  const { status } = await searchParams;
  const all = await listArticles(viewer);
  const rows = status && (ARTICLE_STATUSES as readonly string[]).includes(status) ? all.filter((r) => r.status === status) : all;
  const counts = Object.fromEntries(ARTICLE_STATUSES.map((s) => [s, all.filter((r) => r.status === s).length]));
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader eyebrow="Articles" title="記事" description="AIが生成した下書きから公開中の記事まで。公開版と編集中の最新版のバージョンを並べて確認できます。新しい記事は Incident Radar の事件詳細から生成します。" />
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="状態で絞り込み">
        <Link href="/app/articles" className={cn("border px-2.5 py-1 text-xs", !status ? "border-navy bg-navy text-white" : "border-line-strong bg-white text-ink-2 hover:bg-ivory-2")}>すべて {all.length}</Link>
        {ARTICLE_STATUSES.map((s) => (
          <Link key={s} href={`/app/articles?status=${s}`} className={cn("border px-2.5 py-1 text-xs", status === s ? "border-navy bg-navy text-white" : "border-line-strong bg-white text-ink-2 hover:bg-ivory-2")}>
            {STATUS_LABEL[s].ja} <span className="font-num opacity-70">{counts[s]}</span>
          </Link>
        ))}
      </nav>
      <div className="scroll-x border-y border-line bg-white">
        <table className="w-full min-w-[900px] text-[13px]" data-testid="articles-table">
          <thead className="border-b border-line bg-ivory/60 text-left text-2xs text-slate">
            <tr>
              <th className="px-4 py-2.5 font-medium">記事</th>
              <th className="px-3 py-2.5 font-medium">状態</th>
              <th className="px-3 py-2.5 font-medium">版</th>
              <th className="px-3 py-2.5 font-medium">作成者</th>
              <th className="px-3 py-2.5 pr-4 font-medium">更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate">該当する記事はありません</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0 hover:bg-ivory/50">
                <td className="max-w-[460px] px-4 py-3">
                  <Link href={`/app/articles/${r.id}`} className="font-medium text-ink hover:underline">{r.title}</Link>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                    <span>{r.organization_name}</span>
                    <CategoryTag category={r.category as Category} />
                    {r.has_update && <span className="inline-flex items-center gap-1 text-st-revision"><TriangleAlert className="size-3" />続報あり</span>}
                  </div>
                </td>
                <td className="px-3 py-3"><StatusBadge status={r.status as ArticleStatus} /></td>
                <td className="px-3 py-3 font-num text-xs tnum">
                  <span>最新 v{r.latest_version}</span>
                  {r.published_version && <Pill tone={r.page_status === "live" ? "gold" : "danger"} className="ml-1.5">公開 v{r.published_version}{r.page_status === "suspended" && "（停止）"}</Pill>}
                </td>
                <td className="px-3 py-3 text-xs text-ink-3">{r.author ?? "—"}</td>
                <td className="px-3 py-3 pr-4 text-xs text-ink-3">{fmtRelative(r.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
