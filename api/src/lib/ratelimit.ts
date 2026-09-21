import { createHmac } from "node:crypto";

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

type PostgresRateLimitClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  rateLimitBucket: {
    deleteMany(args: { where: { expires_at: { lt: Date } } }): Promise<{ count: number }>;
  };
};

export function hashRateLimitKey(key: string, secret: string) {
  return createHmac("sha256", secret).update(key).digest("hex");
}

export function createPostgresRateLimiter(
  db: PostgresRateLimitClient,
  keySecret: string,
  options: { now?: () => Date; cleanupEvery?: number } = {},
): RateLimiter {
  const now = options.now ?? (() => new Date());
  const cleanupEvery = options.cleanupEvery ?? 100;
  let checks = 0;

  return {
    async check(key, limit, windowMs) {
      if (!Number.isInteger(limit) || limit <= 0) throw new Error("Rate limit must be a positive integer.");
      if (!Number.isInteger(windowMs) || windowMs <= 0) throw new Error("Rate limit window must be a positive integer.");

      const current = now();
      const currentMs = current.getTime();
      const windowStart = new Date(Math.floor(currentMs / windowMs) * windowMs);
      const expiresAt = new Date(windowStart.getTime() + windowMs);
      const bucketHash = hashRateLimitKey(key, keySecret);

      const rows = await db.$queryRawUnsafe<Array<{ count: number }>>(
        `INSERT INTO "rate_limit_bucket" ("bucket_hash", "window_start", "count", "expires_at")
         VALUES ($1, $2, 1, $3)
         ON CONFLICT ("bucket_hash") DO UPDATE SET
           "window_start" = CASE
             WHEN "rate_limit_bucket"."window_start" = EXCLUDED."window_start" THEN "rate_limit_bucket"."window_start"
             ELSE EXCLUDED."window_start"
           END,
           "count" = CASE
             WHEN "rate_limit_bucket"."window_start" = EXCLUDED."window_start" THEN "rate_limit_bucket"."count" + 1
             ELSE 1
           END,
           "expires_at" = EXCLUDED."expires_at"
         RETURNING "count"`,
        bucketHash,
        windowStart,
        expiresAt,
      );

      checks += 1;
      if (cleanupEvery > 0 && checks % cleanupEvery === 0) {
        await db.rateLimitBucket.deleteMany({ where: { expires_at: { lt: current } } });
      }

      const count = Number(rows[0]?.count ?? 0);
      return {
        allowed: count > 0 && count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - currentMs) / 1000)),
      };
    },
  };
}
