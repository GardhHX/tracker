import assert from "node:assert/strict";
import test from "node:test";
import { meDto } from "./dto.js";
import type { AuthUser } from "../modules/auth/repo.js";

const user: AuthUser = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada",
  emailVerifiedAt: null,
  passwordHash: "hash",
  timezone: "Asia/Jakarta",
  sessionVersion: 1,
  version: 1,
  providers: ["google"],
};

test("meDto hides verified-only fields for an unverified user", () => {
  const dto = meDto(user);
  assert.deepEqual(dto, {
    id: "user-1",
    email: "ada@example.com",
    name: "Ada",
    email_verified_at: null,
    version: 1,
  });
});

test("meDto includes profile capabilities after email verification", () => {
  const dto = meDto({ ...user, emailVerifiedAt: new Date("2026-09-20T00:00:00.000Z") });
  assert.deepEqual(dto, {
    id: "user-1",
    email: "ada@example.com",
    name: "Ada",
    email_verified_at: "2026-09-20T00:00:00.000Z",
    version: 1,
    timezone: "Asia/Jakarta",
    has_password: true,
    providers: ["google"],
  });
});
