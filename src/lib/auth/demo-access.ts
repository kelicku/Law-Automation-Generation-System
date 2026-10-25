import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { workerSql } from "@/lib/db";
import { sha256 } from "@/lib/domain/hash";
import { env } from "@/lib/env";

/**
 * DEMO ONLY — click-only access.
 *  - aiip_demo_grant : set by an invitation link (/invite/<code>) or a correctly typed code, so the
 *                      access code never has to be typed again. Holds an HMAC of the code, not the code.
 *  - aiip_resume     : random token whose SHA-256 is stored in sandbox_accounts ("前回の続きから再開").
 * Both are HttpOnly; neither grants anything when DEMO_MODE is off.
 */
export const DEMO_GRANT_COOKIE = "aiip_demo_grant";
export const RESUME_COOKIE = "aiip_resume";
const DAYS_30 = 30 * 86_400;

function grantFor(code: string): string {
  return createHmac("sha256", env.sessionSecret).update(`demo-grant:${code}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function codeMatches(code: string | undefined | null): boolean {
  const expected = env.demoAccessCode;
  return !!expected && !!code && safeEqual(code.trim(), expected);
}

async function cookieOptions(maxAge: number) {
  const h = await headers();
  return { httpOnly: true, sameSite: "lax" as const, secure: h.get("x-forwarded-proto") === "https", path: "/", maxAge };
}

export async function hasGrantCookie(): Promise<boolean> {
  const expected = env.demoAccessCode;
  if (!expected) return true;
  const v = (await cookies()).get(DEMO_GRANT_COOKIE)?.value;
  return !!v && safeEqual(v, grantFor(expected));
}

/** True when demo entry is allowed: no code configured, a valid grant cookie, or a correct code. */
export async function demoAccessAllowed(code?: string | null): Promise<boolean> {
  if (!env.demoMode) return false;
  if (!env.demoAccessCode) return true;
  if (codeMatches(code)) return true;
  return hasGrantCookie();
}

export async function grantDemoAccess(): Promise<void> {
  const expected = env.demoAccessCode;
  if (!expected) return;
  (await cookies()).set(DEMO_GRANT_COOKIE, grantFor(expected), await cookieOptions(DAYS_30));
}

export function newResumeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

export async function setResumeCookie(token: string): Promise<void> {
  (await cookies()).set(RESUME_COOKIE, token, await cookieOptions(DAYS_30));
}

export async function clearResumeCookie(): Promise<void> {
  (await cookies()).delete(RESUME_COOKIE);
}

export interface ResumeTarget {
  userId: string;
  tenantId: string;
  firmName: string;
  createdAt: Date;
}

/** Looks up the visitor's own demo firm from the resume cookie (null when missing / expired / reset). */
export async function findResumeTarget(): Promise<ResumeTarget | null> {
  if (!env.demoMode) return null;
  const token = (await cookies()).get(RESUME_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [row] = await workerSql()`
    select s.user_id, s.tenant_id, s.created_at, t.short_name
    from sandbox_accounts s join tenants t on t.id = s.tenant_id join users u on u.id = s.user_id
    where s.resume_hash = ${sha256(token)} and s.expires_at > now()`;
  return row ? { userId: row.user_id, tenantId: row.tenant_id, firmName: row.short_name, createdAt: row.created_at } : null;
}
