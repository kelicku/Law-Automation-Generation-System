"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Link2, MousePointerClick, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { EditorBundle } from "@/components/editor/types";
import { StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { api, ClientApiError, journey } from "@/lib/client/api";
import { allSentences, splitSentences, type Sentence } from "@/lib/domain/article";
import { COVERAGE_METHOD, type EvidenceStatus } from "@/lib/domain/evidence";
import { cn, fmtDate } from "@/lib/utils";

const STATUS_META: Record<EvidenceStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  verified: { label: "出典と一致", cls: "text-st-approved", icon: CheckCircle2 },
  mismatch: { label: "出典不一致", cls: "text-st-suspended", icon: XCircle },
  unsourced: { label: "根拠未確認", cls: "text-st-revision", icon: AlertTriangle },
  not_applicable: { label: "解説・案内（照合対象外）", cls: "text-slate", icon: Info },
};

const TYPE: Record<string, string> = { official: "公式発表", press_release: "プレスリリース", news: "報道", regulator: "行政機関" };

export function EvidenceTrace({ bundle, editable }: { bundle: EditorBundle; editable: boolean }) {
  const router = useRouter();
  const a = bundle.article;
  const content = a.working;
  const ev = bundle.precheck.evidence;
  const sentences = useMemo(() => allSentences(content), [content]);
  const firstFact = sentences.find((s) => s.kind === "fact");
  const [selected, setSelected] = useState<string | null>(firstFact?.id ?? null);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const srcIndex = new Map(bundle.sources.map((s, i) => [s.id, i + 1]));
  const sel = sentences.find((s) => s.id === selected) ?? null;
  const selEv = sel ? ev.sentences[sel.id] : null;
  const activeSources = new Set(sel?.refs.map((r) => r.sourceId) ?? []);
  const issues = sentences.filter((s) => ["unsourced", "mismatch"].includes(ev.sentences[s.id]?.status));
  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    journey("sources_viewed");
  }, []);
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scroll only the sources pane, never the window
    const pane = paneRef.current;
    const mark = markRef.current;
    if (!pane || !mark || !pane.contains(mark)) return;
    const top = mark.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 80;
    pane.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [selected]);
  useEffect(() => setLinking(false), [selected]);

  const link = async (sourceId: string, quote: string) => {
    if (!sel) return;
    setBusy(true);
    try {
      await api(`/api/articles/${a.id}/evidence`, { body: { sentenceId: sel.id, sourceId, quote, baseHash: a.working_hash } });
      toast.success("出典を紐付け、本文と照合しました");
      setLinking(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "紐付けできませんでした");
    } finally {
      setBusy(false);
    }
  };

  const markAnalysis = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const next = { ...content, blocks: content.blocks.map((b) => (b.type === "paragraph" ? { ...b, sentences: b.sentences.map((s) => (s.id === sel.id ? { ...s, kind: "analysis" as const, refs: [] } : s)) } : b)) };
      await api(`/api/articles/${a.id}`, { method: "PATCH", body: { content: next, baseHash: a.working_hash } });
      toast.success("一般的な解説文として扱います（事件の事実としては表示しません）");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* summary ribbon */}
      <div className="mb-5 grid grid-cols-1 gap-px border-y border-line bg-line sm:grid-cols-4">
        {[
          ["根拠カバー率", `${ev.coverage}%`, "coverage"],
          ["出典と一致した事実文", `${ev.totals.verified} / ${ev.totals.facts}`, ""],
          ["根拠未確認・不一致", `${ev.totals.unsourced + ev.totals.mismatch}`, "issues"],
          ["解説・案内（対象外）", `${ev.totals.nonFact}`, ""],
        ].map(([k, v, id]) => (
          <div key={k} className="bg-[#FBFAF7] px-4 py-3">
            <p className="text-2xs text-slate">{k}</p>
            <p className={cn("mt-1 font-num text-xl font-semibold tnum", id === "issues" && v !== "0" && "text-st-revision")} data-testid={id ? `ev-${id}` : undefined}>{v}</p>
          </div>
        ))}
      </div>
      <p className="mb-5 flex gap-1.5 text-2xs leading-relaxed text-slate"><Info className="mt-0.5 size-3 shrink-0" />{COVERAGE_METHOD}</p>

      {issues.length > 0 && (
        <div className="mb-5 border-l-2 border-st-revision bg-st-revision/5 px-4 py-3 text-xs text-st-revision" role="alert" data-testid="evidence-warning">
          <p className="font-medium">根拠が確認できない文が {issues.length}件あります。公開前に出典を紐付けるか、記述を修正してください。</p>
          <ul className="mt-1.5 space-y-1">
            {issues.map((s) => (
              <li key={s.id}><button className="text-left underline-offset-2 hover:underline" onClick={() => setSelected(s.id)}>「{s.text.slice(0, 48)}{s.text.length > 48 ? "…" : ""}」</button></li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-0 border border-line bg-white lg:grid-cols-2">
        {/* left: article */}
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <p className="eyebrow">AI-generated article</p>
            <StatusBadge status={a.status} showEn={false} />
          </div>
          <article className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-5 lg:px-7" data-testid="evidence-article">
            <h2 className="h-serif text-xl font-semibold leading-snug">{content.title}</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{content.summary}</p>
            {content.blocks.map((b) =>
              b.type === "heading" ? (
                <h3 key={b.id} className="h-serif mt-6 text-[15px] font-semibold">{b.text}</h3>
              ) : (
                <p key={b.id} className="mt-2 text-[14px] leading-[2]">
                  {b.sentences.map((s) => (
                    <ClaimSpan key={s.id} s={s} status={ev.sentences[s.id]?.status ?? "not_applicable"} active={selected === s.id} onClick={() => setSelected(s.id)} srcIndex={srcIndex} />
                  ))}
                </p>
              ),
            )}
          </article>
        </div>

        {/* right: sources */}
        <div className="min-w-0">
          <div className="border-b border-line px-5 py-3">
            <p className="eyebrow">Evidence</p>
            <AnimatePresence mode="wait">
              {sel && selEv ? (
                <motion.div key={sel.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-2" data-testid="selected-claim">
                  <p className={cn("flex items-center gap-1.5 text-xs font-medium", STATUS_META[selEv.status].cls)} data-status={selEv.status}>
                    {(() => { const I = STATUS_META[selEv.status].icon; return <I className="size-3.5" />; })()}
                    {STATUS_META[selEv.status].label}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">「{sel.text}」</p>
                  {sel.kind === "fact" && editable && selEv.status !== "verified" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant={linking ? "primary" : "outline"} onClick={() => setLinking((v) => !v)} data-testid="start-linking"><Link2 />{linking ? "出典の文を選択してください" : "出典を紐付ける"}</Button>
                      <Button size="sm" variant="ghost" onClick={markAnalysis} loading={busy}>一般的な解説として扱う</Button>
                    </div>
                  )}
                  {selEv.status === "not_applicable" && <p className="mt-1 text-2xs text-slate">この文は事件の事実ではなく、一般的な解説または事務所の案内として扱われています。AIの推測と出典の事実は区別して表示されます。</p>}
                </motion.div>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate"><MousePointerClick className="size-3.5" />左の記事で文を選択すると、根拠となる出典箇所を表示します</p>
              )}
            </AnimatePresence>
          </div>
          <div ref={paneRef} className="max-h-[calc(100vh-300px)] space-y-px overflow-y-auto bg-line" data-testid="evidence-sources">
            {bundle.sources.map((s) => {
              const refs = sel?.refs.filter((r) => r.sourceId === s.id) ?? [];
              const active = activeSources.has(s.id);
              return (
                <section key={s.id} className={cn("bg-white px-5 py-4 transition-colors", active && "bg-gold-soft/25", sel && !active && !linking && "opacity-55")} data-active={active || undefined} data-testid="evidence-source">
                  <div className="flex items-start gap-3">
                    <span className={cn("flex size-6 shrink-0 items-center justify-center border font-num text-[11px] font-semibold", active ? "border-gold bg-gold text-navy" : "border-line-strong text-ink-3")}>{srcIndex.get(s.id)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug">{s.title}</p>
                      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-2xs text-ink-3">
                        <dt className="text-slate">情報源</dt><dd>{s.publisher}（{TYPE[s.source_type] ?? s.source_type}）</dd>
                        <dt className="text-slate">公表日</dt><dd className="font-num tnum">{fmtDate(s.published_at, { time: true })}</dd>
                        <dt className="text-slate">取得日時</dt><dd className="font-num tnum">{fmtDate(s.fetched_at, { time: true })}</dd>
                        <dt className="text-slate">URL</dt><dd className="truncate"><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-navy hover:underline">{s.url}<ExternalLink className="size-2.5" /></a></dd>
                        <dt className="text-slate">確認状態</dt>
                        <dd>{refs.length ? (refs.some((r) => selEv?.refs.find((x) => x.quote === r.quote)?.found) ? <span className="text-st-approved">引用が本文に実在（機械照合済）</span> : <span className="text-st-suspended">引用が本文に見つかりません</span>) : "—"}</dd>
                      </dl>
                      {s.injection_flags.length > 0 && <p className="mt-1.5 inline-flex items-center gap-1 text-2xs text-st-suspended"><ShieldAlert className="size-3" />AIへの命令文らしき記述を検出（データとして扱い、実行していません）</p>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 border-l border-line pl-3 text-[13px] leading-relaxed text-ink-3">
                    {s.content_text.split("\n").map((para, pi) => (
                      <p key={pi}>
                        {splitSentences(para).map((sent, si) => {
                          const hit = refs.some((r) => r.quote.trim() === sent.trim() || sent.includes(r.quote.trim()));
                          if (linking) {
                            return (
                              <button key={si} disabled={busy} onClick={() => link(s.id, sent)} className="rounded-sm text-left hover:bg-gold-soft/60 hover:text-ink" data-testid="link-candidate">{sent}</button>
                            );
                          }
                          return hit ? (
                            <mark key={si} ref={(el) => { if (el && activeSources.has(s.id)) markRef.current = el; }} className="bg-gold/30 px-0.5 text-ink" data-testid="evidence-highlight">{sent}</mark>
                          ) : <span key={si}>{sent}</span>;
                        })}
                      </p>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate">記事の修正は <Link className="text-navy underline" href={`/app/articles/${a.id}`}>エディタ</Link> で行えます。紐付けた引用は、出典本文に実在する場合のみ保存されます。</p>
    </div>
  );
}

function ClaimSpan({ s, status, active, onClick, srcIndex }: { s: Sentence; status: EvidenceStatus; active: boolean; onClick: () => void; srcIndex: Map<string, number> }) {
  const bad = status === "unsourced" || status === "mismatch";
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline rounded-[2px] text-left transition-colors",
        s.kind === "fact" ? "decoration-1 underline-offset-[5px] hover:bg-ivory-2" : "text-ink-3 hover:bg-ivory-2",
        s.kind === "fact" && !bad && "underline decoration-navy-3/30",
        bad && "bg-st-revision/10 underline decoration-st-revision decoration-wavy",
        active && "bg-gold/25 ring-1 ring-gold",
      )}
      aria-pressed={active}
      data-claim-status={status}
      data-testid="claim"
    >
      {s.text}
      {s.refs.map((r, i) => <sup key={i} className="ml-0.5 font-num text-[10px] font-semibold text-navy-3">[{srcIndex.get(r.sourceId) ?? "?"}]</sup>)}
      {bad && <sup className="ml-0.5 text-[10px] font-semibold text-st-revision">⚠</sup>}
      {s.kind !== "fact" && <sup className="ml-0.5 text-[9px] text-slate">{s.kind === "analysis" ? "解説" : "案内"}</sup>}
    </button>
  );
}
