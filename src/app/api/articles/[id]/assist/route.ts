import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { handler, ok, readJson } from "@/lib/server/api";
import { assist } from "@/lib/server/articles";
import { ApiError } from "@/lib/server/errors";
import { idempotencyKey, uuidParam, type IdParams } from "@/lib/server/route-utils";

const Body = z.object({
  task: z.enum(["seo_title", "meta_description", "sns_post", "paragraph_regenerate"]),
  blockId: z.string().max(40).optional(),
  instruction: z.string().max(200).optional(),
});

export const POST = handler(async (req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  if (viewer.role === "viewer") throw new ApiError(403, "FORBIDDEN", "権限がありません。");
  rateLimit(`ai:${viewer.userId}`, 20, 60_000);
  const body = Body.parse(await readJson(req));
  const r = await assist(viewer, await uuidParam(params), body.task, idempotencyKey(req), body);
  return ok({ output: r.output, provider: r.provider, model: r.model, logId: r.logId, durationMs: r.durationMs });
});
