/**
 * Netlify background function (up to 15 minutes). Bundled by scripts/build-jobs.mjs into
 * netlify/functions/ai-job-background.mjs. Invoked by the web app with a per-job HMAC signature.
 */
import { runJob } from "../src/lib/jobs/runner";
import { verifyJobSignature } from "../src/lib/jobs/sign";

export default async function aiJobBackground(req: Request): Promise<Response> {
  let body: { jobId?: string; sig?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!body.jobId || !/^[0-9a-f-]{36}$/.test(body.jobId) || !verifyJobSignature(body.jobId, body.sig ?? "")) {
    return new Response("forbidden", { status: 403 });
  }
  await runJob(body.jobId);
  return new Response(null, { status: 202 });
}

export const config = { background: true };
