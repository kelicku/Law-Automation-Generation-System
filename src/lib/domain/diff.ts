import { diffArrays, diffChars } from "diff";
import type { ArticleContent } from "./article";

/**
 * Smart Diff — sentence-aligned comparison between two article versions.
 * Sentences are aligned with an LCS diff; adjacent removed/added runs that are
 * similar enough are paired as "modified" and get a character-level diff.
 */
export interface Segment {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export type DiffRow =
  | { type: "equal"; section: string; text: string }
  | { type: "added"; section: string; text: string }
  | { type: "removed"; section: string; text: string }
  | { type: "modified"; section: string; before: string; after: string; segments: Segment[] };

interface Unit {
  section: string;
  text: string;
}

function flatten(c: ArticleContent): Unit[] {
  const units: Unit[] = [
    { section: "タイトル", text: c.title },
    { section: "概要", text: c.summary },
  ];
  let section = "本文";
  for (const b of c.blocks) {
    if (b.type === "heading") {
      section = b.text;
      units.push({ section: "見出し", text: b.text });
    } else for (const s of b.sentences) units.push({ section, text: s.text });
  }
  units.push({ section: "メタディスクリプション", text: c.seo.description });
  return units;
}

export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const parts = diffChars(a, b);
  const same = parts.filter((p) => !p.added && !p.removed).reduce((n, p) => n + p.value.length, 0);
  return (2 * same) / (a.length + b.length);
}

export function diffArticles(before: ArticleContent, after: ArticleContent): DiffRow[] {
  const a = flatten(before);
  const b = flatten(after);
  const changes = diffArrays(a, b, { comparator: (x: Unit, y: Unit) => x.text === y.text });
  const rows: DiffRow[] = [];
  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];
    if (!ch.added && !ch.removed) {
      for (const u of ch.value) rows.push({ type: "equal", section: u.section, text: u.text });
      continue;
    }
    const next = changes[i + 1];
    if (ch.removed && next?.added) {
      const removed = [...ch.value];
      const added = [...next.value];
      while (removed.length || added.length) {
        const r = removed[0];
        const ad = added[0];
        if (r && ad && similarity(r.text, ad.text) >= 0.35) {
          rows.push({
            type: "modified",
            section: ad.section,
            before: r.text,
            after: ad.text,
            segments: diffChars(r.text, ad.text).map((p) => ({ value: p.value, added: p.added, removed: p.removed })),
          });
          removed.shift();
          added.shift();
        } else if (r && (!ad || removed.length >= added.length)) {
          rows.push({ type: "removed", section: r.section, text: r.text });
          removed.shift();
        } else if (ad) {
          rows.push({ type: "added", section: ad.section, text: ad.text });
          added.shift();
        }
      }
      i++;
      continue;
    }
    for (const u of ch.value) rows.push({ type: ch.added ? "added" : "removed", section: u.section, text: u.text });
  }
  return rows;
}

export function diffStats(rows: DiffRow[]) {
  return {
    added: rows.filter((r) => r.type === "added").length,
    removed: rows.filter((r) => r.type === "removed").length,
    modified: rows.filter((r) => r.type === "modified").length,
    unchanged: rows.filter((r) => r.type === "equal").length,
  };
}

/** Material change detection between two incident snapshots (used by the collector). */
export interface IncidentSnapshot {
  affected_count: number | null;
  affected_count_status: string;
  category: string;
  severity: string;
}

export interface MaterialChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export function detectMaterialChanges(before: IncidentSnapshot, after: IncidentSnapshot): MaterialChange[] {
  const out: MaterialChange[] = [];
  const fmt = (n: number | null, st: string) => (n === null ? "未確定" : `${n.toLocaleString("ja-JP")}名（${st === "confirmed" ? "確定" : "推計"}）`);
  if (before.affected_count !== after.affected_count || before.affected_count_status !== after.affected_count_status) {
    out.push({
      field: "affected_count",
      label: "影響人数",
      before: fmt(before.affected_count, before.affected_count_status),
      after: fmt(after.affected_count, after.affected_count_status),
    });
  }
  if (before.category !== after.category) out.push({ field: "category", label: "事件カテゴリ", before: before.category, after: after.category });
  if (before.severity !== after.severity) out.push({ field: "severity", label: "重要度", before: before.severity, after: after.severity });
  return out;
}
