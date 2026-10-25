import { NextResponse } from "next/server";
import { codeMatches, grantDemoAccess } from "@/lib/auth/demo-access";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/security/ratelimit";
import { clientKey } from "@/lib/server/api";
import { siteOrigin } from "@/lib/server/origin";

/**
 * DEMO ONLY — invitation link (/invite/<access-code>). Opening it remembers the access code in an
 * HttpOnly cookie, so the visitor can enter the demo with button clicks only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const origin = await siteOrigin();
  if (!env.demoMode) return NextResponse.redirect(`${origin}/login`);
  try {
    rateLimit(`invite:${await clientKey()}`, 20, 60_000);
  } catch {
    return NextResponse.redirect(`${origin}/login?invite=limited`);
  }
  const { code } = await params;
  if (!env.demoAccessCode || codeMatches(decodeURIComponent(code))) {
    await grantDemoAccess();
    return NextResponse.redirect(`${origin}/login?invite=ok`);
  }
  return NextResponse.redirect(`${origin}/login?invite=invalid`);
}
