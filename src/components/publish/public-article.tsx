import { ExternalLink, Mail, Phone, Share2 } from "lucide-react";
import Link from "next/link";
import type { ArticleContent } from "@/lib/domain/article";
import { CATEGORY_LABEL, type Category } from "@/lib/domain/types";
import type { DemoLawyer } from "@/lib/demo/tenants";

export interface PublicFirmView {
  slug: string;
  name: string;
  short_name: string;
  logo_mark: string;
  brand_primary: string;
  brand_accent: string;
  tagline: string;
  lawyers: DemoLawyer[];
  consultation_form_url: string;
  fee_notice: string;
  address: string;
  phone: string;
  office_hours: string;
}

const jaDate = (d: string | Date | null) => {
  if (!d) return "";
  const x = new Date(d);
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(x);
};

/** Variation per firm so the two demo tenants look like distinct websites. */
function variant(slug: string) {
  return slug.startsWith("hiiragi") ? "centered" : "classic";
}

export function FirmHeader({ firm }: { firm: PublicFirmView }) {
  const v = variant(firm.slug);
  return (
    <header style={{ background: v === "classic" ? firm.brand_primary : "#fff", borderBottom: v === "classic" ? "none" : `3px solid ${firm.brand_primary}` }}>
      <div className={v === "classic" ? "mx-auto flex max-w-5xl items-center gap-3 px-5 py-4" : "mx-auto flex max-w-5xl flex-col items-center px-5 py-6 text-center"}>
        <Link href={`/sites/${firm.slug}`} className={v === "classic" ? "flex items-center gap-3" : "flex flex-col items-center gap-2"}>
          <span className="flex size-10 items-center justify-center font-serif text-lg" style={{ border: `1px solid ${firm.brand_accent}`, color: v === "classic" ? firm.brand_accent : firm.brand_primary }}>{firm.logo_mark}</span>
          <span className="font-serif text-lg tracking-wide" style={{ color: v === "classic" ? "#fff" : firm.brand_primary }}>{firm.name}</span>
        </Link>
        <a href={firm.consultation_form_url} target="_blank" rel="noopener noreferrer" className={v === "classic" ? "ml-auto hidden px-4 py-2 text-sm sm:inline-block" : "mt-3 px-4 py-2 text-sm"} style={v === "classic" ? { background: "#fff", color: firm.brand_primary, borderBottom: `2px solid ${firm.brand_accent}` } : { background: firm.brand_primary, color: "#fff" }}>
          ご相談の予約
        </a>
      </div>
    </header>
  );
}

export function FirmFooter({ firm }: { firm: PublicFirmView }) {
  return (
    <footer className="mt-16 text-sm text-white/80" style={{ background: firm.brand_primary }}>
      <div className="mx-auto grid grid-cols-1 max-w-5xl gap-6 px-5 py-10 sm:grid-cols-2">
        <div>
          <p className="font-serif text-base text-white">{firm.name}</p>
          <p className="mt-2 text-xs leading-relaxed">{firm.address}<br />{firm.phone} ／ {firm.office_hours}</p>
        </div>
        <p className="text-xs leading-relaxed text-white/60">本サイトはデモ用に作成した架空の法律事務所のサイトです。掲載の事件・企業・人物はすべて架空であり、実在のものとは関係ありません。</p>
      </div>
    </footer>
  );
}

