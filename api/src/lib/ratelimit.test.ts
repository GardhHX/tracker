import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryRateLimiter, createPostgresRateLimiter, hashRateLimitKey } from "./ratelimit.js";

test("rate limiter allows up to the limit then rejects with retry-after", async () => {
  const limiter = createInMemoryRateLimiter();
  for (let i = 0; i < 3; i++) {
    assert.equal((await limiter.check("login:1.2.3.4:a@b.c", 3, 60_000)).allowed, true);
  }
  const denied = await limiter.check("login:1.2.3.4:a@b.c", 3, 60_000);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1);
});

test("rate limiter keeps keys and windows separate", async () => {
  const limiter = createInMemoryRateLimiter();
  assert.equal((await limiter.check("a", 1, 60_000)).allowed, true);
  assert.equal((await limiter.check("a", 1, 60_000)).allowed, false);
  assert.equal((await limiter.check("b", 1, 60_000)).allowed, true);
});

test("PostgreSQL rate limiter atomically increments a hashed bucket", async () => {
  const rows = new Map<string, { windowStart: number; count: number }>();
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const db = {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]) {
      calls.push({ query, values });
      const [hash, start] = values as [string, Date, Date];
      const previous = rows.get(hash);
      const count = previous?.windowStart === start.getTime() ? previous.count + 1 : 1;
      rows.set(hash, { windowStart: start.getTime(), count });
      return [{ count }] as T;
    },
    rateLimitBucket: {
      async deleteMany() {
        return { count: 0 };
      },
    },
  };
  const limiter = createPostgresRateLimiter(db, "test-secret", {
    now: () => new Date("2026-09-21T00:00:30.000Z"),
    cleanupEvery: 0,
  });

  assert.equal((await limiter.check("login:127.0.0.1:user@example.com", 2, 60_000)).allowed, true);
  assert.equal((await limiter.check("login:127.0.0.1:user@example.com", 2, 60_000)).allowed, true);
  const denied = await limiter.check("login:127.0.0.1:user@example.com", 2, 60_000);

  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterSeconds, 30);
  assert.match(calls[0]!.query, /ON CONFLICT/);
  assert.equal(calls[0]!.values[0], hashRateLimitKey("login:127.0.0.1:user@example.com", "test-secret"));
  assert.equal(String(calls[0]!.values[0]).includes("user@example.com"), false);
});

test("PostgreSQL rate limiter resets the counter in a new fixed window", async () => {
  let current = new Date("2026-09-21T00:00:59.000Z");
  const rows = new Map<string, { windowStart: number; count: number }>();
  const db = {
    async $queryRawUnsafe<T>(_query: string, ...values: unknown[]) {
      const [hash, start] = values as [string, Date, Date];
      const previous = rows.get(hash);
      const count = previous?.windowStart === start.getTime() ? previous.count + 1 : 1;
      rows.set(hash, { windowStart: start.getTime(), count });
      return [{ count }] as T;
    },
    rateLimitBucket: {
      async deleteMany() {
        return { count: 0 };
      },
    },
  };
  const limiter = createPostgresRateLimiter(db, "test-secret", { now: () => current, cleanupEvery: 0 });

  await limiter.check("key", 1, 60_000);
  assert.equal((await limiter.check("key", 1, 60_000)).allowed, false);
  current = new Date("2026-09-21T00:01:00.000Z");
  assert.equal((await limiter.check("key", 1, 60_000)).allowed, true);
});
