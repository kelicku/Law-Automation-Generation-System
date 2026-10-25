"use client";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { DiffRow } from "@/lib/domain/diff";
import { cn } from "@/lib/utils";

type Group = { kind: "equal"; rows: Extract<DiffRow, { type: "equal" }>[] } | { kind: "change"; row: Exclude<DiffRow, { type: "equal" }> };

function group(rows: DiffRow[]): Group[] {
  const out: Group[] = [];
  for (const r of rows) {
    if (r.type === "equal") {
      const last = out[out.length - 1];
      if (last?.kind === "equal") last.rows.push(r);
      else out.push({ kind: "equal", rows: [r] });
    } else out.push({ kind: "change", row: r });
  }
  return out;
}

const TAG = {
  added: { label: "追加", cls: "bg-st-approved/10 text-st-approved border-st-approved/30" },
  removed: { label: "削除", cls: "bg-st-suspended/10 text-st-suspended border-st-suspended/30" },
  modified: { label: "修正", cls: "bg-st-revision/10 text-st-revision border-st-revision/30" },
};

export function SmartDiffView({ rows, beforeLabel, afterLabel }: { rows: DiffRow[]; beforeLabel: string; afterLabel: string }) {
  const groups = group(rows);
  return (
    <div className="border border-line bg-white" data-testid="smart-diff">
      <div className="grid grid-cols-2 border-b border-line bg-ivory/60 text-xs font-medium">
        <div className="border-r border-line px-4 py-2.5 text-ink-2">{beforeLabel}</div>
        <div className="px-4 py-2.5 text-ink">{afterLabel}</div>
      </div>
      {groups.map((g, i) => (g.kind === "equal" ? <EqualGroup key={i} rows={g.rows} /> : <ChangeRow key={i} row={g.row} i={i} />))}
    </div>
  );
}

function EqualGroup({ rows }: { rows: Extract<DiffRow, { type: "equal" }>[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-1.5 py-1.5 text-2xs text-slate hover:bg-ivory/50" aria-expanded={open}>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} /> 変更なし {rows.length}件{open ? "を閉じる" : "を表示"}
      </button>
      {open && rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 border-t border-line/60 text-[13px] leading-relaxed text-ink-3">
          <p className="border-r border-line px-4 py-2">{r.text}</p>
          <p className="px-4 py-2">{r.text}</p>
        </div>
      ))}
    </div>
  );
}

function ChangeRow({ row, i }: { row: Exclude<DiffRow, { type: "equal" }>; i: number }) {
  const tag = TAG[row.type];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.6) }} className="border-b border-line last:border-0" data-diff={row.type}>
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <span className={cn("rounded-[2px] border px-1.5 py-px text-[10px] font-semibold", tag.cls)}>{tag.label}</span>
        <span className="text-2xs text-slate">{row.section}</span>
      </div>
      <div className="grid grid-cols-2 text-[13px] leading-[1.9]">
        <div className="border-r border-line px-4 py-2">
          {row.type === "added" && <span className="text-2xs text-slate">（該当なし）</span>}
          {row.type === "removed" && <del className="bg-st-suspended/10 text-st-suspended decoration-st-suspended/50">{row.text}</del>}
          {row.type === "modified" && row.segments.filter((s) => !s.added).map((s, k) => (s.removed ? <del key={k} className="bg-st-suspended/15 text-st-suspended decoration-st-suspended/50">{s.value}</del> : <span key={k} className="text-ink-2">{s.value}</span>))}
        </div>
        <div className="px-4 py-2">
          {row.type === "removed" && <span className="text-2xs text-slate">（削除）</span>}
          {row.type === "added" && <ins className="bg-st-approved/10 text-st-approved no-underline">{row.text}</ins>}
          {row.type === "modified" && row.segments.filter((s) => !s.removed).map((s, k) => (s.added ? <ins key={k} className="bg-st-approved/15 font-medium text-st-approved no-underline">{s.value}</ins> : <span key={k} className="text-ink">{s.value}</span>))}
        </div>
      </div>
    </motion.div>
  );
}
