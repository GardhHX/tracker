export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

export function createInMemoryRateLimiter(now = () => Date.now()): RateLimiter {
  const buckets = new Map<string, { start: number; count: number }>();
  return {
    async check(key, limit, windowMs) {
      const current = now();
      const start = Math.floor(current / windowMs) * windowMs;
      const bucket = buckets.get(key);
      const count = bucket?.start === start ? bucket.count + 1 : 1;
      buckets.set(key, { start, count });
      return { allowed: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - current) / 1000)) };
    },
  };
}
// skipped: durable/multi-instance rate limiting (RateLimitBucket table), email/business-endpoint limits.
// add when a real Postgres connection is available to write + verify an atomic UPSERT against it.
