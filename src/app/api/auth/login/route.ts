import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { workerSql } from "@/lib/db";
import { rateLimit } from "@/lib/security/ratelimit";
import { ApiError, clientKey, handler, ok, readJson } from "@/lib/server/api";

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export const POST = handler(async (req: Request) => {
  const ip = await clientKey();
  rateLimit(`login:${ip}`, 10, 60_000);
  const { email, password } = Body.parse(await readJson(req, 4_000));
  const sql = workerSql();
  const [user] = await sql`select id, password_hash from users where email = ${email.toLowerCase()}`;
  // constant-ish work even when the user does not exist
  const valid = await verifyPassword(password, user?.password_hash ?? "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!user || !valid) throw new ApiError(401, "INVALID_CREDENTIALS", "メールアドレスまたはパスワードが正しくありません。");
  const [m] = await sql`select tenant_id from tenant_memberships where user_id = ${user.id} order by created_at limit 1`;
  await createSession(user.id, m?.tenant_id ?? null);
  await sql`insert into audit_logs (tenant_id, actor_id, action) values (${m?.tenant_id ?? null}, ${user.id}, 'auth.login')`;
  return ok({ ok: true, redirect: m ? "/app" : "/app/operations" });
});
