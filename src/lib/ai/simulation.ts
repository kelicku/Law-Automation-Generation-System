/**
 * SIMULATION provider — used when no ANTHROPIC_API_KEY is configured.
 * Deterministic and extractive: every factual sentence is a light rephrasing of a
 * sentence that literally exists in a source, and the verbatim source sentence is
 * stored as the quote. Nothing outside the sources is asserted as fact; general legal
 * explanations are marked kind="analysis", firm notices kind="notice".
 */
import { splitSentences, type ArticleContent, type Block, type Sentence } from "@/lib/domain/article";
import { CATEGORY_LABEL, type Category } from "@/lib/domain/types";

export interface SimSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  source_type: string;
  published_at: string | null;
  content_text: string;
}

export interface SimIncident {
  title: string;
  organization_name: string;
  category: Category;
  disclosed_on: string | null;
}

export interface SimTenant {
  firmName: string;
  firmShort: string;
}

const ROLE_PATTERNS: { role: string; heading: string; re: RegExp }[] = [
  { role: "overview", heading: "公表された事案の概要", re: /(判明|発生|確認いたしました|行われた|受けました|取得していた|お詫び)/ },
  { role: "timeline", heading: "公表された事案の概要", re: /(\d{4}年)?\d{1,2}月\d{1,2}日/ },
  { role: "impact", heading: "影響の範囲", re: /(名|件|社)(分)?(と見込|であること|です|にのぼる)|情報は|含まれ|対象/ },
  { role: "cause", heading: "原因と事業者の対応", re: /(原因|脆弱性|操作ミス|設定)/ },
  { role: "response", heading: "原因と事業者の対応", re: /(遮断|削除|補填|返金|再発防止|通知|ご連絡|報告|停止|無効化|再測定|配信いたしました|窓口|お問い合わせ)/ },
];

const ANALYSIS: Record<Category, string[]> = {
  personal_data: [
    "個人データの漏えい等が発生し、個人の権利利益を害するおそれが大きい場合には、事業者は個人情報保護法に基づき、個人情報保護委員会への報告と本人への通知を行う必要があります。",
    "漏えいした情報の内容や、その後の被害の有無・程度によっては、事業者に対して損害賠償を請求できる可能性があります。",
    "ご自身の情報が対象に含まれているかどうかは、事業者からの通知や公表されている問い合わせ窓口でご確認ください。",
    "事業者を名乗る不審なメールや電話には応じず、身に覚えのない請求や連絡があった場合は、日時や内容を記録しておくことをおすすめします。",
  ],
  cyber_attack: [
    "サイバー攻撃の被害を受けた事業者であっても、安全管理措置が不十分であった場合には、利用者や取引先に対する責任が問題となることがあります。",
    "サービスの停止や不正利用により損害が生じた場合、契約内容や事業者の対応によっては、損害賠償や返金を求められる可能性があります。",
    "ログイン情報の使い回しを避け、事業者から案内がある場合は速やかにパスワードを変更してください。",
    "被害の状況を示す画面の記録や、事業者とのやり取りは、後の手続のために保存しておくことをおすすめします。",
  ],
  consumer_harm: [
    "定期購入であることが分かりにくい表示により申し込んだ場合、特定商取引法の規定に基づき、申込みの取消しなどを主張できる場合があります。",
    "事業者が返金に応じると公表している場合でも、対象期間や条件が定められていることがあるため、内容をよくご確認ください。",
    "申込み時の画面、確認メール、請求書などは、事業者との交渉や手続の際の資料となるため保存しておくことをおすすめします。",
    "表示と実際の内容が異なる場合、景品表示法や消費者契約法の観点から問題となる可能性があります。",
  ],
  other: [
    "公表された内容によっては、事業者に対して説明や対応を求められる場合があります。",
    "事業者とのやり取りや関連する資料は保存しておくことをおすすめします。",
  ],
};