export function PublicArticle({
  firm, content, sources, incident, publishedAt, updatedAt, shareUrl, preview,
}: {
  firm: PublicFirmView;
  content: ArticleContent;
  sources: { id: string; publisher: string; title: string; url: string; published_at: string | null }[];
  incident: { title: string; organization_name: string; category: Category; disclosed_on: string | null };
  publishedAt: string | Date | null;
  updatedAt: string | Date | null;
  shareUrl: string;
  preview?: "working" | null;
}) {
  const sourceNo = new Map(sources.map((s, i) => [s.id, i + 1]));
  const extraLinks = content.links.filter((l) => !sources.some((s) => s.url === l.url));
  const shareText = encodeURIComponent(content.sns.x || content.title);
  const accent = firm.brand_accent;
  const primary = firm.brand_primary;
  const v = variant(firm.slug);
  return (
    <div className="min-h-screen bg-[#FDFCFA] text-[#222]" style={{ fontFamily: "var(--font-sans)" }}>
      {preview && <div className="bg-[#A86A12] px-4 py-1.5 text-center text-xs text-white">プレビュー：承認前の最新版です。公開サイトには表示されていません。</div>}
      <FirmHeader firm={firm} />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <nav aria-label="パンくず" className="text-xs text-[#666]"><Link href={`/sites/${firm.slug}`} className="hover:underline">{firm.short_name}</Link> ／ 事件・事故の解説</nav>
        <p className="mt-6 inline-block px-2 py-0.5 text-xs" style={{ border: `1px solid ${accent}`, color: primary }}>{CATEGORY_LABEL[incident.category]}</p>
        <h1 className={`mt-3 font-serif text-[26px] font-semibold leading-snug sm:text-3xl ${v === "centered" ? "text-center" : ""}`} style={{ color: primary }}>{content.title}</h1>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#666]">
          <div className="flex gap-1"><dt>事件名：</dt><dd>{incident.title}</dd></div>
          <div className="flex gap-1"><dt>公開日：</dt><dd>{jaDate(publishedAt) || "未公開"}</dd></div>
          <div className="flex gap-1"><dt>更新日：</dt><dd data-testid="public-updated">{jaDate(updatedAt)}</dd></div>
        </dl>
        <section aria-label="事件概要" className="mt-6 border-l-4 bg-white px-5 py-4 text-[15px] leading-loose" style={{ borderColor: accent }}>
          <p className="mb-1 text-xs font-semibold" style={{ color: primary }}>事件の概要</p>
          {content.summary}
        </section>
        <article className="mt-8">
          {content.blocks.map((b) =>
            b.type === "heading" ? (
              <h2 key={b.id} className="mb-3 mt-10 border-b pb-2 font-serif text-xl font-semibold" style={{ color: primary, borderColor: `${accent}66` }}>{b.text}</h2>
            ) : (
              <p key={b.id} className="mb-4 text-[15.5px] leading-[2.05]">
                {b.sentences.map((s) => (
                  <span key={s.id}>{s.text}{s.refs.map((r, i) => <sup key={i}><a href={`#src-${sourceNo.get(r.sourceId)}`} className="ml-0.5 text-[11px]" style={{ color: primary }}>[{sourceNo.get(r.sourceId)}]</a></sup>)}</span>
                ))}
              </p>
            ),
          )}
        </article>

        <section aria-label="出典" className="mt-10 border-t pt-6" style={{ borderColor: "#e5e2da" }}>
          <h2 className="text-sm font-semibold" style={{ color: primary }}>出典</h2>
          <ol className="mt-3 space-y-2 text-sm" data-testid="public-sources">
            {sources.map((src, i) => (
              <li key={src.id} id={`src-${i + 1}`} className="flex gap-2">
                <span className="font-num text-xs text-[#666]">[{i + 1}]</span>
                <span>
                  <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1 underline decoration-[#ccc] underline-offset-4 hover:decoration-current" style={{ color: primary }}>
                    {src.publisher}「{src.title}」<ExternalLink className="mt-1 size-3 shrink-0" />
                  </a>
                  {src.published_at && <span className="ml-2 text-xs text-[#666]">{jaDate(src.published_at)}公表</span>}
                </span>
              </li>
            ))}
          </ol>
          {extraLinks.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-semibold text-[#666]">関連リンク</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {extraLinks.map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4" style={{ color: primary }}>{l.label}</a></li>)}
              </ul>
            </>
          )}
        </section>

        <section aria-label="ご相談" className="mt-10 bg-white p-6" style={{ border: `1px solid ${accent}55` }}>
          <h2 className="font-serif text-lg font-semibold" style={{ color: primary }}>この件についてのご相談</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#444]">影響を受けた可能性がある方は、お気軽にご相談ください。ご相談内容は弁護士の守秘義務により保護されます。</p>
          <div className="mt-4 bg-[#F6F4EF] px-4 py-3 text-xs leading-relaxed text-[#555]" data-testid="fee-notice"><b className="mr-1">費用について</b>{firm.fee_notice}</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={firm.consultation_form_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-white" style={{ background: primary }} data-testid="consult-link">
              <Mail className="size-4" />相談フォームへ（外部サイト）
            </a>
            <span className="inline-flex items-center gap-2 px-2 py-2.5 text-sm text-[#555]"><Phone className="size-4" />{firm.phone}</span>
          </div>
        </section>

        <section aria-label="弁護士紹介" className="mt-10">
          <h2 className="text-sm font-semibold" style={{ color: primary }}>担当弁護士</h2>
          <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {firm.lawyers.map((l) => (
              <li key={l.name} className="flex gap-3 border-t pt-3" style={{ borderColor: "#e5e2da" }}>
                <span className="flex size-12 shrink-0 items-center justify-center font-serif text-lg text-white" style={{ background: primary }}>{l.name.slice(0, 1)}</span>
                <div>
                  <p className="text-sm font-semibold">{l.name} <span className="text-xs font-normal text-[#666]">{l.title}</span></p>
                  <p className="text-xs text-[#666]">{l.bar}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#555]">{l.profile}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="共有" className="mt-10 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#666]">この記事を共有：</span>
          <a className="border px-3 py-1.5" style={{ borderColor: "#ddd" }} href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">X（旧Twitter）</a>
          <a className="inline-flex items-center gap-1 border px-3 py-1.5" style={{ borderColor: "#ddd" }} href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer"><Share2 className="size-3" />Facebook</a>
          <a className="border px-3 py-1.5" style={{ borderColor: "#ddd" }} href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">LINE</a>
        </section>

        <p className="mt-10 text-xs leading-relaxed text-[#666]">本記事は公表情報に基づく一般的な解説であり、個別の事案についての法的助言ではありません。記載内容は更新日時点の公表情報に基づきます。{incident.organization_name}およびその公表内容はデモ用の架空の情報です。</p>
      </main>
      <FirmFooter firm={firm} />
    </div>
  );
}
