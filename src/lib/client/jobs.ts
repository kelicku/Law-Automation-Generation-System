"use client";
import { ClientApiError } from "./api";

export interface JobState<R = unknown> {
  status: "queued" | "running" | "succeeded" | "failed";
  events: unknown[];
  total: number;
  result: R;
  error: string | null;
  errorCode: string | null;
}

/** Polls a background AI job until it finishes. New progress events are passed to onEvents. */
export async function waitForJob<R = unknown>(jobId: string, opts: { onEvents?: (events: unknown[]) => void; intervalMs?: number; timeoutMs?: number } = {}): Promise<JobState<R>> {
  const started = Date.now();
  let seen = 0;
  let failures = 0;
  for (;;) {
    let job: JobState<R> | null = null;
    try {
      const res = await fetch(`/api/jobs/${jobId}?after=${seen}`, { credentials: "same-origin", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ClientApiError(res.status, data?.error?.code ?? "UNKNOWN", data?.error?.message ?? `HTTP ${res.status}`);
      job = data as JobState<R>;
      failures = 0;
    } catch (e) {
      if (e instanceof ClientApiError && e.status !== 0 && e.status < 500) throw e;
      if (++failures > 5) throw new ClientApiError(0, "NETWORK", "進捗を取得できませんでした。通信状況を確認して再試行してください。");
    }
    if (job) {
      if (job.events.length) {
        seen = job.total;
        opts.onEvents?.(job.events);
      }
      if (job.status === "succeeded") return job;
      if (job.status === "failed") throw new ClientApiError(500, job.errorCode ?? "JOB_FAILED", job.error ?? "AI処理に失敗しました。");
    }
    if (Date.now() - started > (opts.timeoutMs ?? 16 * 60_000)) throw new ClientApiError(504, "JOB_TIMEOUT", "処理に時間がかかっています。しばらくしてから画面を再読み込みしてください。");
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1200));
  }
}
