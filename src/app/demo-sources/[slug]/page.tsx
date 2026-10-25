import { notFound } from "next/navigation";
import { DEMO_SOURCES } from "@/lib/demo/sources";
import { sanitizeSourceText } from "@/lib/domain/sanitize";
import { fmtDate } from "@/lib/utils";

/** Viewer for FICTIONAL demo source documents (what the "fixture" connector fetches). */
export const metadata = { title: "架空の情報源（デモ）", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return DEMO_SOURCES.filter((s) => !s.failure).map((s) => ({ slug: s.slug }));
}

export default async function DemoSourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const src = DEMO_SOURCES.find((s) => s.slug === slug && !s.failure);
  if (!src) notFound();
  const { text } = sanitizeSourceText(src.html, true);
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-st-revision px-4 py-2 text-center text-xs text-white">これはデモ用に作成した架空の情報源です。実在の企業・報道機関とは関係ありません。</div>
      <article className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-xs text-slate">{src.publisher}</p>
        <h1 className="mt-2 text-2xl font-bold leading-snug text-ink">{src.title}</h1>
        <p className="mt-2 font-num text-xs text-slate">{fmtDate(src.publishedAt, { time: true })}</p>
        <div className="mt-8 space-y-4 text-[15px] leading-loose text-ink-2">
          {text.split("\n").map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </article>
    </div>
  );
}
