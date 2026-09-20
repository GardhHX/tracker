import assert from "node:assert/strict";
import test from "node:test";
import argon2 from "argon2";
import { createInMemoryAuthRepo } from "./repo.inmemory.js";
import { createAuthService } from "./service.js";

const issueSession = async () => ({ value: "test-session", sid: "test-sid", recentAuthAt: 0 });
const seal = (payload: unknown) => `sealed:${JSON.stringify(payload)}`;

test("register normalizes email and queues verification", async () => {
  const store = createInMemoryAuthRepo();
  const auth = createAuthService(store.repo, { issueSession, seal });

  const result = await auth.register({ name: "Ada", email: " Ada@Example.COM ", password: "x".repeat(12) });

  assert.deepEqual(result, { accepted: true });
  assert.equal(store.emails.length, 1);
  assert.equal(store.emails[0]?.recipient, "ada@example.com");
  assert.match(store.emails[0]?.payloadCiphertext ?? "", /^sealed:/);
  assert.equal((await store.repo.findUserByEmail("ada@example.com"))?.name, "Ada");
});

test("login returns a session for a valid password and rejects an invalid one", async () => {
  const store = createInMemoryAuthRepo();
  const user = await store.repo.createUserWithState({
    name: "Ada",
    email: "ada@example.com",
    passwordHash: await argon2.hash("x".repeat(12), { type: argon2.argon2id }),
  });
  const auth = createAuthService(store.repo, { issueSession, seal });

  const session = await auth.login({ email: user.email, password: "x".repeat(12) });
  assert.equal(session.user.id, user.id);
  assert.equal(typeof session.session.value, "string");
  await assert.rejects(() => auth.login({ email: user.email, password: "wrong-password" }), /Invalid email or password/);
});

test("logoutAll increments the server session version", async () => {
  const store = createInMemoryAuthRepo();
  const user = await store.repo.createUserWithState({ name: "Ada", email: "ada@example.com", passwordHash: null });
  const auth = createAuthService(store.repo, { issueSession, seal });

  await auth.logoutAll(user.id);

  assert.equal((await store.repo.findUserById(user.id))?.sessionVersion, 2);
});

test("updateProfile applies a matching version and rejects a stale one", async () => {
  const store = createInMemoryAuthRepo();
  const user = await store.repo.createUserWithState({ name: "Ada", email: "ada@example.com", passwordHash: null });
  await store.repo.verifyUserEmail(user.id);
  const auth = createAuthService(store.repo, { issueSession, seal });
  const originalVersion = user.version;

  const updated = await auth.updateProfile(user.id, { version: originalVersion, name: "Ada L.", timezone: "America/Los_Angeles" });
  assert.equal(updated.name, "Ada L.");
  assert.equal(updated.timezone, "America/Los_Angeles");
  assert.equal(updated.version, originalVersion + 1);

  await assert.rejects(
    () => auth.updateProfile(user.id, { version: originalVersion, name: "Stale" }),
    /VERSION_CONFLICT/,
  );
});

test("password setup issues a token for a verified Google-only user and invalidates sessions on confirm", async () => {
  const store = createInMemoryAuthRepo();
  const user = await store.repo.createUserWithState({ name: "Ada", email: "ada@example.com", passwordHash: null });
  await store.repo.verifyUserEmail(user.id);
  const auth = createAuthService(store.repo, { issueSession, seal });

  await auth.requestPasswordSetup(user.id);
  assert.equal(store.emails[0]?.template, "password-setup");
  const setupToken = [...store.tokens.values()].find((token) => token.purpose === "password_setup");
  assert.equal(setupToken?.purpose, "password_setup");
  assert.ok((setupToken?.expiresAt.getTime() ?? 0) > Date.now() + 23 * 60 * 60 * 1000);
  const payload = JSON.parse(store.emails[0]?.payloadCiphertext?.slice("sealed:".length) ?? "{}") as { token?: string };
  assert.equal(typeof payload.token, "string");

  await auth.confirmPasswordSetup(user.id, payload.token!, "x".repeat(12));
  const confirmed = await store.repo.findUserById(user.id);
  assert.equal(typeof confirmed?.passwordHash, "string");
  assert.equal(confirmed?.sessionVersion, 2);
});

