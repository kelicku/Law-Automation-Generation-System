"use client";
import * as Pop from "@radix-ui/react-popover";
import { ArrowDown, ArrowUp, Heading2, Link2, Pilcrow, Plus, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Tip } from "@/components/ui/misc";
import { api, ClientApiError } from "@/lib/client/api";
import { reconcileParagraph, type ArticleContent, type Block, type Sentence } from "@/lib/domain/article";
import type { PrecheckResult } from "@/lib/domain/precheck";
import type { ArticleStatus, MemberRole } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import type { EditorSource } from "./types";
import { WorkflowNotice } from "./workflow";

let seq = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function CenterPane({
  content, onChange, onUndo, canUndo, editable, precheck, flash, sources, articleId, status, role, beforeAction,
}: {
  content: ArticleContent;
  onChange: (c: ArticleContent, o?: { flashIds?: string[] }) => void;
  onUndo: () => void;
  canUndo: boolean;
  editable: boolean;
  precheck: PrecheckResult;
  flash: Set<string>;
  sources: EditorSource[];
  articleId: string;
  status: ArticleStatus;
  role: MemberRole;
  beforeAction: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [markers, setMarkers] = useState(true);
  const srcIndex = new Map(sources.map((s, i) => [s.id, i + 1]));

  const setBlocks = (blocks: Block[], flashIds?: string[]) => onChange({ ...content, blocks }, { flashIds });
  const idx = content.blocks.findIndex((b) => b.id === selected);

  const insert = (type: "heading" | "paragraph") => {
    const block: Block = type === "heading"
      ? { id: nid("h"), type: "heading", text: "新しい見出し" }
      : { id: nid("p"), type: "paragraph", sentences: [{ id: nid("s"), text: "ここに本文を入力します。", kind: "analysis", refs: [] }] };
    const at = idx >= 0 ? idx + 1 : content.blocks.length;
    const blocks = [...content.blocks.slice(0, at), block, ...content.blocks.slice(at)];
    setBlocks(blocks, [block.id]);
    setSelected(block.id);
  };
  const move = (dir: -1 | 1) => {
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= content.blocks.length) return;
    const blocks = [...content.blocks];
    [blocks[idx], blocks[j]] = [blocks[j], blocks[idx]];
    setBlocks(blocks, [blocks[j].id]);
  };
  const remove = () => {
    if (idx < 0 || content.blocks.length <= 1) return;
    setBlocks(content.blocks.filter((_, i) => i !== idx));
    setSelected(null);
  };

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-8">
      <WorkflowNotice articleId={articleId} status={status} role={role} editable={editable} beforeAction={beforeAction} />

      {editable && (
        <div className="sticky top-[84px] z-[5] mb-6 flex flex-wrap items-center gap-1 border border-line bg-white/95 px-2 py-1.5 shadow-hair backdrop-blur" role="toolbar" aria-label="編集ツールバー">
          <ToolBtn label="見出しを追加" onClick={() => insert("heading")}><Heading2 /></ToolBtn>
          <ToolBtn label="段落を追加" onClick={() => insert("paragraph")}><Pilcrow /></ToolBtn>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <ToolBtn label="選択したブロックを上へ" onClick={() => move(-1)} disabled={idx <= 0}><ArrowUp /></ToolBtn>
          <ToolBtn label="選択したブロックを下へ" onClick={() => move(1)} disabled={idx < 0 || idx >= content.blocks.length - 1}><ArrowDown /></ToolBtn>
          <ToolBtn label="選択したブロックを削除" onClick={remove} disabled={idx < 0}><Trash2 /></ToolBtn>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <ToolBtn label="元に戻す" onClick={onUndo} disabled={!canUndo}><Undo2 /></ToolBtn>
          <label className="ml-auto inline-flex items-center gap-1.5 px-2 text-2xs text-slate">
            <input type="checkbox" className="accent-[#101C30]" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
            出典マーカー
          </label>
        </div>
      )}

      <label className="sr-only" htmlFor="article-title">記事タイトル</label>
      <textarea
        id="article-title"
        rows={2}
        className="h-serif w-full resize-none border-0 bg-transparent text-[26px] font-semibold leading-snug text-ink placeholder:text-slate/50 focus:outline-none focus:ring-0 disabled:text-ink"
        value={content.title}
        disabled={!editable}
        maxLength={120}
        onChange={(e) => onChange({ ...content, title: e.target.value.replace(/\n/g, "") })}
        data-testid="article-title"
      />
      <label className="mb-1 mt-3 block text-2xs font-medium uppercase tracking-widest text-slate" htmlFor="article-summary">概要</label>
      <Textarea
        id="article-summary"
        rows={3}
        className="border-line bg-ivory/40 text-[14px]"
        value={content.summary}
        disabled={!editable}
        maxLength={400}
        onChange={(e) => onChange({ ...content, summary: e.target.value })}
        data-testid="article-summary"
      />

      <div className="mt-8 space-y-1" data-testid="article-body">
        {content.blocks.map((b) => (
          <BlockView
            key={b.id}
            block={b}
            editable={editable}
            selected={selected === b.id}
            onSelect={() => setSelected(b.id)}
            flash={flash.has(b.id) || (b.type === "paragraph" && b.sentences.some((s) => flash.has(s.id)))}
            markers={markers}
            evidence={precheck.evidence.sentences}
            srcIndex={srcIndex}
            onChange={(nb, flashIds) => setBlocks(content.blocks.map((x) => (x.id === b.id ? nb : x)), flashIds)}
            articleId={articleId}
          />
        ))}
      </div>

      <section className="mt-10 border-t border-line pt-5">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-medium text-ink-2"><Link2 className="size-3.5" /> 関連リンク</h3>
        <ul className="space-y-2">
          {content.links.map((l, i) => (
            <li key={i} className="flex flex-col gap-1.5 sm:flex-row">
              <Input aria-label="リンク名" value={l.label} disabled={!editable} onChange={(e) => onChange({ ...content, links: content.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="sm:flex-[3]" />
              <Input aria-label="URL" value={l.url} disabled={!editable} onChange={(e) => onChange({ ...content, links: content.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className="font-mono text-xs sm:flex-[2]" />
              {editable && <Button variant="ghost" size="icon" aria-label="リンクを削除" onClick={() => onChange({ ...content, links: content.links.filter((_, j) => j !== i) })}><X /></Button>}
            </li>
          ))}
        </ul>
        {editable && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange({ ...content, links: [...content.links, { label: "参考リンク", url: "https://" }] })}><Plus /> リンクを追加</Button>
        )}
      </section>
    </div>
  );
}

function ToolBtn({ label, children, ...p }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tip content={label}>
      <button type="button" aria-label={label} className="rounded-[3px] p-1.5 text-ink-2 hover:bg-ivory-2 disabled:opacity-30 [&_svg]:size-4" {...p}>{children}</button>
    </Tip>
  );
}

function BlockView({
  block, editable, selected, onSelect, flash, markers, evidence, srcIndex, onChange, articleId,
}: {
  block: Block;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  flash: boolean;
  markers: boolean;
  evidence: PrecheckResult["evidence"]["sentences"];
  srcIndex: Map<string, number>;
  onChange: (b: Block, flashIds?: string[]) => void;
  articleId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const wrap = cn("group relative -mx-3 rounded-[3px] px-3 py-1 transition-colors", selected && editable && "bg-ivory-2/60 ring-1 ring-line", flash && "animate-flash-gold");

  if (block.type === "heading") {
    return (
      <div className={wrap} onClick={onSelect}>
        {editable ? (
          <input
            aria-label="見出し"
            className="h-serif mt-6 w-full border-0 bg-transparent text-lg font-semibold text-ink focus:outline-none"
            value={block.text}
            onFocus={onSelect}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        ) : (
          <h2 className="h-serif mt-6 text-lg font-semibold text-ink">{block.text}</h2>
        )}
      </div>
    );
  }

  const text = block.sentences.map((s) => s.text).join("");
  const commit = () => {
    setEditing(false);
    if (draft === text) return;
    const next = reconcileParagraph(block.sentences, draft, () => nid("s"));
    const changed = next.filter((s) => !block.sentences.some((o) => o.id === s.id)).map((s) => s.id);
    onChange({ ...block, sentences: next }, changed);
  };

  return (
    <div className={wrap} onClick={onSelect} data-testid="paragraph">
      {editing ? (
        <Textarea
          autoFocus
          aria-label="段落を編集"
          rows={Math.max(3, Math.ceil(draft.length / 42))}
          className="my-1 text-[15px] leading-[1.95]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(text);
              setEditing(false);
            }
          }}
          data-testid="paragraph-editor"
        />
      ) : (
        <p
          className={cn("text-[15px] leading-[1.95] text-ink-2", editable && "cursor-text")}
          onDoubleClick={() => {
            if (!editable) return;
            setDraft(text);
            setEditing(true);
          }}
          onKeyDown={(e) => {
            if (editable && e.key === "Enter") {
              setDraft(text);
              setEditing(true);
            }
          }}
          tabIndex={editable ? 0 : -1}
          aria-label={editable ? "段落（Enterまたはダブルクリックで編集）" : undefined}
        >
          {block.sentences.map((s) => (
            <SentenceView key={s.id} s={s} markers={markers} ev={evidence[s.id]} srcIndex={srcIndex} />
          ))}
        </p>
      )}
      {editable && !editing && (
        <div className="absolute -right-2 top-1 hidden gap-1 group-hover:flex group-focus-within:flex">
          <button className="rounded-[3px] border border-line bg-white px-1.5 py-0.5 text-2xs text-ink-2 shadow-hair hover:bg-ivory-2" onClick={() => { setDraft(text); setEditing(true); }} data-testid="edit-paragraph">編集</button>
          <RegeneratePopover block={block} articleId={articleId} onApply={(sentences) => onChange({ ...block, sentences }, sentences.map((s) => s.id))} />
        </div>
      )}
    </div>
  );
}

