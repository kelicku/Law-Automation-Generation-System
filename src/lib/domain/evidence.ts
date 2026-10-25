import { allSentences, type ArticleContent, type Sentence } from "./article";

/**
 * Evidence Trace verification.
 *
 * A reference is "verified" only when its quote is literally contained in the stored
 * text of the referenced source (after Unicode/whitespace normalisation). This is a
 * mechanical string check — it proves the quote exists in the source, not that the
 * article's wording is a legally correct reading of it.
 */
export type EvidenceStatus = "verified" | "mismatch" | "unsourced" | "not_applicable";

export interface SourceForCheck {
  id: string;
  content_text: string;
}

export interface SentenceEvidence {
  sentenceId: string;
  status: EvidenceStatus;
  refs: { sourceId: string; quote: string; found: boolean; sourceMissing: boolean }[];
}

export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[「」『』"'“”‘’]/g, "")
    .toLowerCase();
}

export function checkSentence(sentence: Sentence, sources: Map<string, string>): SentenceEvidence {
  const refs = sentence.refs.map((r) => {
    const text = sources.get(r.sourceId);
    if (text === undefined) return { sourceId: r.sourceId, quote: r.quote, found: false, sourceMissing: true };
    return { sourceId: r.sourceId, quote: r.quote, found: text.includes(normalizeForMatch(r.quote)), sourceMissing: false };
  });
  let status: EvidenceStatus;
  if (sentence.kind !== "fact") status = "not_applicable";
  else if (refs.length === 0) status = "unsourced";
  else status = refs.some((r) => r.found) ? "verified" : "mismatch";
  return { sentenceId: sentence.id, status, refs };
}

export interface EvidenceReport {
  sentences: Record<string, SentenceEvidence>;
  totals: { facts: number; verified: number; mismatch: number; unsourced: number; nonFact: number };
  /** verified facts / all fact sentences, 0–100. Not an indicator of legal accuracy. */
  coverage: number;
}

export function buildEvidenceReport(content: ArticleContent, sources: SourceForCheck[]): EvidenceReport {
  const map = new Map(sources.map((s) => [s.id, normalizeForMatch(s.content_text)]));
  const sentences: Record<string, SentenceEvidence> = {};
  const totals = { facts: 0, verified: 0, mismatch: 0, unsourced: 0, nonFact: 0 };
  for (const s of allSentences(content)) {
    const ev = checkSentence(s, map);
    sentences[s.id] = ev;
    if (ev.status === "not_applicable") totals.nonFact++;
    else {
      totals.facts++;
      totals[ev.status]++;
    }
  }
  const coverage = totals.facts === 0 ? 100 : Math.round((totals.verified / totals.facts) * 100);
  return { sentences, totals, coverage };
}

export const COVERAGE_METHOD =
  "根拠カバー率 ＝（出典本文に引用が実在することを機械照合できた事実文の数）÷（事実文の総数）。" +
  "解説文・案内文は対象外です。引用の存在を確認する指標であり、記事内容の法的な正確性を保証するものではありません。";
