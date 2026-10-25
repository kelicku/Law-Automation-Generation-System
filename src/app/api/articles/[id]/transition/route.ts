import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { handler, ok, readJson } from "@/lib/server/api";
import { transition } from "@/lib/server/articles";
import { uuidParam, type IdParams } from "@/lib/server/route-utils";

const Body = z.object({
  action: z.enum(["submit", "approve", "request_revision", "publish", "suspend", "republish", "reopen", "archive", "restore"]),
  comment: z.string().max(500).optional().default(""),
});

/** Workflow transitions. Role, state and content-hash preconditions are all verified server-side. */
export const POST = handler(async (req: Request, { params }: IdParams) => {
  const viewer = await requireApiViewer({ tenant: true });
  rateLimit(`transition:${viewer.userId}`, 30, 60_000);
  const { action, comment } = Body.parse(await readJson(req));
  return ok(await transition(viewer, await uuidParam(params), action, comment));
});