function SentenceView({ s, markers, ev, srcIndex }: { s: Sentence; markers: boolean; ev?: PrecheckResult["evidence"]["sentences"][string]; srcIndex: Map<string, number> }) {
  if (!markers) return <span>{s.text}</span>;
  if (s.kind === "analysis" || s.kind === "notice") {
    return <span className="text-ink-2">{s.text}<sup className="ml-0.5 select-none font-num text-[9px] text-slate">{s.kind === "analysis" ? "解説" : "案内"}</sup></span>;
  }
  const status = ev?.status ?? (s.refs.length ? "verified" : "unsourced");
  const bad = status === "unsourced" || status === "mismatch";
  return (
    <span className={cn(bad && "bg-st-revision/10 underline decoration-st-revision/60 decoration-wavy underline-offset-4")} data-evidence={status}>
      {s.text}
      {s.refs.map((r, i) => (
        <sup key={i} className={cn("ml-0.5 select-none font-num text-[10px] font-semibold", ev?.refs[i]?.found === false ? "text-st-revision" : "text-navy-3")}>[{srcIndex.get(r.sourceId) ?? "?"}]</sup>
      ))}
      {bad && <sup className="ml-0.5 select-none text-[10px] font-semibold text-st-revision">{status === "mismatch" ? "出典不一致" : "根拠未確認"}</sup>}
    </span>
  );
}

