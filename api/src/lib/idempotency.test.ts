import assert from "node:assert/strict";
import test from "node:test";
import {
  hashIdempotencyPayload,
  IdempotencyKeyError,
  validateIdempotencyKey,
} from "./idempotency.js";

test("idempotency payload hashing is stable across object key order", () => {
  assert.equal(
    hashIdempotencyPayload({ title: "Focus", nested: { b: 2, a: 1 } }),
    hashIdempotencyPayload({ nested: { a: 1, b: 2 }, title: "Focus" }),
  );
  assert.notEqual(
    hashIdempotencyPayload({ title: "Focus", duration: 25 }),
    hashIdempotencyPayload({ title: "Focus", duration: 50 }),
  );
});

test("idempotency keys enforce the API contract length", () => {
  assert.equal(validateIdempotencyKey("12345678"), "12345678");
  assert.throws(() => validateIdempotencyKey("short"), IdempotencyKeyError);
  assert.throws(() => validateIdempotencyKey("x".repeat(129)), IdempotencyKeyError);
});
