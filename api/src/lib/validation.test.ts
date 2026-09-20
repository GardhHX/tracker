import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEmail, parseCorsOrigins, validatePassword } from "./validation.js";

test("normalizeEmail trims and lowercases an email", () => {
  assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
});

test("validatePassword enforces M0 password boundaries", () => {
  assert.deepEqual(validatePassword("short"), { valid: false, message: "Password must be 12 to 128 characters." });
  assert.deepEqual(validatePassword("x".repeat(129)), { valid: false, message: "Password must be 12 to 128 characters." });
  assert.deepEqual(validatePassword("x".repeat(12)), { valid: true });
});

test("parseCorsOrigins accepts a comma-separated allowlist", () => {
  assert.deepEqual(parseCorsOrigins("http://localhost:5173, http://127.0.0.1:5173 ,"), [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
});
