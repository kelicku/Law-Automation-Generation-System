import "server-only";
import type { Viewer } from "@/lib/auth/session";
import { json, workerSql } from "@/lib/db";
import { ApiError } from "@/lib/server/errors";
import { jobSignature } from "./sign";

export type JobKind = "article_generate" | "collect";

/**
 * JOB_MODE=background (serverless hosts such as Netlify): long AI work runs in a background
 * function (up to 15 min) instead of inside the request, which has a short timeout there.
 * Unset (local / tests): work runs synchronously inside the request as before.
 */
export function backgroundJobs(): boolean {
  return process.env.JOB_MODE === "background";
}

export async function createJob(kind: JobKind, viewer: Viewer, payload: Record<string, unknown>): Promise<string> {
  const sql = workerSql();
  const snapshot = { userId: viewer.userId, name: viewer.name, email: viewer.email, platformRole: viewer.platformRole, isDemo: viewer.isDemo, tenant: viewer.tenant, role: viewer.role, memberships: [], sessionId: "" };
  const [row] = await sql`
    insert into ai_jobs (kind, tenant_id, user_id, viewer, payload)
    values (${kind}, ${viewer.tenant?.id ?? null}, ${viewer.userId}, ${json(sql as never, snapshot)}, ${json(sql as never, payload)}) returning id`;
  return row.id as string;
}

/** Starts the background function. It answers 202 immediately; progress is read with getJob(). */
export async function triggerJob(jobId: string, origin: string): Promise<void> {
  const res = await fetch(`${origin}/.netlify/functions/ai-job-background`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId, sig: jobSignature(jobId) }),
  });
  if (res.status !== 202 && !res.ok) {
    await workerSql()`update ai_jobs set status = 'failed', error = ${`バックグラウンド処理を開始できませんでした（HTTP ${res.status}）`}, updated_at = now() where id = ${jobId}`;
    throw new ApiError(502, "JOB_START_FAILED", "AI処理を開始できませんでした。再試行してください。");
  }
}

export async function getJob(jobId: string, userId: string, after: number) {
  const [row] = await workerSql()`
    select id, kind, status, events, result, error, error_code, created_at, updated_at from ai_jobs where id = ${jobId} and user_id = ${userId}`;
  if (!row) throw new ApiError(404, "NOT_FOUND", "処理が見つかりません。");
  const events = (row.events as unknown[]) ?? [];
  // a job stuck "running" well past the background limit is reported as failed
  const stale = row.status !== "succeeded" && row.status !== "failed" && Date.now() - new Date(row.updated_at).getTime() > 16 * 60_000;
  return {
    id: row.id as string,
    kind: row.kind as JobKind,
    status: stale ? "failed" : (row.status as string),
    events: events.slice(Math.max(0, after)),
    total: events.length,
    result: row.result,
    error: stale ? "処理が時間内に完了しませんでした。再試行してください。" : (row.error as string | null),
    errorCode: stale ? "JOB_TIMEOUT" : (row.error_code as string | null),
  };
}
