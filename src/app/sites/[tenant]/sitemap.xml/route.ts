import { sitemapXml } from "@/lib/domain/seo";
import { siteOrigin } from "@/lib/server/origin";
import { getPublicFirm, listPublicPages } from "@/lib/server/public-site";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const firm = await getPublicFirm((await params).tenant);
  if (!firm) return new Response("Not found", { status: 404 });
  const pages = await listPublicPages(firm.id);
  const xml = sitemapXml(await siteOrigin(), firm.slug, pages.map((p) => ({ slug: p.slug, updated_at: new Date(p.updated_at).toISOString() })));
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" } });
}
