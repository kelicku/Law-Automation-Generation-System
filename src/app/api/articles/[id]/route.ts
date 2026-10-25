import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { handler, ok, readJson } from "@/lib/server/api";
import { autosave, getArticleBundle } from "@/lib/server/articles";
import { uuidParam, type IdParams } from "@/lib/server/route-utils";

const Body = z.object({ content: z.unknown(), baseHash: z.string().length(64) });

export const GET = handler(async (_req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  const b = await getArticleBundle(viewer, await uuidParam(params));
  return ok({ article: b.article, precheck: b.precheck });
});

/** Autosave of the working copy with optimistic concurrency (baseHash). */
export const PATCH = handler(async (req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  rateLimit(`autosave:${viewer.userId}`, 120, 60_000);
  const id = await uuidParam(params);
  const body = Body.parse(await readJson(req, 400_000));
  const saved = await autosave(viewer, id, body.content, body.baseHash);
  const b = await getArticleBundle(viewer, id);
  return ok({ ...saved, precheck: b.precheck });
});
