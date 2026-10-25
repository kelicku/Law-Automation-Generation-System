import Link from "next/link";
import { EvidenceTrace } from "@/components/evidence/evidence-trace";
import { PageHeader } from "@/components/shell/page-header";
import { loadBundle } from "@/lib/server/load-article";

export const metadata = { title: "Evidence Trace" };

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, bundle } = await loadBundle(id);
  const editable = ["draft", "revision_required"].includes(bundle.article.status) && viewer.role !== "viewer";
  return (
    <div className="mx-auto max-w-[1400px]">
      <Link href={`/app/articles/${id}`} className="text-xs text-slate hover:text-ink">← エディタに戻る</Link>
      <PageHeader
        className="mt-3"
        eyebrow="Evidence Trace"
        title="記述と出典の照合"
        description="記事中の文を選択すると、根拠となる出典の該当箇所を強調表示します。引用は出典本文との文字列照合で検証され、AIの推測と出典に記載された事実を区別して扱います。"
      />
      <EvidenceTrace bundle={bundle} editable={editable} />
    </div>
  );
}
