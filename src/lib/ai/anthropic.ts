import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AiError } from "./errors";

/** USD per 1M tokens (input, output). Used for the cost estimate shown in the inspector. */
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING["claude-opus-5-5"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

let client: Anthropic | null = null;

export async function callAnthropic<S extends z.ZodType>(opts: { model: string; system: string; user: string; schema: S }) {
  client ??= new Anthropic({ maxRetries: 2, timeout: 180_000 });
  try {
    const res = await client.messages.parse({
      model: opts.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: { format: zodOutputFormat(opts.schema), effort: "medium" },
    });
    if (res.stop_reason === "refusal") throw new AiError("AI_REFUSED", "AIが応答を拒否しました。入力内容を確認してください。", undefined, false);
    if (res.stop_reason === "max_tokens") throw new AiError("AI_INVALID_OUTPUT", "AIの出力が上限で途切れました。");
    return {
      output: res.parsed_output as unknown,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AiError("AI_RATE_LIMITED", "AI APIのレート制限に達しました。しばらくして再試行してください。");
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("AI_PROVIDER_ERROR", "AI APIの認証に失敗しました（APIキー設定を確認してください）。", undefined, false);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("AI_PROVIDER_ERROR", "AI APIに接続できませんでした。");
    if (e instanceof Anthropic.APIError) throw new AiError("AI_PROVIDER_ERROR", `AI APIがエラーを返しました（HTTP ${e.status ?? "?"}）。`);
    throw new AiError("AI_INVALID_OUTPUT", "AIの出力を解析できませんでした。");
  }
}
