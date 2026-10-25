"use client";
import { ChevronDown, ExternalLink, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Pill } from "@/components/ui/badges";
import { journey } from "@/lib/client/api";
import { cn, fmtDate } from "@/lib/utils";

export interface SourceView {
  id: string;
  url: string;
  publisher: string;
  title: string;
  source_type: string;
  published_at: string | null;
  fetched_at: string;
  relation: string;
  content_text: string;
  injection_flags: { pattern: string; excerpt: string }[];
  is_fictional: boolean;
}

const TYPE: Record<string, string> = { official: "公式発表", press_release: "プレスリリース", news: "報道", regulator: "行政機関" };
const REL: Record<string, string> = { initial: "初報", update: "続報", related: "関連" };

export function SourceList({ sources }: { sources: SourceView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="divide-y divide-line border-y border-line bg-white" data-testid="source-list">
      {sources.map((s) => (
        <li key={s.id}>
          <button
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-ivory/50"
            aria-expanded={open === s.id}
            onClick={() => {
              setOpen(open === s.id ? null : s.id);
              journey("sources_viewed");
            }}
            data-testid="source-toggle"
          >
            <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-slate transition-transform", open === s.id && "rotate-180")} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <Pill tone={s.relation === "update" ? "warn" : "neutral"}>{REL[s.relation] ?? s.relation}</Pill>
                <Pill>{TYPE[s.source_type] ?? s.source_type}</Pill>
                {s.injection_flags.length > 0 && <Pill tone="danger"><ShieldAlert className="size-3" />不審な命令文</Pill>}
              </span>
              <span className="mt-1 block text-[13px] font-medium text-ink">{s.title}</span>
              <span className="mt-0.5 block text-xs text-ink-3">{s.publisher}</span>
            </span>
            <span className="hidden shrink-0 text-right font-num text-[11px] text-slate tnum sm:block">
              公表 {fmtDate(s.published_at, { time: true })}<br />取得 {fmtDate(s.fetched_at, { time: true })}
            </span>
          </button>
          {open === s.id && (
            <div className="border-t border-line bg-ivory/40 px-4 py-4 pl-11">
              {s.injection_flags.length > 0 && (
                <div className="mb-3 border-l-2 border-st-suspended bg-st-suspended/5 px-3 py-2 text-xs text-st-suspended">
                  この情報源には、AIへの命令と解釈されうる文章が含まれています。システムはこれをデータとしてのみ扱い、命令として実行しません。
                  <span className="mt-1 block font-mono text-[11px] text-ink-3">検出箇所: …{s.injection_flags[0].excerpt}…</span>
                </div>
              )}
              <p className="mb-2 text-2xs text-slate">取得・正規化後の本文（HTML除去済み・プレーンテキスト）</p>
              <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
                {s.content_text.split("\n").map((p, i) => <p key={i}>{p}</p>)}
              </div>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-navy hover:underline">
                {s.is_fictional ? "情報源ページを開く（架空のデモ情報源）" : "情報源ページを開く"} <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
