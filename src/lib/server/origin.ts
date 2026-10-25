import "server-only";
import { headers } from "next/headers";

/** Public origin of the current request (works behind the Cloudflare tunnel). */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0]}://${host.split(",")[0]}`;
}
