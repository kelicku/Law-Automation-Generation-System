import { ApiError } from "@/lib/server/errors";

/**
 * In-memory sliding-window rate limiter (single-instance demo).
 * Production: replace the store with Redis / Upstash so limits hold across instances.
 */
const buckets = new Map<string, number[]>();

/** RATE_LIMIT_SCALE (default 1) multiplies every limit — used only by the E2E test server. */
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1) || 1);

export function rateLimit(key: string, baseLimit: number, windowMs: number): void {
  const limit = baseLimit * SCALE;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retry = Math.ceil((windowMs - (now - hits[0])) / 1000);
    throw new ApiError(429, "RATE_LIMITED", `操作が集中しています。${retry}秒後に再試行してください。`, { retryAfter: retry });
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
}

export function resetRateLimits() {
  buckets.clear();
}
