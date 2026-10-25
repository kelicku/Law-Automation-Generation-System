import { describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/security/ratelimit";

describe("rate limiter", () => {
  it("rejects requests over the limit within the window", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 60_000);
    expect(() => rateLimit("k", 3, 60_000)).toThrow(/再試行/);
    expect(() => rateLimit("other", 3, 60_000)).not.toThrow();
  });
});
