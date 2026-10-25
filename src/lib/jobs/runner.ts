/**
 * Executes one queued AI job. Runs inside the Netlify background function (no Next.js request
 * context), so it must only import request-independent modules.
 */
import { AiError } from "@/lib/ai/errors";
import type { Viewer } from "@/lib/auth/session";
import { runCollection } from "@/lib/collector/pipeline";
import type { CollectEvent } from "@/lib/collector/events";
import { json, workerSql } from "@/lib/db";
import { generateArticle } from "@/lib/server/articles";
import { ApiError } from "@/lib/server/errors";
import { logError } from "@/lib/security/redact";

export async function runJob(jobId: string): Promise<void> {
  const sql = workerSql();
  const [job] = await sql`
    update ai_jobs set status = 'running', updated_at = now() where id = ${jobId} and status = 'queued'
    returning kind, viewer, payload`;
  if (!job) return; // already picked up (retries) or unknown
  const viewer = job.viewer as Viewer;
  try {
    if (job.kind === "article_generate") {
      const payload = job.payload as { incidentId: string };
      const r = await generateArticle(viewer, payload.incidentId, jobId);
      await sql`update ai_jobs set status = 'succeeded', result = ${json(sql as never, r)}, updated_at = now() where id = ${jobId}`;
      return;
    }
    // collect: append each progress event so the browser can render the pipeline live
    let chain: Promise<unknown> = Promise.resolve();
    let finalEvent: CollectEvent | null = null;
    const emit = (e: CollectEvent) => {
      if (e.type === "done" || e.type === "error") finalEvent = e;
      chain = chain.then(() => sql`update ai_jobs set events = events || ${json(sql as never, [e])}::jsonb, updated_at = now() where id = ${jobId}`);
    };
    await runCollection(viewer, emit);
    await chain;
    const fe = finalEvent as CollectEvent | null;
    const failed = fe?.type === "error";
    await sql`update ai_jobs set status = ${failed ? "failed" : "succeeded"}, error = ${failed && fe?.type === "error" ? fe.message : null},
              result = ${json(sql as never, fe ?? {})}, updated_at = now() where id = ${jobId}`;
  } catch (e) {
    const known = e instanceof ApiError || e instanceof AiError;
    if (!known) logError("job", e);
    const code = known ? (e as ApiError | AiError).code : "JOB_FAILED";
    const message = known ? (e as Error).message : "AI処理中にエラーが発生しました。再試行してください。";
    if (job.kind === "collect") {
      await sql`update ai_jobs set events = events || ${json(sql as never, [{ type: "error", code, message }])}::jsonb where id = ${jobId}`;
    }
    await sql`update ai_jobs set status = 'failed', error_code = ${code}, error = ${message}, updated_at = now() where id = ${jobId}`;
  }
}
