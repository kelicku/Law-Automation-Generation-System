import { requireApiViewer } from "@/lib/auth/session";
import { runCollection } from "@/lib/collector/pipeline";
import type { CollectEvent } from "@/lib/collector/events";
import { withUser } from "@/lib/db";
import { backgroundJobs, createJob, triggerJob } from "@/lib/jobs/jobs";
import { rateLimit } from "@/lib/security/ratelimit";
import { handler, ok } from "@/lib/server/api";
import { audit } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/errors";
import { siteOrigin } from "@/lib/server/origin";

export const dynamic = "force-dynamic";

/** Streams collection progress as NDJSON so the Radar can visualise each pipeline step. */
export const POST = handler(async () => {
  const viewer = await requireApiViewer({ tenant: true });
  if (viewer.role === "viewer") throw new ApiError(403, "FORBIDDEN", "情報収集を実行する権限がありません。");
  rateLimit(`collect:${viewer.tenant!.id}`, 6, 60_000);
  await withUser({ userId: viewer.userId, tenantId: viewer.tenant!.id }, (tx) =>
    audit(tx, { tenantId: viewer.tenant!.id, actorId: viewer.userId, action: "collect.run" }));

  if (backgroundJobs()) {
    // serverless: run the pipeline in a background function; the browser polls /api/jobs/:id
    const jobId = await createJob("collect", viewer, {});
    await triggerJob(jobId, await siteOrigin());
    return ok({ jobId }, { status: 202 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: CollectEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await runCollection(viewer, emit);
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        emit({ type: "error", code: err?.code ?? "COLLECTION_FAILED", message: err?.message ?? "情報収集を開始できませんでした。" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});
