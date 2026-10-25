import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicArticle, type PublicFirmView } from "@/components/publish/public-article";
import { articleJsonLd, articleUrl, safeJsonLd } from "@/lib/domain/seo";
import { siteOrigin } from "@/lib/server/origin";
import { getPublicFirm, getPublicPage } from "@/lib/server/public-site";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tenant: string; slug: string }> };

async function load({ params }: Params) {
  const { tenant, slug } = await params;
  const firm = await getPublicFirm(tenant);
  if (!firm) return null;
  const page = await getPublicPage(firm.id, slug);
  return page ? { firm, page } : null;
}

export async function generateMetadata(p: Params): Promise<Metadata> {
  const d = await load(p);
  if (!d) return { title: "ページが見つかりません", robots: { index: false } };
  const origin = await siteOrigin();
  const url = articleUrl(origin, d.firm.slug, d.page.slug);
  const c = d.page.content;
  return {
    title: { absolute: `${c.seo.title || c.title}｜${d.firm.name}` },
    description: c.seo.description,
    keywords: c.seo.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: c.seo.title || c.title,
      description: c.seo.description,
      siteName: d.firm.name,
      locale: "ja_JP",
      publishedTime: new Date(d.page.published_at).toISOString(),
      modifiedTime: new Date(d.page.updated_at).toISOString(),
    },
    twitter: { card: "summary", title: c.seo.title || c.title, description: c.seo.description },
    // demo content is fictional: keep it out of real search indexes
    robots: { index: false, follow: true },
  };
}

export default async function PublicArticlePage(p: Params) {
  const d = await load(p);
  if (!d) notFound();
  const origin = await siteOrigin();
  const url = articleUrl(origin, d.firm.slug, d.page.slug);
  const ld = articleJsonLd(origin, d.firm, d.page.slug, d.page.content, new Date(d.page.published_at).toISOString(), new Date(d.page.updated_at).toISOString());
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(ld) }} />
      <PublicArticle
        firm={d.firm as PublicFirmView}
        content={d.page.content}
        sources={d.page.source_snapshot}
        incident={{ title: d.page.incident_title, organization_name: d.page.organization_name, category: d.page.category, disclosed_on: d.page.disclosed_on }}
        publishedAt={d.page.published_at}
        updatedAt={d.page.updated_at}
        shareUrl={url}
      />
    </>
  );
}
