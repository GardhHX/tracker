import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryRateLimiter } from "./ratelimit.js";

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
