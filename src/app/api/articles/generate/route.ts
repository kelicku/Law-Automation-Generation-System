import { z } from "zod";
import { requireApiViewer } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { handler, ok, readJson } from "@/lib/server/api";
import { generateArticle } from "@/lib/server/articles";
import { ApiError } from "@/lib/server/errors";
import { backgroundJobs, createJob, triggerJob } from "@/lib/jobs/jobs";
import { siteOrigin } from "@/lib/server/origin";
import { idempotencyKey } from "@/lib/server/route-utils";

const Body = z.object({ incidentId: z.string().uuid() });

export const POST = handler(async (req: Request) => {
  const viewer = await requireApiViewer({ tenant: true });
  if (viewer.role === "viewer") throw new ApiError(403, "FORBIDDEN", "記事を作成する権限がありません。");
  rateLimit(`ai:${viewer.userId}`, 20, 60_000);
  const { incidentId } = Body.parse(await readJson(req));
  const key = idempotencyKey(req);
  if (backgroundJobs()) {
    // serverless: AI generation can exceed the request timeout, so it runs as a background job
    const jobId = await createJob("article_generate", viewer, { incidentId, key });
    await triggerJob(jobId, await siteOrigin());
    return ok({ jobId }, { status: 202 });
  }
  const result = await generateArticle(viewer, incidentId, key);
  return ok(result);
});
