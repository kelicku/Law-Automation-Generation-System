import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Pill } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { dbCtx, requireTenantViewer } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "公開サイト" };

export default async function SitePage() {
  const viewer = await requireTenantViewer();
  const pages = await withUser(dbCtx(viewer), (tx) => tx`
    select p.slug, p.status, p.published_at, p.suspended_at, p.content->>'title' as title, a.id as article_id, v.version_no,
           u.display_name as publisher
    from published_pages p join article_drafts a on a.id = p.article_id join article_versions v on v.id = p.version_id
    left join users u on u.id = p.published_by order by p.published_at desc`);
  const base = `/sites/${viewer.tenant.slug}`;
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        eyebrow="Public site"
        title={`${viewer.tenant.shortName} の公開サイト`}
        description="公開サイトには、弁護士が承認した版だけが表示されます。公開ページは管理画面とは別のデータベース権限（公開用ロール）で読み込まれ、非公開データにはアクセスできません。"
        actions={<>
          <Button asChild variant="outline"><a href={base} target="_blank" rel="noopener noreferrer">サイトを開く <ExternalLink /></a></Button>
          <Button asChild variant="ghost"><a href={`${base}/sitemap.xml`} target="_blank" rel="noopener noreferrer">sitemap.xml</a></Button>
        </>}
      />
      <ul className="divide-y divide-line border-y border-line bg-white">
        {pages.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate">公開中のページはありません</li>}
        {pages.map((p) => (
          <li key={p.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Pill tone={p.status === "live" ? "ok" : "danger"}>{p.status === "live" ? "公開中" : "停止中"}</Pill>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{p.title}</p>
              <p className="font-num text-[11px] text-slate tnum">v{p.version_no} · {fmtDate(p.published_at, { time: true })} 公開 · {p.publisher}{p.suspended_at && ` · ${fmtDate(p.suspended_at, { time: true })} 停止`}</p>
            </div>
            <Link href={`/app/articles/${p.article_id}/preview`} className="text-xs text-navy hover:underline">Simulator</Link>
            {p.status === "live" && <a href={`${base}/${p.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-navy hover:underline">公開URL <ExternalLink className="size-3" /></a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
