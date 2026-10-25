"use client";
import { newIdempotencyKey } from "@/lib/utils";

export class ClientApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** fetch wrapper for same-origin JSON APIs. Throws ClientApiError with the server's Japanese message. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; idempotent?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.idempotent) headers["idempotency-key"] = newIdempotencyKey();
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? "POST", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: opts.signal, credentials: "same-origin" });
  } catch {
    throw new ClientApiError(0, "NETWORK", "サーバーに接続できませんでした。通信状況を確認して再試行してください。");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: unknown } }).error;
    throw new ClientApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `エラーが発生しました（HTTP ${res.status}）`, err?.details);
  }
  return data as T;
}

export function journey(event: JourneyEvent) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("aiip:journey", { detail: event }));
}

export type JourneyEvent = "incident_viewed" | "sources_viewed" | "article_generated" | "article_edited" | "precheck_run" | "article_approved" | "site_viewed";