const NOTICE = [
  "当事務所では、本件の影響を受けた可能性のある方からのご相談を受け付けています。",
  "ご相談の際は、事業者からの通知や関連するメールなどをお手元にご用意ください。",
  "本記事は公表情報に基づく一般的な解説であり、個別の事案についての法的助言ではありません。",
];

const PLAIN_ENDINGS: [RegExp, string][] = [
  [/いたしました$/, "した"],
  [/しました$/, "した"],
  [/([えけげせぜてでねべめれ])ました$/, "$1た"],
  [/しております$/, "している"],
  [/ております$/, "ている"],
  [/でおります$/, "でいる"],
  [/おりません$/, "いない"],
  [/ございません$/, "ない"],
  [/ありません$/, "ない"],
  [/行います$/, "行う"],
  [/いたします$/, "する"],
  [/します$/, "する"],
  [/まいります$/, "いく"],
  [/います$/, "いる"],
  [/でございます$/, "である"],
  [/です$/, "である"],
];

/** Rephrases a corporate first-person sentence into neutral reporting style. */
export function rephrase(sentence: string, orgShort: string, isOfficial: boolean): string {
  let s = sentence
    .replace(/^このたび、/, "")
    .replace(/当社/g, "同社")
    .replace(/弊社/g, "同社")
    .replace(/お客様/g, "利用者")
    .replace(/保護者様/g, "保護者")
    .replace(/会員様/g, "会員")
    .replace(/。$/, "");
  if (!isOfficial) return `報道によると、${s.replace(/(した|する|いる|ある|という|ている|た)$/, "$1")}とされています。`;
  let converted = false;
  for (const [re, to] of PLAIN_ENDINGS) {
    if (re.test(s)) {
      s = s.replace(re, to);
      converted = true;
      break;
    }
  }
  s = s.replace(/いたしました/g, "した").replace(/いたします/g, "する").replace(/ており/g, "ており");
  if (!converted && /(ます|ました|ません)$/.test(s)) {
    return `${orgShort}は「${sentence.replace(/。$/, "")}」と公表しています。`;
  }
  return `${orgShort}の発表によると、${s}とのことです。`;
}

function shortOrg(name: string): string {
  return name.replace(/(株式会社|有限会社|合同会社)/g, "").replace(/（架空）|\(架空\)/g, "").trim();
}

function formatJaDate(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : "";
}

