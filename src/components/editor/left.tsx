"use client";
import { History, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryTag, Pill } from "@/components/ui/badges";
import { api, ClientApiError } from "@/lib/client/api";
import { STATUS_LABEL, type ArticleStatus } from "@/lib/domain/types";
import { cn, fmtDate, fmtNum } from "@/lib/utils";
import { VERSION_KIND, type EditorBundle } from "./types";

const ACTION: Record<string, string> = {
  submit: "承認申請", approve: "承認", request_revision: "差し戻し", publish: "公開", suspend: "公開停止", republish: "再公開",
  reopen: "編集を再開", archive: "アーカイブ", restore: "復元", material_update: "重要な続報を検出",
};

export function LeftPane({ bundle, editable }: { bundle: EditorBundle; editable: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"versions" | "flow">("versions");
  const i = bundle.incident;
  const restore = async (id: string, no: number) => {
    if (!window.confirm(`v${no} の内容を復元しますか？（現在の内容は履歴に残ります）`)) return;
    try {
      await api(`/api/articles/${bundle.article.id}/restore`, { body: { versionId: id } });
      toast.success(`v${no} を復元しました`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "復元できませんでした");
    }
  };
  return (
    <div className="space-y-7 px-4 py-5 text-[13px] sm:px-5">
      <section>
        <p className="eyebrow">Incident</p>
        <Link href={`/app/incidents/${i.id}`} className="mt-1.5 block font-medium leading-snug text-ink hover:underline">{i.title}</Link>
        <p className="mt-1 text-xs text-ink-3">{i.organization_name}</p>
        <div className="mt-2"><CategoryTag category={i.category} /></div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div><dt className="text-2xs text-slate">発生日</dt><dd className="font-num tnum">{fmtDate(i.occurred_on)}</dd></div>
          <div><dt className="text-2xs text-slate">公表日</dt><dd className="font-num tnum">{fmtDate(i.disclosed_on)}</dd></div>
          <div className="col-span-2"><dt className="text-2xs text-slate">影響人数</dt><dd className="font-num tnum">{i.affected_count === null ? "未公表・調査中" : `${fmtNum(i.affected_count)}（${i.affected_count_status === "confirmed" ? "確定" : "推計"}）`}</dd></div>
        </dl>
      </section>

      <section>
        <p className="eyebrow mb-2">Sources</p>
        <ol className="space-y-2.5">
          {bundle.sources.map((s, n) => (
            <li key={s.id} className="flex gap-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center border border-navy-3/40 font-num text-[10px] font-semibold text-navy-3">{n + 1}</span>
              <div className="min-w-0">
                <p className="line-clamp-2 text-xs leading-snug text-ink">{s.title}</p>
                <p className="truncate text-2xs text-slate">{s.publisher} · {fmtDate(s.published_at, { year: false })}</p>
                <div className="mt-0.5 flex gap-1">
                  {s.relation === "update" && <Pill tone="warn">続報</Pill>}
                  {s.injection_flags.length > 0 && <Pill tone="danger">命令文検出</Pill>}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <Link href={`/app/articles/${bundle.article.id}/evidence`} className="mt-3 inline-block text-xs text-navy hover:underline">Evidence Traceで照合 →</Link>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-4 border-b border-line">
          {(["versions", "flow"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 pb-1.5 text-xs", tab === t ? "border-gold text-ink" : "border-transparent text-slate")}>
              {t === "versions" ? "変更履歴" : "ワークフロー履歴"}
            </button>
          ))}
        </div>
        {tab === "versions" ? (
          <ol className="space-y-2" data-testid="version-list">
            {bundle.versions.map((v) => {
              const isPublished = bundle.page && v.id === bundle.article.published_version_id;
              return (
                <li key={v.id} className="group flex items-start gap-2 text-xs">
                  <History className="mt-0.5 size-3.5 shrink-0 text-slate" />
                  <div className="min-w-0 flex-1">
                    <p className="text-ink"><span className="font-num font-semibold">v{v.version_no}</span> {VERSION_KIND[v.kind] ?? v.kind}{isPublished && <Pill tone="gold" className="ml-1">公開版</Pill>}</p>
                    <p className="truncate text-2xs text-slate">{v.author ?? "システム"} · {fmtDate(v.created_at, { time: true, year: false })}</p>
                    {v.note && <p className="truncate text-2xs text-ink-3">{v.note}</p>}
                    <div className="mt-0.5 flex gap-3">
                      <Link className="text-2xs text-navy hover:underline" href={`/app/articles/${bundle.article.id}/diff?from=${v.id}`}>現在と比較</Link>
                      {editable && <button className="inline-flex items-center gap-0.5 text-2xs text-navy hover:underline" onClick={() => restore(v.id, v.version_no)}><RotateCcw className="size-2.5" />復元</button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <ol className="space-y-2">
            {bundle.transitions.map((t) => (
              <li key={t.id} className="text-xs">
                <p className="text-ink">{ACTION[t.action] ?? t.action} <span className="text-slate">→ {STATUS_LABEL[t.to_status as ArticleStatus]?.ja}</span></p>
                <p className="text-2xs text-slate">{t.actor ?? "システム"} · {fmtDate(t.created_at, { time: true, year: false })}</p>
                {t.comment && <p className="text-2xs text-ink-3">{t.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
