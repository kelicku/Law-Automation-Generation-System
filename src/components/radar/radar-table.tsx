"use client";
import { ArrowDown, ArrowUp, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CategoryTag, Pill, StatusBadge } from "@/components/ui/badges";
import { Input, NativeSelect } from "@/components/ui/field";
import { CATEGORY_LABEL, CATEGORIES, REVIEW_LABEL, type ArticleStatus, type Category, type ReviewStatus } from "@/lib/domain/types";
import { cn, fmtDate, fmtNum, fmtRelative } from "@/lib/utils";

export interface RadarRowView {
  id: string;
  title: string;
  organization_name: string;
  category: Category;
  occurred_on: string | null;
  disclosed_on: string | null;
  last_updated_at: string;
  created_at: string;
  source_count: number;
  publishers: string[];
  review_status: ReviewStatus;
  has_material_update: boolean;
  affected_count: number | null;
  affected_count_status: string;
  article_id: string | null;
  article_status: ArticleStatus | null;
}

const REVIEW_TONE: Record<ReviewStatus, "neutral" | "info" | "ok" | "dark"> = { unreviewed: "neutral", reviewing: "info", confirmed: "ok", dismissed: "neutral" };

export function RadarFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const [material, setMaterial] = useState(params.get("material") === "yes");
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set("q", q);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate" aria-hidden />
        <Input aria-label="事件名・企業名で検索" placeholder="事件名・企業名・概要で検索" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} data-testid="radar-search" />
      </div>
      <NativeSelect aria-label="カテゴリで絞り込み" value={params.get("category") ?? "all"} onChange={(e) => set("category", e.target.value)} data-testid="radar-category">
        <option value="all">すべてのカテゴリ</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="確認状態で絞り込み" value={params.get("review") ?? "all"} onChange={(e) => set("review", e.target.value)} data-testid="radar-review">
        <option value="all">すべての確認状態</option>
        {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((r) => <option key={r} value={r}>{REVIEW_LABEL[r]}</option>)}
      </NativeSelect>
      <label className="inline-flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" className="accent-[#101C30]" checked={material} onChange={(e) => { setMaterial(e.target.checked); set("material", e.target.checked ? "yes" : "all"); }} data-testid="radar-material" />
        重要な変更ありのみ
      </label>
    </div>
  );
}

function SortHeader({ col, label, className }: { col: string; label: string; className?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const sort = params.get("sort") ?? "last_updated_at";
  const dir = params.get("dir") ?? "desc";
  const active = sort === col;
  const next = new URLSearchParams(params.toString());
  next.set("sort", col);
  next.set("dir", active && dir === "desc" ? "asc" : "desc");
  return (
    <th scope="col" className={cn("whitespace-nowrap px-3 py-2.5 text-left text-2xs font-medium text-slate", className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={`${pathname}?${next.toString()}`} scroll={false} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")} data-testid={`sort-${col}`}>
        {label}
        {active && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    </th>
  );
}

export function RadarTable({ rows }: { rows: RadarRowView[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [rows]);
  return (
    <div className="scroll-x border-y border-line bg-white">
      <table className="w-full min-w-[1100px] border-collapse text-[13px]" data-testid="radar-table">
        <thead className="border-b border-line bg-ivory/60">
          <tr>
            <SortHeader col="title" label="事件名 / 企業・組織" className="pl-4" />
            <th scope="col" className="px-3 py-2.5 text-left text-2xs font-medium text-slate">カテゴリ</th>
            <SortHeader col="occurred_on" label="発生日" />
            <SortHeader col="disclosed_on" label="公表日" />
            <SortHeader col="last_updated_at" label="最終更新" />
            <th scope="col" className="px-3 py-2.5 text-left text-2xs font-medium text-slate">情報源</th>
            <SortHeader col="sources" label="関連記事数" />
            <th scope="col" className="px-3 py-2.5 text-left text-2xs font-medium text-slate">確認状態</th>
            <th scope="col" className="px-3 py-2.5 text-left text-2xs font-medium text-slate">重要な変更</th>
            <th scope="col" className="px-3 py-2.5 pr-4 text-left text-2xs font-medium text-slate">自所の記事</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-slate">条件に一致する事件はありません</td></tr>
          )}
          {rows.map((r) => {
            const fresh = now !== null && now - new Date(r.created_at).getTime() < 10 * 60_000;
            return (
              <tr key={r.id} className={cn("border-b border-line align-top transition-colors last:border-0 hover:bg-ivory/50", fresh && "animate-flash-gold")} data-testid="radar-row">
                <td className="max-w-[340px] px-3 py-3 pl-4">
                  <Link href={`/app/incidents/${r.id}`} className="font-medium text-ink hover:text-navy hover:underline">{r.title}</Link>
                  <p className="mt-0.5 text-xs text-ink-3">{r.organization_name}</p>
                  {r.affected_count !== null && (
                    <p className="mt-0.5 font-num text-[11px] text-slate tnum">影響 {fmtNum(r.affected_count)} {r.affected_count_status === "confirmed" ? "（確定）" : "（推計）"}</p>
                  )}
                  {fresh && <Pill tone="gold" className="mt-1">NEW</Pill>}
                </td>
                <td className="px-3 py-3"><CategoryTag category={r.category} /></td>
                <td className="whitespace-nowrap px-3 py-3 font-num text-xs text-ink-2 tnum">{fmtDate(r.occurred_on)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-num text-xs text-ink-2 tnum">{fmtDate(r.disclosed_on)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-2">{fmtRelative(r.last_updated_at)}</td>
                <td className="max-w-[200px] px-3 py-3 text-xs text-ink-3">
                  <span className="line-clamp-2">{(r.publishers ?? []).map((p) => p.replace(/ 公式サイト$/, "")).join("、")}</span>
                </td>
                <td className="px-3 py-3 font-num text-sm tnum">{r.source_count}</td>
                <td className="px-3 py-3"><Pill tone={REVIEW_TONE[r.review_status]}>{REVIEW_LABEL[r.review_status]}</Pill></td>
                <td className="px-3 py-3">
                  {r.has_material_update ? <span className="inline-flex items-center gap-1 text-xs font-medium text-st-revision"><TriangleAlert className="size-3.5" /> あり</span> : <span className="text-xs text-slate">—</span>}
                </td>
                <td className="px-3 py-3 pr-4">
                  {r.article_status && r.article_id ? <Link href={`/app/articles/${r.article_id}`}><StatusBadge status={r.article_status} showEn={false} /></Link> : <span className="text-xs text-slate">未作成</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
