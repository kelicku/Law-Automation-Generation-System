import type { ArticleContent } from "./article";
import { checkArticleAds, type AdFinding } from "./adcheck";
import { buildEvidenceReport, type EvidenceReport, type SourceForCheck } from "./evidence";

export type CheckLevel = "pass" | "warning" | "blocking";

export interface CheckItem {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
}

export interface PrecheckResult {
  items: CheckItem[];
  blocking: number;
  warnings: number;
  ads: AdFinding[];
  evidence: EvidenceReport;
}

export interface PrecheckInput {
  content: ArticleContent;
  sources: SourceForCheck[];
  feeNotice: string;
  consultationFormUrl: string;
}

/** Pre-publication check. Re-run on the server at submit / approve / publish time. */
export function runPrecheck({ content, sources, feeNotice, consultationFormUrl }: PrecheckInput): PrecheckResult {
  const items: CheckItem[] = [];
  const evidence = buildEvidenceReport(content, sources);
  const ads = checkArticleAds(content);

  const adErrors = ads.filter((a) => a.severity === "error");
  const adWarnings = ads.filter((a) => a.severity === "warning");
  items.push({
    id: "ads",
    label: "広告表現チェック",
    level: adErrors.length ? "blocking" : adWarnings.length ? "warning" : "pass",
    detail: adErrors.length || adWarnings.length
      ? `要修正 ${adErrors.length}件 / 注意 ${adWarnings.length}件`
      : "規制対象となりうる表現は検出されませんでした",
  });

  const { mismatch, unsourced, facts, verified } = evidence.totals;
  items.push({
    id: "evidence",
    label: "出典の裏付け",
    level: mismatch + unsourced > 0 ? "blocking" : "pass",
    detail: mismatch + unsourced > 0
      ? `根拠未確認の事実文が ${mismatch + unsourced}件あります（出典不一致 ${mismatch} / 出典なし ${unsourced}）`
      : `事実文 ${facts}件すべての引用が出典本文と一致（${verified}/${facts}）`,
  });

  const missing: string[] = [];
  if (!content.title.trim()) missing.push("タイトル");
  if (!content.summary.trim()) missing.push("概要");
  if (content.links.length === 0) missing.push("関連リンク");
  items.push({
    id: "required",
    label: "必須項目",
    level: missing.length ? "blocking" : "pass",
    detail: missing.length ? `未入力: ${missing.join("・")}` : "タイトル・概要・関連リンクが入力されています",
  });

  const seoTitleLen = [...content.seo.title].length;
  const seoDescLen = [...content.seo.description].length;
  const seoProblems: string[] = [];
  if (seoTitleLen === 0) seoProblems.push("SEOタイトル未設定");
  else if (seoTitleLen > 40) seoProblems.push(`SEOタイトルが長め（${seoTitleLen}字・目安40字以内）`);
  if (seoDescLen === 0) seoProblems.push("メタディスクリプション未設定");
  else if (seoDescLen < 50 || seoDescLen > 130) seoProblems.push(`メタディスクリプション ${seoDescLen}字（目安50〜130字）`);
  items.push({
    id: "seo",
    label: "SEO設定",
    level: seoTitleLen === 0 || seoDescLen === 0 ? "blocking" : seoProblems.length ? "warning" : "pass",
    detail: seoProblems.length ? seoProblems.join(" / ") : "SEOタイトル・メタディスクリプションが目安の範囲内です",
  });

  items.push({
    id: "fees",
    label: "費用表示",
    level: feeNotice.trim().length >= 10 ? "pass" : "blocking",
    detail: feeNotice.trim().length >= 10 ? "事務所設定の費用表示が公開ページに掲載されます" : "事務所設定で費用表示を入力してください",
  });

  items.push({
    id: "form",
    label: "相談フォーム",
    level: /^https:\/\//.test(consultationFormUrl) ? "pass" : "blocking",
    detail: /^https:\/\//.test(consultationFormUrl) ? "外部相談フォーム（HTTPS）へのリンクが設定されています" : "HTTPSの相談フォームURLが必要です",
  });

  return {
    items,
    blocking: items.filter((i) => i.level === "blocking").length,
    warnings: items.filter((i) => i.level === "warning").length,
    ads,
    evidence,
  };
}
