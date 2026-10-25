import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FirmFooter, FirmHeader, type PublicFirmView } from "@/components/publish/public-article";
import { CATEGORY_LABEL } from "@/lib/domain/types";
import { getPublicFirm, listPublicPages } from "@/lib/server/public-site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const firm = await getPublicFirm((await params).tenant);
  if (!firm) return { title: "ページが見つかりません" };
  return { title: { absolute: `${firm.name}｜事件・事故の解説` }, description: firm.tagline, robots: { index: false, follow: true } };
}

export default async function FirmHome({ params }: { params: Promise<{ tenant: string }> }) {
  const firm = await getPublicFirm((await params).tenant);
  if (!firm) notFound();
  const pages = await listPublicPages(firm.id);
  return (
    <div className="min-h-screen bg-[#FDFCFA] text-[#222]">
      <FirmHeader firm={firm as PublicFirmView} />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <p className="font-serif text-2xl leading-relaxed" style={{ color: firm.brand_primary }}>{firm.tagline}</p>
        <h1 className="mt-10 border-b pb-2 text-sm font-semibold" style={{ color: firm.brand_primary, borderColor: `${firm.brand_accent}88` }}>事件・事故の解説</h1>
        {pages.length === 0 ? (
          <p className="py-10 text-sm text-[#666]">現在公開中の記事はありません。</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "#eee" }} data-testid="public-list">
            {pages.map((p) => (
              <li key={p.slug} className="py-5">
                <p className="text-xs text-[#666]">{CATEGORY_LABEL[p.category]} ・ {new Date(p.updated_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} 更新</p>
                <Link href={`/sites/${firm.slug}/${p.slug}`} className="mt-1 block font-serif text-lg hover:underline" style={{ color: firm.brand_primary }}>{p.content.title}</Link>
                <p className="mt-1 line-clamp-2 text-sm text-[#555]">{p.content.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <FirmFooter firm={firm as PublicFirmView} />
    </div>
  );
}
