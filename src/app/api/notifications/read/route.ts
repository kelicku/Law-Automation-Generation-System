import { z } from "zod";
import { dbCtx, requireApiViewer } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { handler, ok, readJson } from "@/lib/server/api";

const Body = z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() });

export const POST = handler(async (req: Request) => {
  const viewer = await requireApiViewer();
  const body = Body.parse(await readJson(req));
  await withUser(dbCtx(viewer), async (tx) => {
    if (body.all) await tx`update notifications set read_at = now() where read_at is null`;
    else if (body.ids?.length) await tx`update notifications set read_at = now() where id = any(${body.ids}) and read_at is null`;
  });
  return ok({ ok: true });
});
