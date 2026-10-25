import { requireApiViewer } from "@/lib/auth/session";
import { handler, ok } from "@/lib/server/api";
import { getArticleBundle } from "@/lib/server/articles";
import { uuidParam, type IdParams } from "@/lib/server/route-utils";

/** Runs the pre-publication check on the current working copy (same function used at submit / approve). */
export const POST = handler(async (_req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  const b = await getArticleBundle(viewer, await uuidParam(params));
  return ok({ precheck: b.precheck, checkedAt: new Date().toISOString() });
});
