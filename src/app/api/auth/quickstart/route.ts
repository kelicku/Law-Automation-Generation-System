import { z } from "zod";
import { demoAccessAllowed, findResumeTarget, grantDemoAccess, newResumeToken, setResumeCookie } from "@/lib/auth/demo-access";
import { createSession, destroySession } from "@/lib/auth/session";
import { workerSql } from "@/lib/db";
import { provisionSandbox, SandboxLimitError } from "@/lib/demo/sandbox";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/security/ratelimit";
import { ApiError, clientKey, handler, ok, readJson } from "@/lib/server/api";

/**
 * DEMO ONLY — click-only entry.
 *  mode "auto"   : resume the visitor's own demo firm if they have one, otherwise create it
 *  mode "resume" : resume only
 *  mode "new"    : always create a new private demo firm (one-click registration)
 */
const Body = z.object({ mode: z.enum(["auto", "resume", "new"]).default("auto"), code: z.string().max(100).optional() });

export const POST = handler(async (req: Request) => {
  if (!env.demoMode) throw new ApiError(404, "NOT_FOUND", "Not found");
  const { mode, code } = Body.parse(await readJson(req, 2_000));
  const ip = await clientKey();
  rateLimit(`quickstart:${ip}`, 20, 60_000);
  if (!(await demoAccessAllowed(code))) {
    throw new ApiError(401, code ? "INVALID_DEMO_CODE" : "DEMO_CODE_REQUIRED", code ? "デモアクセスコードが正しくありません。" : "招待リンクを開くか、デモアクセスコードを入力してください。");
  }
  if (code) await grantDemoAccess();

  if (mode !== "new") {
    const target = await findResumeTarget();
    if (target) {
      await destroySession();
      await createSession(target.userId, target.tenantId);
      await workerSql()`update sandbox_accounts set last_used_at = now() where user_id = ${target.userId}`;
      return ok({ ok: true, resumed: true, firm: target.firmName, redirect: "/app" });
    }
    if (mode === "resume") throw new ApiError(404, "NO_SANDBOX", "前回のデモ事務所が見つかりませんでした（デモの初期化などで削除された可能性があります）。");
  }

  // one-click registration
  rateLimit(`sandbox-create:${ip}`, 5, 3_600_000);
  const { token, hash } = newResumeToken();
  let result;
  try {
    result = await provisionSandbox(workerSql(), { resumeHash: hash, maxSandboxes: Number(process.env.SANDBOX_MAX ?? 200) });
  } catch (e) {
    if (e instanceof SandboxLimitError) throw new ApiError(503, "SANDBOX_LIMIT", e.message);
    throw e;
  }
  await destroySession();
  await createSession(result.userId, result.tenantId);
  await setResumeCookie(token);
  return ok({ ok: true, resumed: false, firm: result.firmName, redirect: "/app?journey=1&welcome=1" });
});
