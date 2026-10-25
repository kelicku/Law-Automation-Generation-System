/** Progress events streamed (NDJSON) from POST /api/collect to the Radar UI. */
export type CollectStep = "fetch" | "normalize" | "dedupe" | "classify" | "save";

export const STEP_LABEL: Record<CollectStep, { ja: string; en: string; detail: string }> = {
  fetch: { ja: "取得", en: "Fetch", detail: "登録済みの情報源から公開情報を取得" },
  normalize: { ja: "正規化", en: "Normalize", detail: "HTML除去・文字種統一・不審な命令文の検出" },
  dedupe: { ja: "重複判定", en: "Deduplicate", detail: "URL・本文ハッシュ・組織名と類似度で照合" },
  classify: { ja: "分類", en: "Classify", detail: "AIで事件情報を抽出しカテゴリを判定" },
  save: { ja: "保存", en: "Persist", detail: "事件・出典・変更履歴を保存し、続報を判定" },
};

export type CollectEvent =
  | { type: "start"; runId: string; mode: "demo" | "demo+live"; aiProvider: "anthropic" | "simulation" }
  | { type: "step"; step: CollectStep; status: "running" | "done" | "failed"; detail?: string; count?: number }
  | { type: "source"; name: string; url: string; ok: boolean; items: number; error?: string; durationMs: number }
  | { type: "item"; title: string; outcome: "new_incident" | "update" | "related" | "duplicate" | "skipped"; detail: string; category?: string; flagged?: boolean }
  | { type: "done"; runId: string; status: "succeeded" | "partial" | "failed"; stats: CollectStats }
  | { type: "error"; code: string; message: string };

export interface CollectStats {
  fetched: number;
  failedSources: number;
  newSources: number;
  duplicates: number;
  newIncidents: number;
  updates: number;
  materialChanges: number;
  injectionFlags: number;
  proposals: number;
}
