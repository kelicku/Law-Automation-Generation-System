import { requireApiViewer } from "@/lib/auth/session";
import { workerSql } from "@/lib/db";
import { seedDemo } from "@/lib/demo/seed";
import { env } from "@/lib/env";
import { clientKey, handler, ok } from "@/lib/server/api";
import { ApiError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/security/ratelimit";

/** DEMO ONLY: restores the fictional seed data. Signs everyone out (sessions are part of the reset). */
export const POST = handler(async () => {
  if (!env.demoMode) throw new ApiError(404, "NOT_FOUND", "Not found");
  const viewer = await requireApiViewer();
  // resets every visitor's data, so only the platform operator may do it
  if (!viewer.isDemo || viewer.platformRole !== "operator") throw new ApiError(403, "FORBIDDEN", "デモ全体の初期化は運営者のみ実行できます。");
  rateLimit(`reset:${await clientKey()}`, 3, 60_000);
  await seedDemo(workerSql());
  return ok({ ok: true, redirect: "/" });
});