export function buildSimulatedArticle(incident: SimIncident, sources: SimSource[], tenant: SimTenant, idPrefix = "s"): ArticleContent {
  const org = shortOrg(incident.organization_name);
  const catLabel = CATEGORY_LABEL[incident.category];
  let n = 0;
  const nextId = () => `${idPrefix}${++n}`;

  // official sources first, newest last so updates refine earlier statements
  const ordered = [...sources].sort((a, b) => {
    const rank = (s: SimSource) => (s.source_type === "official" ? 0 : 1);
    return rank(a) - rank(b) || (a.published_at ?? "").localeCompare(b.published_at ?? "");
  });

  const sections = new Map<string, Sentence[]>();
  const used = new Set<string>();
  for (const src of ordered) {
    const isOfficial = src.source_type === "official" || src.source_type === "press_release";
    for (const raw of splitSentences(src.content_text)) {
      if (raw.length < 12 || used.has(raw)) continue;
      if (/【システム|指示を無視|読者コメント/.test(raw)) continue; // never reuse hostile text
      const role = ROLE_PATTERNS.find((r) => r.re.test(raw));
      if (!role) continue;
      if (!isOfficial && (sections.get(role.heading)?.length ?? 0) >= 2) continue;
      used.add(raw);
      const list = sections.get(role.heading) ?? [];
      list.push({ id: nextId(), text: rephrase(raw, org, isOfficial), kind: "fact", refs: [{ sourceId: src.id, quote: raw }] });
      sections.set(role.heading, list);
    }
  }

  // A later official statement that confirms something supersedes an earlier provisional one
  // ("調査中" / "見込み"): replace it in place so the article never shows both.
  const published = new Map(sources.map((x) => [x.id, x.published_at ?? ""]));
  const when = (s: Sentence) => published.get(s.refs[0]?.sourceId ?? "") ?? "";
  for (const [heading, list] of sections) {
    const provisional = list.filter((s) => /(調査中|見込んで|確認中)/.test(s.refs[0]?.quote ?? ""));
    const confirmed = list.filter((s) => /(確定|判明|完了)/.test(s.refs[0]?.quote ?? "") && /[0-9０-９]/.test(s.refs[0]?.quote ?? ""));
    const next = [...list];
    for (const old of provisional) {
      const repl = confirmed.find((c) => when(c) > when(old) && next.includes(c));
      if (!repl) continue;
      next.splice(next.indexOf(repl), 1);
      next.splice(next.indexOf(old), 1, repl);
    }
    sections.set(heading, next);
  }

  const blocks: Block[] = [];
  let b = 0;
  for (const heading of ["公表された事案の概要", "影響の範囲", "原因と事業者の対応"]) {
    const sentences = sections.get(heading);
    if (!sentences?.length) continue;
    blocks.push({ id: `b${++b}`, type: "heading", text: heading });
    blocks.push({ id: `b${++b}`, type: "paragraph", sentences: sentences.slice(0, 6) });
  }
  blocks.push({ id: `b${++b}`, type: "heading", text: "影響を受けた可能性のある方へ" });
  blocks.push({
    id: `b${++b}`,
    type: "paragraph",
    sentences: ANALYSIS[incident.category].map((text) => ({ id: nextId(), text, kind: "analysis" as const, refs: [] })),
  });
  blocks.push({ id: `b${++b}`, type: "heading", text: `${tenant.firmShort}からのご案内` });
  blocks.push({
    id: `b${++b}`,
    type: "paragraph",
    sentences: NOTICE.map((text) => ({ id: nextId(), text, kind: "notice" as const, refs: [] })),
  });

  const disclosed = formatJaDate(incident.disclosed_on);
  const title = `${org}の${catLabel}事案について ― 公表内容と確認すべきポイント`;
  const summary = `${org}が${disclosed ? `${disclosed}に` : ""}公表した${catLabel}に関する事案について、公表情報をもとに概要と影響の範囲を整理し、影響を受けた可能性のある方が確認すべき点を解説します。`;

  return {
    title,
    summary,
    blocks,
    links: sources.map((s) => ({ label: `${s.publisher}「${s.title}」`, url: s.url })),
    seo: buildSeo(org, catLabel, tenant.firmShort, summary),
    sns: buildSns(org, catLabel, incident.category),
  };
}

export function buildSeo(org: string, catLabel: string, firmShort: string, summary: string) {
  const title = `${org}の${catLabel}｜公表内容と対応のポイント`;
  const desc = summary.length > 120 ? `${summary.slice(0, 118)}…` : summary;
  return {
    title: title.length > 40 ? title.slice(0, 40) : title,
    description: desc,
    keywords: [org, catLabel, "弁護士", "相談", firmShort].slice(0, 6),
  };
}

const TAG: Record<Category, string> = { personal_data: "個人情報", cyber_attack: "サイバーセキュリティ", consumer_harm: "消費者トラブル", other: "法律" };

export function buildSns(org: string, catLabel: string, category: Category) {
  return {
    x: `【解説】${org}の${catLabel}事案について、公表情報をもとに概要と確認すべきポイントを整理しました。 #${TAG[category]}`,
    facebook: `${org}が公表した${catLabel}に関する事案について、公表されている情報をもとに、影響の範囲と、影響を受けた可能性のある方が確認しておきたい点をまとめました。個別のご相談は当事務所のフォームから受け付けています。`,
  };
}
