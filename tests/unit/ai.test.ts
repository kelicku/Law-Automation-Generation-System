import { describe, expect, it } from "vitest";
import { articleFromWire, ClassifyStrict, validateArticle } from "@/lib/ai/schemas";
import { diffArticles, detectMaterialChanges } from "@/lib/domain/diff";
import type { ArticleContent } from "@/lib/domain/article";

const SRC = "11111111-1111-4111-8111-111111111111";
const good = {
  title: "見出し", summary: "概要", links: [{ label: "出典", url: "https://example.com/a" }],
  seo: { title: "t", description: "d", keywords: [] }, sns: { x: "x", facebook: "f" },
  blocks: [{ id: "p1", type: "paragraph", text: null, sentences: [{ id: "s1", text: "事実。", kind: "fact", refs: [{ sourceId: SRC, quote: "事実の原文です。" }] }] }],
};

describe("AI output validation", () => {
  it("accepts well-formed output", () => {
    expect(validateArticle(articleFromWire(good as never), new Set([SRC])).blocks).toHaveLength(1);
  });
  it("rejects missing fields", () => {
    const rest: Record<string, unknown> = { ...good };
    delete rest.title;
    expect(() => validateArticle(articleFromWire(rest as never), new Set([SRC]))).toThrow();
  });
  it("rejects references to sources that were not provided", () => {
    expect(() => validateArticle(articleFromWire(good as never), new Set(["22222222-2222-4222-8222-222222222222"]))).toThrow(/unknown sourceId/);
  });
  it("rejects javascript: links", () => {
    const bad = { ...good, links: [{ label: "x", url: "javascript:alert(1)" }] };
    expect(() => validateArticle(articleFromWire(bad as never), new Set([SRC]))).toThrow();
  });
  it("validates classification ranges", () => {
    expect(ClassifyStrict.safeParse({ is_incident: true, organization: "A", incident_title: "タイトル例", category: "other", confidence: 2, rationale: "", affected_count: null, affected_count_status: "unknown", occurred_on: null, disclosed_on: null }).success).toBe(false);
  });
});

describe("smart diff", () => {
  const mk = (sentences: string[]): ArticleContent => ({
    title: "T", summary: "S", links: [], seo: { title: "", description: "d", keywords: [] }, sns: { x: "", facebook: "" },
    blocks: [{ id: "p", type: "paragraph", sentences: sentences.map((t, i) => ({ id: `s${i}`, text: t, kind: "fact", refs: [] })) }],
  });
  it("distinguishes added, removed and modified sentences", () => {
    const rows = diffArticles(mk(["同じ文。", "影響人数は現在調査中であるとのことです。", "削除される文。"]), mk(["同じ文。", "影響人数は12,400名であることが確定したとのことです。", "新しい文が追加された。"]));
    const types = rows.map((r) => r.type);
    expect(types).toContain("modified");
    expect(types.filter((t) => t === "equal").length).toBeGreaterThan(0);
  });
  it("detects material changes in the affected count", () => {
    const ch = detectMaterialChanges({ affected_count: null, affected_count_status: "unknown", category: "a", severity: "high" }, { affected_count: 12400, affected_count_status: "confirmed", category: "a", severity: "high" });
    expect(ch[0].field).toBe("affected_count");
    expect(ch[0].after).toContain("12,400");
  });
});
