import "server-only";
import { z } from "zod";
import { ApiError } from "./errors";

export async function uuidParam(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "NOT_FOUND", "見つかりません。");
  return id;
}

export function idempotencyKey(req: Request): string {
  const k = req.headers.get("idempotency-key") ?? "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(k)) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key ヘッダーが必要です。");
  return k;
}

export type IdParams = { params: Promise<{ id: string }> };
