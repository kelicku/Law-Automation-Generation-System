import { destroySession } from "@/lib/auth/session";
import { handler, ok } from "@/lib/server/api";

export const POST = handler(async () => {
  await destroySession();
  return ok({ ok: true });
});
