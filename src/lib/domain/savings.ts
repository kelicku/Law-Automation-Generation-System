/** Operational Savings Preview — pure estimate from user input. Not a measured value. */
export interface SavingsInput {
  articlesPerMonth: number;
  manualMinutesPerArticle: number;
  reviewMinutesPerArticle: number;
  hourlyCostJpy: number;
}

export interface SavingsResult {
  manualHours: number;
  assistedHours: number;
  savedHours: number;
  savedRatio: number;
  savedCostJpy: number;
  annualSavedHours: number;
}

export function clampInput(i: SavingsInput): SavingsInput {
  const c = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
  return {
    articlesPerMonth: c(i.articlesPerMonth, 0, 1000),
    manualMinutesPerArticle: c(i.manualMinutesPerArticle, 0, 6000),
    reviewMinutesPerArticle: c(i.reviewMinutesPerArticle, 0, 6000),
    hourlyCostJpy: c(i.hourlyCostJpy, 0, 1_000_000),
  };
}

export function estimateSavings(raw: SavingsInput): SavingsResult {
  const i = clampInput(raw);
  const manual = (i.articlesPerMonth * i.manualMinutesPerArticle) / 60;
  const assisted = (i.articlesPerMonth * i.reviewMinutesPerArticle) / 60;
  const saved = Math.max(0, manual - assisted);
  return {
    manualHours: round1(manual),
    assistedHours: round1(assisted),
    savedHours: round1(saved),
    savedRatio: manual === 0 ? 0 : Math.round((saved / manual) * 100),
    savedCostJpy: Math.round(saved * i.hourlyCostJpy),
    annualSavedHours: round1(saved * 12),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
