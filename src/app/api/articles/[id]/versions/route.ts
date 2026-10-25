import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { handler, ok, readJson } from "@/lib/server/api";
import { saveVersion } from "@/lib/server/articles";
import { uuidParam, type IdParams } from "@/lib/server/route-utils";

const Body = z.object({ note: z.string().max(200).optional().default("") });

export const POST = handler(async (req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  const { note } = Body.parse(await readJson(req));
  return ok(await saveVersion(viewer, await uuidParam(params), note));
});
