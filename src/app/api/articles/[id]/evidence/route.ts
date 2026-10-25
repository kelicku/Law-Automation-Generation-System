import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { handler, ok, readJson } from "@/lib/server/api";
import { linkEvidence } from "@/lib/server/articles";
import { uuidParam, type IdParams } from "@/lib/server/route-utils";

const Body = z.object({ sentenceId: z.string().min(1).max(40), sourceId: z.string().uuid(), quote: z.string().min(4).max(400), baseHash: z.string().length(64) });

export const POST = handler(async (req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  const body = Body.parse(await readJson(req));
  return ok(await linkEvidence(viewer, await uuidParam(params), body));
});
