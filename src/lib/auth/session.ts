import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { workerSql } from "@/lib/db";
import { sha256 } from "@/lib/domain/hash";
import type { MemberRole } from "@/lib/domain/types";
import { ApiError } from "@/lib/server/errors";

export const SESSION_COOKIE = "aiip_session";
const SESSION_HOURS = 8;

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  logoMark: string;
  brandPrimary: string;
  brandAccent: string;
  role: MemberRole;
}

export interface Viewer {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  platformRole: "none" | "operator";
  isDemo: boolean;
  tenant: TenantSummary | null;
  role: MemberRole | null;
  memberships: TenantSummary[];
}

async function isHttps(): Promise<boolean> {
  const h = await headers();
  return h.get("x-forwarded-proto") === "https";
}

export async function createSession(userId: string, tenantId: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expires = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await workerSql()`
    insert into sessions (id, user_id, active_tenant_id, expires_at, user_agent)
    values (${sha256(token)}, ${userId}, ${tenantId}, ${expires}, ${(h.get("user-agent") ?? "").slice(0, 200)})`;
  await workerSql()`update users set last_login_at = now() where id = ${userId}`;
  await workerSql()`delete from sessions where expires_at < now()`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await workerSql()`delete from sessions where id = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

/** Resolves the viewer from the session cookie. Membership is re-verified on every request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const sid = sha256(token);
  const sql = workerSql();
  const [row] = await sql`
    select s.id as session_id, s.active_tenant_id, u.id as user_id, u.email, u.display_name, u.platform_role, u.is_demo
    from sessions s join users u on u.id = s.user_id
    where s.id = ${sid} and s.expires_at > now()`;
  if (!row) return null;
  const memberships = (await sql`
    select t.id, t.slug, t.short_name, t.name, t.logo_mark, t.brand_primary, t.brand_accent, m.role
    from tenant_memberships m join tenants t on t.id = m.tenant_id
    where m.user_id = ${row.user_id} order by t.created_at`).map((m) => ({
    id: m.id as string,
    slug: m.slug as string,
    name: m.name as string,
    shortName: m.short_name as string,
    logoMark: m.logo_mark as string,
    brandPrimary: m.brand_primary as string,
    brandAccent: m.brand_accent as string,
    role: m.role as MemberRole,
  }));
  const tenant = memberships.find((m) => m.id === row.active_tenant_id) ?? memberships[0] ?? null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    name: row.display_name,
    platformRole: row.platform_role,
    isDemo: row.is_demo,
    tenant,
    role: tenant?.role ?? null,
    memberships,
  };
});

/** For pages: redirects to /login when not signed in. */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  return v;
}

/** For pages that operate on tenant data. Operators without membership are sent to the operations center. */
export async function requireTenantViewer(): Promise<Viewer & { tenant: TenantSummary; role: MemberRole }> {
  const v = await requireViewer();
  if (!v.tenant || !v.role) redirect("/app/operations");
  return v as Viewer & { tenant: TenantSummary; role: MemberRole };
}

/** For route handlers. */
export async function requireApiViewer(opts: { tenant?: boolean; operator?: boolean } = {}): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new ApiError(401, "UNAUTHENTICATED", "ログインが必要です。");
  if (opts.tenant && (!v.tenant || !v.role)) throw new ApiError(403, "NO_TENANT", "事務所のメンバーとしてログインしてください。");
  if (opts.operator && v.platformRole !== "operator") throw new ApiError(403, "FORBIDDEN", "運営者のみ実行できます。");
  return v;
}

export { dbCtx } from "@/lib/db/context";
