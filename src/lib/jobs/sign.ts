import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC that authorises a background-function invocation for one job (the function URL is public). */
export function jobSignature(jobId: string, secret = process.env.SESSION_SECRET ?? ""): string {
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(`ai-job:${jobId}`).digest("hex");
}

export function verifyJobSignature(jobId: string, sig: string): boolean {
  const expected = Buffer.from(jobSignature(jobId));
  const given = Buffer.from(sig ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
