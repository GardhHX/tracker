import assert from "node:assert/strict";
import test from "node:test";
import { googleStartUrl } from "./api.js";

test("googleStartUrl targets the custom Express OAuth start endpoint", () => {
  assert.equal(
    googleStartUrl("http://127.0.0.1:4000"),
    "http://127.0.0.1:4000/api/v1/auth/google/start",
  );
});
