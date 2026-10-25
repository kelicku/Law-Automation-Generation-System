import { requireApiViewer } from "@/lib/auth/session";
import { getJob } from "@/lib/jobs/jobs";
import { handler, ok } from "@/lib/server/api";
import { uuidParam, type IdParams } from "@/lib/server/route-utils";

/** Progress of a background AI job. Only the user who started it can read it. */
export const GET = handler(async (req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer();
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  return ok(await getJob(await uuidParam(params), viewer.userId, after));
});
