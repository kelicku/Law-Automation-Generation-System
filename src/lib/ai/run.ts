import "server-only";
import type { z } from "zod";
import { json, workerSql } from "@/lib/db";
import { env } from "@/lib/env";
import { logError, redact } from "@/lib/security/redact";
import { callAnthropic, estimateCost } from "./anthropic";
import { AiError } from "./errors";
import { PROMPTS, type AiTask } from "./prompts";

export const SIMULATION_MODEL = "simulation-extractive-v1";

export interface AiRunResult<T> {
  output: T;
  logId: string;
  provider: "anthropic" | "simulation";
  model: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiRunOptions<W, T> {
  tenantId: string;
  userId: string | null;
  task: AiTask;
  /** Unique per logical job. A second request with the same key is rejected (duplicate execution guard). */
  jobKey: string;
  /** Sanitised description of the input for the inspector. Never include secrets. */
  inputSummary: Record<string, unknown>;
  buildUserPrompt: () => string;
  wire: z.ZodType<W>;
  fromWire?: (w: W) => unknown;
  simulate: () => unknown;
  validate: (raw: unknown) => T;
  articleId?: string | null;
  incidentId?: string | null;
  /** characters of untrusted input (for simulated token estimates) */
  inputChars?: number;
}

export function aiMode(): { provider: "anthropic" | "simulation"; model: string } {
  return env.anthropicKeyConfigured ? { provider: "anthropic", model: env.aiModel } : { provider: "simulation", model: SIMULATION_MODEL };
}

/** Current month usage for a tenant (calls that consumed or attempted to consume quota). */
export async function monthlyUsage(tenantId: string) {
  const sql = workerSql();
  const [row] = await sql`
    select
      (select ai_monthly_call_limit from subscriptions where tenant_id = ${tenantId}) as limit,
      (select count(*)::int from ai_execution_logs
        where tenant_id = ${tenantId} and status in ('running', 'succeeded', 'failed', 'invalid_output')
          and created_at >= date_trunc('month', now())) as used`;
  return { limit: Number(row?.limit ?? 0), used: Number(row?.used ?? 0) };
}

export async function executeAiTask<W, T>(o: AiRunOptions<W, T>): Promise<AiRunResult<T>> {
  const sql = workerSql();
  const prompt = PROMPTS[o.task];
  const mode = aiMode();

  // 1. quota
  const usage = await monthlyUsage(o.tenantId);
  if (usage.used >= usage.limit) {
    const [log] = await sql`
      insert into ai_execution_logs (job_key, tenant_id, task, prompt_id, prompt_version, provider, model, status, input_summary,
        error_code, error_message, created_by, article_id, incident_id, finished_at)
      values (${`${o.jobKey}:rejected:${Date.now()}`}, ${o.tenantId}, ${o.task}, ${prompt.id}, ${prompt.version}, ${mode.provider}, ${mode.model},
        'rejected_limit', ${json(sql as never, o.inputSummary)}, 'AI_LIMIT', ${`月間上限 ${usage.limit}回に達しています`}, ${o.userId}, ${o.articleId ?? null}, ${o.incidentId ?? null}, now())
      returning id`;
    const month = new Date().toISOString().slice(0, 7);
    await sql`
      insert into notifications (tenant_id, audience, kind, severity, title, body, link, dedupe_key)
      values (${o.tenantId}, 'tenant', 'ai_limit', 'critical', 'AI利用量が月間上限に達しました',
        ${`今月のAI処理回数が上限（${usage.limit}回）に達したため、新しいAI処理を停止しています。`}, '/app/inspector', ${`ai_limit:${o.tenantId}:${month}`})
      on conflict (dedupe_key) do nothing`;
    await sql`
      insert into notifications (tenant_id, audience, kind, severity, title, body, link, dedupe_key)
      values (${o.tenantId}, 'operator', 'ai_limit', 'warning', 'AI利用量上限に達した事務所があります',
        ${`上限 ${usage.limit}回 / 今月 ${usage.used}回`}, '/app/operations', ${`ai_limit_op:${o.tenantId}:${month}`})
      on conflict (dedupe_key) do nothing`;
    throw new AiError("AI_LIMIT", `今月のAI利用回数が上限（${usage.limit}回）に達しています。運営者に上限の変更を依頼してください。`, log.id, false);
  }

  // 2. duplicate-execution guard
  const [log] = await sql`
    insert into ai_execution_logs (job_key, tenant_id, task, prompt_id, prompt_version, provider, model, status, input_summary, created_by, article_id, incident_id)
    values (${o.jobKey}, ${o.tenantId}, ${o.task}, ${prompt.id}, ${prompt.version}, ${mode.provider}, ${mode.model}, 'running',
      ${json(sql as never, o.inputSummary)}, ${o.userId}, ${o.articleId ?? null}, ${o.incidentId ?? null})
    on conflict (job_key) do nothing
    returning id`;
  if (!log) throw new AiError("AI_DUPLICATE_JOB", "同じAI処理がすでに実行中、または完了しています。", undefined, false);

  const started = Date.now();
  const fail = async (status: "failed" | "invalid_output", code: string, message: string) => {
    await sql`update ai_execution_logs set status = ${status}, error_code = ${code}, error_message = ${redact(message)},
              duration_ms = ${Date.now() - started}, finished_at = now() where id = ${log.id}`;
  };

  try {
    // 3. failure injection (demo setting) — exercises the error path end-to-end
    const [settings] = await sql`select simulate_ai_failure from tenant_settings where tenant_id = ${o.tenantId}`;
    if (settings?.simulate_ai_failure) {
      await new Promise((r) => setTimeout(r, 400));
      throw new AiError("AI_PROVIDER_ERROR", "AI APIが応答しませんでした（障害シミュレーション設定が有効です）。");
    }

    // 4. provider call
    let raw: unknown;
    let inputTokens: number;
    let outputTokens: number;
    if (mode.provider === "anthropic") {
      const res = await callAnthropic({ model: mode.model, system: prompt.system, user: o.buildUserPrompt(), schema: o.wire });
      if (res.output == null) throw new AiError("AI_INVALID_OUTPUT", "AIの出力がスキーマに適合しませんでした。");
      raw = o.fromWire ? o.fromWire(res.output as W) : res.output;
      inputTokens = res.inputTokens;
      outputTokens = res.outputTokens;
    } else {
      await new Promise((r) => setTimeout(r, 450 + Math.floor(Math.random() * 650)));
      raw = o.simulate();
      // rough estimate for Japanese text (~1.6 chars / token) so the inspector can show the would-be cost
      inputTokens = Math.ceil(((o.inputChars ?? 0) + prompt.system.length) / 1.6);
      outputTokens = Math.ceil(JSON.stringify(raw).length / 2.4);
    }

    // 5. strict validation
    let output: T;
    try {
      output = o.validate(raw);
    } catch (e) {
      await fail("invalid_output", "AI_INVALID_OUTPUT", e instanceof Error ? e.message : String(e));
      throw new AiError("AI_INVALID_OUTPUT", "AIの出力が必要な形式を満たしていなかったため、結果を破棄しました。再試行してください。", log.id);
    }

    const durationMs = Date.now() - started;
    const costUsd = mode.provider === "anthropic" ? estimateCost(mode.model, inputTokens, outputTokens) : 0;
    const wouldCost = estimateCost(env.aiModel, inputTokens, outputTokens);
    await sql`
      update ai_execution_logs set status = 'succeeded', output = ${json(sql as never, output)}, input_tokens = ${inputTokens}, output_tokens = ${outputTokens},
        cost_usd = ${costUsd}, duration_ms = ${durationMs}, finished_at = now(),
        input_summary = input_summary || ${json(sql as never, mode.provider === "simulation" ? { estimated_cost_if_live_usd: Number(wouldCost.toFixed(6)), token_counts: "estimated" } : { token_counts: "provider" })}
      where id = ${log.id}`;
    return { output, logId: log.id, provider: mode.provider, model: mode.model, durationMs, inputTokens, outputTokens, costUsd };
  } catch (e) {
    if (e instanceof AiError) {
      if (e.code !== "AI_INVALID_OUTPUT") await fail("failed", e.code, e.message);
      e.logId ??= log.id;
      throw e;
    }
    logError("ai", e);
    await fail("failed", "AI_PROVIDER_ERROR", e instanceof Error ? e.message : String(e));
    throw new AiError("AI_PROVIDER_ERROR", "AI処理中にエラーが発生しました。", log.id);
  }
}
