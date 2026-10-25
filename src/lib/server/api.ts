import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AiError } from "@/lib/ai/errors";
import { logError } from "@/lib/security/redact";
import { ApiError } from "./errors";

export { ApiError };

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status, headers: { "cache-control": "no-store" } });
}

/** Wraps a route handler: maps known errors to JSON and hides internals of unknown ones. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return jsonError(e.status, e.code, e.message, e.details);
      if (e instanceof AiError) return jsonError(e.status, e.code, e.message, { logId: e.logId, retryable: e.retryable });
      if (e instanceof ZodError) {
        return jsonError(400, "INVALID_INPUT", "入力内容に誤りがあります。", e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      }
      const pg = e as { code?: string };
      if (pg?.code === "42501") return jsonError(403, "FORBIDDEN", "この操作を行う権限がありません。");
      if (pg?.code === "23505") return jsonError(409, "CONFLICT", "同じ処理がすでに実行されています。");
      if (pg?.code === "23514") return jsonError(409, "PRECONDITION_FAILED", "データベースの整合性チェックにより拒否されました。");
      logError("api", e);
      return jsonError(500, "INTERNAL", "サーバーでエラーが発生しました。時間をおいて再試行してください。");
    }
  };
}

export async function readJson(req: Request, maxBytes = 200_000): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "送信データが大きすぎます。");
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "送信データが大きすぎます。");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSONの形式が正しくありません。");
  }
}

export async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}
