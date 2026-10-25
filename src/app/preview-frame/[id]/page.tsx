import { notFound } from "next/navigation";
import { PublicArticle, type PublicFirmView } from "@/components/publish/public-article";
import type { ArticleContent } from "@/lib/domain/article";
import { dbCtx } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { getVersionContent, sourceSnapshot } from "@/lib/server/articles";
import { loadBundle } from "@/lib/server/load-article";
import { siteOrigin } from "@/lib/server/origin";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Authenticated preview of the public design (rendered inside the Publication Simulator iframe). */
export default async function PreviewFrame({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const { viewer, bundle } = await loadBundle(id);
  const firm = await withUser(dbCtx(viewer), async (tx) => {
    const [f] = await tx`
      select t.slug, t.name, t.short_name, t.logo_mark, t.brand_primary, t.brand_accent, s.tagline, s.lawyers, s.consultation_form_url, s.fee_notice, s.address, s.phone, s.office_hours
      from tenants t join tenant_settings s on s.tenant_id = t.id where t.id = ${viewer.tenant.id}`;
    return f as unknown as PublicFirmView;
  });
  const published = v === "published";
  if (published && !bundle.page) notFound();
  const content: ArticleContent = published && bundle.article.published_version_id ? await getVersionContent(viewer, id, bundle.article.published_version_id) : bundle.article.working;
  const origin = await siteOrigin();
  return (
    <PublicArticle
      firm={firm}
      content={content}
      sources={sourceSnapshot(bundle.sources)}
      incident={{ title: bundle.incident.title, organization_name: bundle.incident.organization_name, category: bundle.incident.category, disclosed_on: bundle.incident.disclosed_on }}
      publishedAt={bundle.page?.published_at ?? null}
      updatedAt={published ? bundle.page?.published_at ?? null : bundle.article.working_updated_at}
      shareUrl={`${origin}/sites/${firm.slug}/${bundle.article.slug}`}
      preview={published ? null : "working"}
    />
  );
}
