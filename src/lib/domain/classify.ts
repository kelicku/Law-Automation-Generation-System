import type { Category } from "./types";

/** Deterministic keyword classifier — used in simulation mode and as a cross-check for AI output. */
const RULES: { category: Category; words: string[] }[] = [
  { category: "personal_data", words: ["個人情報", "漏えい", "流出", "誤送信", "顧客情報", "会員情報", "氏名", "メールアドレス", "位置情報"] },
  { category: "cyber_attack", words: ["不正アクセス", "ランサムウェア", "サイバー攻撃", "マルウェア", "不正ログイン", "フィッシング", "暗号化", "攻撃"] },
  { category: "consumer_harm", words: ["定期購入", "返金", "不当表示", "景品表示法", "消費者", "解約", "誇大", "特定商取引"] },
];

export interface RuleClassification {
  category: Category;
  confidence: number;
  matched: string[];
  scores: Record<Category, number>;
}

export function classifyByRules(text: string): RuleClassification {
  const scores: Record<Category, number> = { personal_data: 0, cyber_attack: 0, consumer_harm: 0, other: 0 };
  const matched: string[] = [];
  for (const r of RULES) {
    for (const w of r.words) {
      const n = text.split(w).length - 1;
      if (n > 0) {
        scores[r.category] += n;
        matched.push(w);
      }
    }
  }
  const ranked = (Object.entries(scores) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  if (top[1] === 0) return { category: "other", confidence: 0.4, matched, scores };
  const confidence = Math.min(0.95, 0.5 + (top[1] - (second?.[1] ?? 0)) / (top[1] + 2));
  return { category: top[0], confidence: Math.round(confidence * 100) / 100, matched, scores };
}

/** Extracts an affected-person count such as "約12,400名" / "3万件". Returns null when not disclosed. */
export function extractAffectedCount(text: string): { count: number; status: "estimated" | "confirmed" } | null {
  for (const sentence of text.normalize("NFKC").split(/(?<=[。\n])/)) {
    const m = /(約|最大|およそ)?\s*([0-9,]+)\s*(万)?\s*(名|人|件|社)/.exec(sentence);
    if (!m) continue;
    const n = parseInt(m[2].replace(/,/g, ""), 10) * (m[3] ? 10_000 : 1);
    if (!Number.isFinite(n) || n <= 0) continue;
    const status = /確定/.test(sentence) ? "confirmed" : m[1] || /見込|可能性|推計|のぼる/.test(sentence) ? "estimated" : "confirmed";
    return { count: n, status };
  }
  return null;
}
