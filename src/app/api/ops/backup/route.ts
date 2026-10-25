import { requireApiViewer } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { handler, ok } from "@/lib/server/api";
import { runBackup } from "@/lib/server/ops";

export const POST = handler(async () => {
  const viewer = await requireApiViewer({ operator: true });
  rateLimit(`backup:${viewer.userId}`, 3, 60_000);
  const r = await runBackup(viewer);
  return ok(r, { status: r.ok ? 200 : 500 });
});
