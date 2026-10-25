import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { handler, ok, readJson } from "@/lib/server/api";
import { restoreVersion } from "@/lib/server/articles";
import { uuidParam, type IdParams } from "@/lib/server/route-utils";

const Body = z.object({ versionId: z.string().uuid() });

export const POST = handler(async (req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  const { versionId } = Body.parse(await readJson(req));
  return ok(await restoreVersion(viewer, await uuidParam(params), versionId));
});