function RegeneratePopover({ block, articleId, onApply }: { block: Extract<Block, { type: "paragraph" }>; articleId: string; onApply: (s: Sentence[]) => void }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ output: { sentences: Sentence[] }; provider: string }>(`/api/articles/${articleId}/assist`, {
        body: { task: "paragraph_regenerate", blockId: block.id, instruction },
        idempotent: true,
      });
      onApply(r.output.sentences);
      toast.success(`段落を再生成しました${r.provider === "simulation" ? "（AIシミュレーション）" : ""}。変更箇所をハイライトしています`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "再生成に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pop.Root open={open} onOpenChange={setOpen}>
      <Pop.Trigger className="inline-flex items-center gap-1 rounded-[3px] border border-gold/40 bg-white px-1.5 py-0.5 text-2xs text-gold-deep shadow-hair hover:bg-gold-soft/40"><Sparkles className="size-3" />再生成</Pop.Trigger>
      <Pop.Portal>
        <Pop.Content sideOffset={6} align="end" className="z-50 w-72 border border-line bg-white p-3 shadow-lift">
          <p className="text-xs font-medium">この段落をAIで書き直す</p>
          <p className="mt-1 text-2xs text-slate">事実文は出典の逐語引用を保ったまま書き直します。</p>
          <Input className="mt-2" placeholder="指示（例：簡潔に、やさしい表現で）" value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={200} />
          <Button size="sm" className="mt-2 w-full" onClick={run} loading={busy}>再生成する</Button>
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}
