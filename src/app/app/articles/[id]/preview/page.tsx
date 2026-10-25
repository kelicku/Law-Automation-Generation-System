import { Check, Minus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { WorkflowActions } from "@/components/editor/workflow";
import { DeviceSimulator } from "@/components/publish/simulator";
import { PageHeader, Section } from "@/components/shell/page-header";
import { Pill, StatusBadge } from "@/components/ui/badges";
import type { ArticleContent } from "@/lib/domain/article";
import { articleJsonLd, articleUrl } from "@/lib/domain/seo";
import { dbCtx } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { getVersionContent } from "@/lib/server/articles";
import { loadBundle } from "@/lib/server/load-article";
import { siteOrigin } from "@/lib/server/origin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Publication Simulator" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, bundle } = await loadBundle(id);
  const a = bundle.article;
  const origin = await siteOrigin();
  const firm = await withUser(dbCtx(viewer), async (tx) => {
    const [f] = await tx`select t.name, t.slug, s.address, s.phone, s.lawyers from tenants t join tenant_settings s on s.tenant_id = t.id where t.id = ${viewer.tenant.id}`;
    return f as unknown as { name: string; slug: string; address: string; phone: string; lawyers: { name: string; title: string }[] };
  });
  const published: ArticleContent | null = a.published_version_id && bundle.page ? await getVersionContent(viewer, id, a.published_version_id) : null;
  const c = published ?? a.working;
  const url = articleUrl(origin, firm.slug, a.slug);
  const ld = articleJsonLd(origin, firm, a.slug, c, bundle.page?.published_at ?? new Date().toISOString(), bundle.page?.published_at ?? new Date().toISOString());
  const live = bundle.page?.status === "live";
  const tLen = [...c.seo.title].length;
  const dLen = [...c.seo.description].length;
  const checks: [string, boolean | null, string][] = [
    ["SEOタイトル", tLen > 0 && tLen <= 40, `${tLen}字`],
    ["メタディスクリプション", dLen >= 50 && dLen <= 130, `${dLen}字`],
    ["OGP（og:title / og:description / og:type）", true, "生成済み"],
    ["構造化データ（Article / LegalService / Breadcrumb）", true, "JSON-LD"],
    ["canonical URL", true, "設定済み"],
    ["サイトマップへの掲載", live, live ? "掲載中" : "公開後に掲載"],
    ["検索エンジンへのインデックス", null, "デモのため noindex"],
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <Link href={`/app/articles/${id}`} className="text-xs text-slate hover:text-ink">← エディタに戻る</Link>
      <PageHeader
        className="mt-3"
        eyebrow="Publication Simulator"
        title="公開ページの確認"
        description="管理画面とは異なる、事務所ごとのブランドで公開されるページを各デバイスで確認できます。公開版は承認済みの版だけが表示されます。"
        actions={<><StatusBadge status={a.status} />{bundle.page && <Pill tone={live ? "ok" : "danger"}>公開ページ {live ? "公開中" : "停止中"} · v{bundle.page.version_no}</Pill>}</>}
      />
      <div className="grid grid-cols-1 gap-8 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <DeviceSimulator articleId={id} hasPublished={!!bundle.page} liveUrl={live ? `/sites/${firm.slug}/${a.slug}` : null} />
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-4">
            <p className="text-xs text-ink-3">公開・停止の操作：</p>
            <WorkflowActions articleId={id} status={a.status} role={viewer.role} compact />
          </div>
        </div>
        <aside className="space-y-8">
          <Section eyebrow="SEO" title={`SEO設定（${published ? "公開版" : "最新版"}）`}>
            <ul className="divide-y divide-line text-xs" data-testid="seo-checks">
              {checks.map(([k, ok, note]) => (
                <li key={k} className="flex items-center gap-2 py-2">
                  {ok === true ? <Check className="size-3.5 text-st-approved" /> : ok === false ? <TriangleAlert className="size-3.5 text-st-revision" /> : <Minus className="size-3.5 text-slate" />}
                  <span className="flex-1">{k}</span>
                  <span className="text-slate">{note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-l-2 border-gold bg-gold-soft/30 px-3 py-2 text-2xs leading-relaxed text-ink-2">
              これらは検索エンジンに情報を正しく伝えるための「設定の有無」です。検索順位や表示を保証するものではありません。
            </p>
          </Section>
          <Section eyebrow="Open Graph" title="SNSでの表示（OGP）">
            <div className="overflow-hidden border border-line bg-white">
              <div className="flex h-28 items-end bg-navy p-4"><p className="h-serif line-clamp-2 text-sm text-white">{c.seo.title || c.title}</p></div>
              <div className="p-3">
                <p className="truncate text-2xs uppercase text-slate">{new URL(origin).host}</p>
                <p className="mt-0.5 line-clamp-1 text-[13px] font-medium">{c.seo.title || c.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{c.seo.description}</p>
              </div>
            </div>
          </Section>
          <Section eyebrow="Structured data" title="構造化データ（JSON-LD）">
            <pre className="max-h-64 overflow-auto bg-navy p-3 font-mono text-[10.5px] leading-relaxed text-white/80" data-testid="jsonld">{JSON.stringify(ld, null, 2)}</pre>
          </Section>
          <Section eyebrow="Sitemap" title="サイトマップ・URL">
            <dl className="space-y-2 text-xs">
              <div><dt className="text-slate">canonical</dt><dd className="break-all font-mono text-[11px]">{url}</dd></div>
              <div><dt className="text-slate">sitemap.xml</dt><dd><a className={cn("break-all font-mono text-[11px] text-navy hover:underline")} href={`/sites/${firm.slug}/sitemap.xml`} target="_blank" rel="noopener noreferrer" data-testid="sitemap-link">{origin}/sites/{firm.slug}/sitemap.xml</a></dd></div>
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}
