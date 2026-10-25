/**
 * Duplicate detection for collected items. An item is a duplicate of an existing
 * incident when the normalised organisation name matches and the titles are similar,
 * or when the organisation matches and the disclosures are within 45 days.
 */
export interface DedupeCandidate {
  organization: string;
  title: string;
  disclosedOn: string | null; // YYYY-MM-DD
}

export interface DedupeTarget extends DedupeCandidate {
  id: string;
}

const CORP_WORDS = /(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|（株）|\(株\)|（架空）|\(架空\)|ホールディングス|グループ)/g;

export function normalizeOrg(name: string): string {
  return name.normalize("NFKC").replace(CORP_WORDS, "").replace(/[\s・.,、。]/g, "").toLowerCase();
}

function bigrams(s: string): Set<string> {
  const t = s.normalize("NFKC").replace(/[\s「」『』（）()、。・:：]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function titleSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export function findDuplicate(c: DedupeCandidate, existing: DedupeTarget[]): { target: DedupeTarget; reason: string } | null {
  const org = normalizeOrg(c.organization);
  let best: { target: DedupeTarget; score: number; reason: string } | null = null;
  for (const e of existing) {
    if (normalizeOrg(e.organization) !== org) continue;
    const sim = titleSimilarity(c.title, e.title);
    const days = daysBetween(c.disclosedOn, e.disclosedOn);
    const score = sim + (days <= 45 ? 0.3 : 0);
    if (sim >= 0.25 || days <= 45) {
      const reason = `組織名一致・タイトル類似度 ${(sim * 100).toFixed(0)}%${days <= 45 ? `・公表日差 ${Math.round(days)}日` : ""}`;
      if (!best || score > best.score) best = { target: e, score, reason };
    }
  }
  return best ? { target: best.target, reason: best.reason } : null;
}

export function fingerprint(c: DedupeCandidate): string {
  return `${normalizeOrg(c.organization)}:${(c.disclosedOn ?? "unknown").slice(0, 7)}:${c.title.normalize("NFKC").slice(0, 24)}`;
}