test("Google login creates a verified Google-only account and reuses its identity", async () => {
  const store = createInMemoryAuthRepo();
  const auth = createAuthService(store.repo, { issueSession, seal });
  const identity = { subject: "google-subject-1", email: "Ada.Google@Example.com", emailVerified: true, name: "Ada Google" };

  const first = await auth.loginWithGoogle(identity);
  assert.equal(first.user.email, "ada.google@example.com");
  assert.ok(first.user.emailVerifiedAt);
  assert.equal(first.user.passwordHash, null);
  assert.deepEqual(first.user.providers, ["google"]);

  const again = await auth.loginWithGoogle(identity);
  assert.equal(again.user.id, first.user.id);
  assert.equal(store.users.size, 1);
});

test("Google login refuses to auto-link an email that already has a password account", async () => {
  const store = createInMemoryAuthRepo();
  const auth = createAuthService(store.repo, { issueSession, seal });
  await store.repo.createUserWithState({ name: "Ada", email: "ada@example.com", passwordHash: "hash" });

  await assert.rejects(
    () => auth.loginWithGoogle({ subject: "s1", email: "ada@example.com", emailVerified: true, name: "Ada" }),
    /LINK_REQUIRED/,
  );
  assert.equal(store.users.size, 1);
});

test("Google link intent is bound to the session, matches the account email, and is single use", async () => {
  const store = createInMemoryAuthRepo();
  const user = await store.repo.createUserWithState({ name: "Ada", email: "ada@example.com", passwordHash: "hash" });
  await store.repo.verifyUserEmail(user.id);
  const auth = createAuthService(store.repo, { issueSession, seal });

  const { intentToken } = await auth.createGoogleLinkIntent(user.id, "sid-1");
  const identity = { subject: "google-1", email: "ada@example.com", emailVerified: true, name: "Ada" };

  await assert.rejects(
    () => auth.completeGoogleLink({ userId: user.id, sid: "other-sid", intentToken, identity }),
    /invalid or expired/,
  );
  await assert.rejects(
    () => auth.completeGoogleLink({ userId: user.id, sid: "sid-1", intentToken, identity: { ...identity, email: "other@example.com" } }),
    /must match/,
  );

  await auth.completeGoogleLink({ userId: user.id, sid: "sid-1", intentToken, identity });
  assert.deepEqual(await store.repo.listProviders(user.id), ["google"]);
  assert.equal((await store.repo.findUserByProvider("google", "google-1"))?.id, user.id);

  await assert.rejects(
    () => auth.completeGoogleLink({ userId: user.id, sid: "sid-1", intentToken, identity }),
    /invalid or expired/,
  );
});

test("unlinking Google requires an active password and cannot drop the last login method", async () => {
  const store = createInMemoryAuthRepo();
  const googleOnly = await store.repo.createUserWithState({ name: "G", email: "g@example.com", passwordHash: null });
  await store.repo.createAuthAccount({ userId: googleOnly.id, provider: "google", providerAccountId: "g1" });
  const withPassword = await store.repo.createUserWithState({ name: "P", email: "p@example.com", passwordHash: "hash" });
  await store.repo.createAuthAccount({ userId: withPassword.id, provider: "google", providerAccountId: "p1" });
  const auth = createAuthService(store.repo, { issueSession, seal });

  await assert.rejects(() => auth.unlinkGoogle(googleOnly.id), /password/i);
  assert.deepEqual(await store.repo.listProviders(googleOnly.id), ["google"]);

  await auth.unlinkGoogle(withPassword.id);
  assert.deepEqual(await store.repo.listProviders(withPassword.id), []);
});
