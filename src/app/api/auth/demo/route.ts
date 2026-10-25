import { z } from "zod";
import { demoAccessAllowed, grantDemoAccess } from "@/lib/auth/demo-access";
import { createSession, destroySession } from "@/lib/auth/session";
import { workerSql } from "@/lib/db";
import { DEMO_USERS } from "@/lib/demo/tenants";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/security/ratelimit";
import { ApiError, clientKey, handler, ok, readJson } from "@/lib/server/api";

/**
 * DEMO ONLY — one-click sign-in as a fictional persona (also used by the demo tenant switcher).
 * Disabled unless DEMO_MODE=true. This is not the production authentication path:
 * the session it creates is an ordinary server session and all authorisation (RLS) still applies.
 */
const Body = z.object({ persona: z.enum(DEMO_USERS.map((u) => u.key) as [string, ...string[]]), code: z.string().max(100).optional() });

export const POST = handler(async (req: Request) => {
  if (!env.demoMode) throw new ApiError(404, "NOT_FOUND", "Not found");
  rateLimit(`demo:${await clientKey()}`, 20, 60_000);
  const { persona, code } = Body.parse(await readJson(req, 2_000));
  // a valid invitation cookie or a correct code; a correct code is remembered so it is never typed twice
  if (!(await demoAccessAllowed(code))) throw new ApiError(401, "INVALID_DEMO_CODE", "デモアクセスコードが正しくありません。");
  if (code) await grantDemoAccess();
  const demo = DEMO_USERS.find((u) => u.key === persona)!;
  const sql = workerSql();
  const [user] = await sql`select id from users where email = ${demo.email} and is_demo`;
  if (!user) throw new ApiError(503, "DEMO_NOT_SEEDED", "デモデータが初期化されていません。");
  const [m] = await sql`select tenant_id from tenant_memberships where user_id = ${user.id} order by created_at limit 1`;
  await destroySession();
  await createSession(user.id, m?.tenant_id ?? null);
  await sql`insert into audit_logs (tenant_id, actor_id, action, metadata) values (${m?.tenant_id ?? null}, ${user.id}, 'auth.switch', ${sql.json({ demo_persona: persona })})`;
  return ok({ ok: true, redirect: m ? "/app" : "/app/operations" });
});
