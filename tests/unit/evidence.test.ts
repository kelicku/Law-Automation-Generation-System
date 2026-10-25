import { describe, expect, it } from "vitest";
import { buildSimulatedArticle } from "@/lib/ai/simulation";
import { reconcileParagraph, splitSentences, type ArticleContent } from "@/lib/domain/article";
import { buildEvidenceReport } from "@/lib/domain/evidence";
import { sanitizeSourceText } from "@/lib/domain/sanitize";
import { DEMO_SOURCES } from "@/lib/demo/sources";

const SRC = "11111111-1111-4111-8111-111111111111";
const text = "当社は、2026年9月28日、不審な通信を検知しました。\n影響人数は現在調査中です。";
const article = (sentences: ArticleContent["blocks"][number][]): ArticleContent => ({
  title: "t", summary: "s", blocks: sentences, links: [], seo: { title: "", description: "", keywords: [] }, sns: { x: "", facebook: "" },
});

describe("evidence trace", () => {
  it("verifies quotes that literally exist in the source and flags the rest", () => {
    const c = article([{ id: "b", type: "paragraph", sentences: [
      { id: "a", text: "同社は不審な通信を検知した。", kind: "fact", refs: [{ sourceId: SRC, quote: "当社は、2026年9月28日、不審な通信を検知しました。" }] },
      { id: "b", text: "影響は1万人。", kind: "fact", refs: [{ sourceId: SRC, quote: "影響人数は1万人です。" }] },
      { id: "c", text: "攻撃者は海外の集団とみられる。", kind: "fact", refs: [] },
      { id: "d", text: "一般に損害賠償を請求できる場合があります。", kind: "analysis", refs: [] },
    ] }]);
    const r = buildEvidenceReport(c, [{ id: SRC, content_text: text }]);
    expect(r.sentences.a.status).toBe("verified");
    expect(r.sentences.b.status).toBe("mismatch");
    expect(r.sentences.c.status).toBe("unsourced");
    expect(r.sentences.d.status).toBe("not_applicable");
    expect(r.coverage).toBe(33);
  });

  it("simulated articles only cite verbatim source sentences (100% coverage)", () => {
    const srcs = DEMO_SOURCES.filter((s) => s.incidentKey === "minato" && !s.failure).map((s, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`, publisher: s.publisher, title: s.title, url: `/demo-sources/${s.slug}`,
      source_type: s.sourceType, published_at: s.publishedAt, content_text: sanitizeSourceText(s.html, true).text,
    }));
    const c = buildSimulatedArticle({ title: "x", organization_name: "株式会社ミナト精機（架空）", category: "personal_data", disclosed_on: "2026-10-06" }, srcs, { firmName: "f", firmShort: "f" });
    const r = buildEvidenceReport(c, srcs);
    expect(r.totals.facts).toBeGreaterThan(3);
    expect(r.coverage).toBe(100);
    // the confirmed count supersedes the provisional "調査中" statement
    const body = c.blocks.flatMap((b) => (b.type === "paragraph" ? b.sentences.map((s) => s.text) : [])).join("");
    expect(body).toContain("12,400名分");
    expect(body).not.toContain("現在調査中");
  });

  it("drops references from edited sentences", () => {
    const prev = [{ id: "a", text: "Aです。", kind: "fact" as const, refs: [{ sourceId: SRC, quote: "Aでございます" }] }, { id: "b", text: "Bです。", kind: "fact" as const, refs: [{ sourceId: SRC, quote: "Bでございます" }] }];
    let n = 0;
    const next = reconcileParagraph(prev, "Aです。B（修正）です。", () => `n${n++}`);
    expect(next[0]).toEqual(prev[0]);
    expect(next[1].refs).toEqual([]);
    expect(splitSentences("一文目。二文目！三文目")).toEqual(["一文目。", "二文目！", "三文目"]);
  });
});
