import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF defence for route handlers: state-changing API requests must carry an Origin header
 * matching the host that served the app (Server Actions perform the same check natively).
 * Combined with SameSite=Lax session cookies.
 */
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && UNSAFE.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let ok = false;
    try {
      ok = !!origin && !!host && new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) {
      return NextResponse.json({ error: { code: "CSRF_REJECTED", message: "不正なリクエスト元です。" } }, { status: 403 });
    }
  }
  if (pathname.startsWith("/app") && !req.cookies.get("aiip_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/app/:path*"] };
