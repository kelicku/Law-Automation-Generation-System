import { contentText, type ArticleContent } from "./article";

/**
 * Advertising-expression check for law-firm content.
 * Rule-based screening modelled on the kinds of expressions restricted for lawyers'
 * advertising in Japan (results guarantees, superlatives, comparison, fear-based
 * solicitation, unqualified "free" claims, "specialist" labels). It is a screening aid
 * and does not replace review by the responsible lawyer.
 */
export type AdSeverity = "error" | "warning";

export interface AdRule {
  id: string;
  severity: AdSeverity;
  label: string;
  re: RegExp;
  reason: string;
  suggestion: string;
}

export const AD_RULES: AdRule[] = [
  {
    id: "guarantee",
    severity: "error",
    label: "結果の保証",
    re: /(必ず|確実に|絶対に?|100\s*[%％])\s*(勝訴|勝て|取り戻|回収|賠償金?を?(獲得|受け取)|返金され|解決)/g,
    reason: "結果を保証・約束する表現は、事実に合致しない・誤認を招くおそれがある広告として扱われます。",
    suggestion: "「請求できる可能性があります」など、可能性として表現してください。",
  },
  {
    id: "superlative",
    severity: "error",
    label: "最上級・誇大表現",
    re: /(日本一|業界一|No\.?\s?1|ナンバーワン|最高の|最強|唯一の|業界初|圧倒的)/gi,
    reason: "客観的に検証できない最上級表現は誇大広告に当たるおそれがあります。",
    suggestion: "具体的な取扱分野や体制など、事実で説明してください。",
  },
  {
    id: "comparison",
    severity: "warning",
    label: "他事務所との比較",
    re: /(他の(法律)?事務所|他事務所|他の弁護士)(より|と比べ|と違い)/g,
    reason: "他の弁護士・事務所との比較広告は控えるべきとされています。",
    suggestion: "比較ではなく、自所の対応内容を説明してください。",
  },
  {
    id: "fear",
    severity: "warning",
    label: "不安をあおる表現",
    re: /(今すぐ(相談|連絡|申し込)しないと|手遅れになる|急がないと|損をします)/g,
    reason: "不安をあおって依頼を促す表現は、品位を損なう広告とみなされるおそれがあります。",
    suggestion: "期限がある場合は「〇〇には期限があります」と事実を示してください。",
  },
  {
    id: "specialist",
    severity: "warning",
    label: "「専門」表示",
    re: /(専門家|専門弁護士|専門の弁護士|専門事務所)/g,
    reason: "「専門」の表示は客観的基準が確立していないため、使用を控えることが推奨されています。",
    suggestion: "「〇〇分野を重点的に取り扱っています」などに言い換えてください。",
  },
  {
    id: "free",
    severity: "warning",
    label: "条件のない「無料」",
    re: /(完全無料|すべて無料|費用は一切かかりません|(?<![0-9,，０-９])[0０]円で)/g,
    reason: "費用に条件がある場合、無条件に無料と読める表現は誤認を招くおそれがあります。",
    suggestion: "「初回相談30分無料（以降は所定の費用）」のように条件を明示してください。",
  },
];

export interface AdFinding {
  ruleId: string;
  severity: AdSeverity;
  label: string;
  match: string;
  reason: string;
  suggestion: string;
}

export function checkAdExpressions(text: string): AdFinding[] {
  const findings: AdFinding[] = [];
  for (const rule of AD_RULES) {
    for (const m of text.matchAll(rule.re)) {
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        label: rule.label,
        match: m[0],
        reason: rule.reason,
        suggestion: rule.suggestion,
      });
    }
  }
  return findings;
}

export function checkArticleAds(content: ArticleContent): AdFinding[] {
  return checkAdExpressions([contentText(content), content.seo.title, content.seo.description, content.sns.x, content.sns.facebook].join("\n"));
}
