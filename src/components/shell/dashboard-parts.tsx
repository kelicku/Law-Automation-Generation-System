"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { CAT_HEX, StatusBadge } from "@/components/ui/badges";
import { CATEGORY_LABEL, type ArticleStatus, type Category } from "@/lib/domain/types";
import { cn, fmtNum } from "@/lib/utils";

export interface Kpi {
  label: string;
  value: number;
  sub?: string;
  href?: string;
  tone?: "default" | "warn" | "gold";
  testId?: string;
}

/** A single ledger-like row of metrics separated by hairlines (not a grid of cards). */
export function KpiStrip({ items, dark, onItemClick }: { items: Kpi[]; dark?: boolean; onItemClick?: () => void }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px border-y sm:grid-cols-3 xl:grid-cols-6", dark ? "border-white/10 bg-white/10" : "border-line bg-line")}>
      {items.map((k, i) => {
        const inner = (
          <>
            <p className={cn("text-[11px] leading-snug", dark ? "text-white/55" : "text-ink-3")}>{k.label}</p>
            <p
              key={k.value}
              style={{ animationDelay: `${i * 40}ms` }}
              className={cn(
                "mt-1.5 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 font-num text-[28px] font-semibold leading-none tracking-tight tnum",
                dark ? "text-white" : k.tone === "warn" && k.value > 0 ? "text-st-revision" : "text-ink",
                k.tone === "gold" && (dark ? "text-gold" : "text-gold-deep"),
              )}
              data-testid={k.testId}
            >
              {fmtNum(k.value)}
            </p>
            {k.sub && <p className={cn("mt-1.5 text-2xs", dark ? "text-white/60" : "text-slate")}>{k.sub}</p>}
          </>
        );
        const cls = cn("block px-4 py-4 text-left transition-colors", dark ? "bg-navy hover:bg-navy-2" : "bg-[#FBFAF7] hover:bg-white");
        if (onItemClick) return <button key={k.label} className={cls} onClick={onItemClick}>{inner}</button>;
        return k.href ? <Link key={k.label} href={k.href} className={cls}>{inner}</Link> : <div key={k.label} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

export interface TimelineItem {
  id: string;
  title: string;
  organization_name: string;
  category: Category;
  disclosed_on: string;
  has_material_update: boolean;
  article_status?: ArticleStatus | null;
  article_id?: string | null;
}

const COL = 30;
const CARD_W = 168;
const LANE_H = 70;

/** Horizontally scrolling date axis; incidents are placed in lanes so cards never overlap. */
export function IncidentTimeline({ items, dark, links, onItemClick, days = 40 }: { items: TimelineItem[]; dark?: boolean; links?: boolean; onItemClick?: () => void; days?: number }) {
  const hrefFor = links ? (i: TimelineItem) => (i.article_id ? `/app/articles/${i.article_id}` : `/app/incidents/${i.id}`) : null;
  const scroller = useRef<HTMLDivElement>(null);
  const { cols, placed, lanes } = useMemo(() => {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const latest = items.reduce((m, i) => (i.disclosed_on > m ? i.disclosed_on : m), "");
    const end = latest && new Date(`${latest}T00:00:00`) > today ? new Date(`${latest}T00:00:00`) : today;
    const cols: string[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const x = new Date(end);
      x.setDate(x.getDate() - d);
      cols.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
    }
    const index = new Map(cols.map((c, i) => [c, i]));
    const laneEnds: number[] = [];
    const placed = [...items]
      .filter((i) => index.has(i.disclosed_on))
      .sort((a, b) => a.disclosed_on.localeCompare(b.disclosed_on))
      .map((it) => {
        const x = index.get(it.disclosed_on)! * COL;
        let lane = laneEnds.findIndex((e) => e + 6 <= x);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = x + CARD_W;
        return { it, x, lane };
      });
    return { cols, placed, lanes: Math.max(1, laneEnds.length) };
  }, [items, days]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [placed.length]);

  const height = lanes * LANE_H + 12;
  return (
    <div ref={scroller} className="scroll-x -mx-1 pb-2" role="region" aria-label="事件タイムライン（横スクロール）" tabIndex={0}>
      <div className="relative px-1" style={{ width: cols.length * COL + CARD_W }}>
        <div className="relative" style={{ height }}>
          {placed.map(({ it, x, lane }, idx) => {
            const body = (
              <div
                className={cn(
                  "absolute animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 border-l-2 px-2.5 py-1.5 text-left shadow-hair transition-shadow hover:shadow-lift",
                  dark ? "bg-navy-2 text-white" : "bg-white text-ink",
                )}
                style={{ borderLeftColor: CAT_HEX[it.category], left: x + 4, bottom: 8 + lane * LANE_H, width: CARD_W - 8, animationDelay: `${idx * 40}ms` }}
              >
                <p className={cn("truncate text-[11px]", dark ? "text-white/50" : "text-slate")}>{CATEGORY_LABEL[it.category]}{it.has_material_update && " · 続報"}</p>
                <p className="truncate text-xs font-medium">{it.organization_name.replace(/（架空）/, "")}</p>
                {it.article_status ? <StatusBadge status={it.article_status} showEn={false} className="mt-1" /> : <p className={cn("mt-1 text-2xs", dark ? "text-white/60" : "text-slate")}>{hrefFor ? "記事なし" : it.disclosed_on.slice(5).replace("-", "/") + " 公表"}</p>}
              </div>
            );
            if (onItemClick) return <button key={it.id} onClick={onItemClick} className="contents" aria-label={it.title}>{body}</button>;
            return hrefFor ? <Link key={it.id} href={hrefFor(it)} aria-label={it.title}>{body}</Link> : <div key={it.id}>{body}</div>;
          })}
        </div>
        <div className={cn("flex border-t", dark ? "border-white/15" : "border-line-strong")}>
          {cols.map((day) => {
            const d = new Date(`${day}T00:00:00`);
            const has = placed.some((p) => p.it.disclosed_on === day);
            return (
              <div key={day} className="relative shrink-0 pt-1.5 text-center" style={{ width: COL }}>
                <span className={cn("absolute -top-[3px] left-[5px] size-[5px] rounded-full", has ? "bg-gold" : dark ? "bg-white/15" : "bg-line-strong")} aria-hidden />
                {(d.getDate() === 1 || d.getDate() % 5 === 0) && (
                  <span className={cn("block font-num text-[10px] tnum", dark ? "text-white/60" : "text-slate")}>{d.getMonth() + 1}/{d.getDate()}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 14-day detection bars, drawn on first render. */
export function DetectionChart({ data, dark }: { data: { day: string; count: number }[]; dark?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <figure>
      <div className="flex h-24 items-end gap-1" role="img" aria-label={`過去14日間の検出件数 合計${total}件`}>
        {data.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              style={{ height: `${(d.count / max) * 100}%`, animationDelay: `${i * 25}ms` }}
              className={cn("min-h-[2px] w-full origin-bottom animate-grow fill-mode-both", d.count ? (i === data.length - 1 ? "bg-gold" : dark ? "bg-white/40" : "bg-navy-3") : dark ? "bg-white/10" : "bg-line")}
            />
            <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-sm bg-navy px-1 font-num text-[10px] text-white group-hover:block">{d.count}</span>
          </div>
        ))}
      </div>
      <figcaption className={cn("mt-1.5 flex justify-between font-num text-[10px] tnum", dark ? "text-white/60" : "text-slate")}>
        <span>{data[0]?.day.slice(5).replace("-", "/")}</span>
        <span>今日</span>
      </figcaption>
    </figure>
  );
}
