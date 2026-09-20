import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { createApp } from "./app.js";
import { createInMemoryAuthRepo } from "./modules/auth/repo.inmemory.js";

function testSecurity() {
  return {
    issueSession: async (userId: string, sessionVersion: number) => ({
      value: `${userId}:${sessionVersion}`,
      sid: `sid-${userId}`,
      recentAuthAt: Math.floor(Date.now() / 1000),
    }),
    readSession: async (value: string | undefined) => {
      if (!value) return undefined;
      const [userId, version] = value.split(":");
      if (!userId || !version) return undefined;
      return { userId, sid: `sid-${userId}`, sessionVersion: Number(version), recentAuthAt: Math.floor(Date.now() / 1000) };
    },
    setSessionCookie: (res: { cookie: Function }, value: string) => res.cookie("tracker_session", value),
    clearSessionCookie: (res: { clearCookie: Function }) => res.clearCookie("tracker_session"),
    issueCsrf: (res: { cookie: Function }) => {
      const token = "csrf-test-token";
      res.cookie("tracker_csrf", token);
      return token;
    },
    verifyCsrf: (header: string | undefined, cookie: string | undefined) => header === "csrf-test-token" && cookie === header,
    seal: (value: unknown) => `sealed:${JSON.stringify(value)}`,
    setGoogleOAuthCookie: (res: { cookie: Function }, transaction: unknown) => res.cookie("tracker_google_oauth", JSON.stringify(transaction)),
    readGoogleOAuthCookie: (value: string | undefined) => (value ? JSON.parse(value) : undefined),
    clearGoogleOAuthCookie: (res: { clearCookie: Function }) => res.clearCookie("tracker_google_oauth"),
  };
}

async function start(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function updateCookies(jar: string, response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  const next = new Map(jar.split("; ").filter(Boolean).map((item) => item.split("=", 2) as [string, string]));
  for (const value of values) {
    const [pair] = value.split(";", 1);
    const [name, cookie] = pair.split("=", 2);
    if (name && cookie) next.set(name, cookie);
  }
  return [...next].map(([name, value]) => `${name}=${value}`).join("; ");
}

test("auth HTTP flow enforces CSRF, creates a session, and invalidates logout-all", async (t) => {
  const store = createInMemoryAuthRepo();
  const app = createApp({ repo: store.repo, security: testSecurity(), allowedOrigins: [], appOrigin: "http://app.example" });
  const server = createServer(app);
  const base = await start(server);
  let cookies = "";
  t.after(() => server.close());

  let response = await fetch(`${base}/api/v1/auth/csrf`);
  assert.equal(response.status, 200);
  const csrf = (await response.json() as { data: { token: string } }).data.token;
  cookies = updateCookies(cookies, response);

  response = await fetch(`${base}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf, cookie: cookies },
    body: JSON.stringify({ name: "Ada", email: "ada@example.com", password: "x".repeat(12) }),
  });
  assert.equal(response.status, 202);

  response = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf, cookie: cookies },
    body: JSON.stringify({ email: "ada@example.com", password: "x".repeat(12) }),
  });
  assert.equal(response.status, 200);
  cookies = updateCookies(cookies, response);

  response = await fetch(`${base}/api/v1/me`, { headers: { cookie: cookies } });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { data: { email: string } }).data.email, "ada@example.com");

  response = await fetch(`${base}/api/v1/auth/logout-all`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf, cookie: cookies },
    body: "{}",
  });
  assert.equal(response.status, 200);

  response = await fetch(`${base}/api/v1/me`, { headers: { cookie: cookies } });
  assert.equal(response.status, 401);
});

test("Google OAuth start redirects and callback creates a session", async (t) => {
  const store = createInMemoryAuthRepo();
  const security = testSecurity();
  const google = {
    callbackUri: "http://api.example/api/v1/auth/google/callback",
    start: async () => ({ authorizationUrl: "https://accounts.example/authorize?state=state-1", state: "state-1", nonce: "nonce-1", codeVerifier: "verifier-1" }),
    complete: async (input: { callbackUrl: string; state: string; nonce: string; codeVerifier: string }) => {
      assert.equal(input.callbackUrl, "http://api.example/api/v1/auth/google/callback?code=code-1&state=state-1");
      assert.equal(input.state, "state-1");
      return { subject: "google-sub-1", email: "google@example.com", emailVerified: true, name: "Google User" };
    },
  };
  const app = createApp({ repo: store.repo, security, allowedOrigins: [], appOrigin: "http://app.example", google });
  const server = createServer(app);
  const base = await start(server);
  t.after(() => server.close());

  let response = await fetch(`${base}/api/v1/auth/google/start`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://accounts.example/authorize?state=state-1");
  let cookies = updateCookies("", response);

  response = await fetch(`${base}/api/v1/auth/google/callback?code=code-1&state=state-1`, { headers: { cookie: cookies }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://app.example/dashboard");
  cookies = updateCookies(cookies, response);

  response = await fetch(`${base}/api/v1/me`, { headers: { cookie: cookies } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: { providers: string[]; has_password: boolean } }).data, {
    id: (await store.repo.findUserByEmail("google@example.com"))!.id,
    email: "google@example.com",
    name: "Google User",
    email_verified_at: (await store.repo.findUserByEmail("google@example.com"))!.emailVerifiedAt!.toISOString(),
    version: 1,
    timezone: "Asia/Jakarta",
    has_password: false,
    providers: ["google"],
  });
});

test("Google link flow attaches the identity to the signed-in user and refuses mismatched emails", async (t) => {
  const store = createInMemoryAuthRepo();
  const security = testSecurity();
  let nextIdentity = { subject: "google-sub-link", email: "ada@example.com", emailVerified: true, name: "Ada" };
  const google = {
    callbackUri: "http://api.example/api/v1/auth/google/callback",
    start: async () => ({ authorizationUrl: "https://accounts.example/authorize?state=link-state", state: "link-state", nonce: "link-nonce", codeVerifier: "link-verifier" }),
    complete: async () => nextIdentity,
  };
  const app = createApp({ repo: store.repo, security, allowedOrigins: [], appOrigin: "http://app.example", google });
  const server = createServer(app);
  const base = await start(server);
  t.after(() => server.close());

  let response = await fetch(`${base}/api/v1/auth/csrf`);
  const csrf = (await response.json() as { data: { token: string } }).data.token;
  let cookies = updateCookies("", response);
  const mutations = { "content-type": "application/json", "x-csrf-token": csrf };

  response = await fetch(`${base}/api/v1/auth/register`, {
    method: "POST",
    headers: { ...mutations, cookie: cookies },
    body: JSON.stringify({ name: "Ada", email: "ada@example.com", password: "x".repeat(12) }),
  });
  assert.equal(response.status, 202);
  await store.repo.verifyUserEmail((await store.repo.findUserByEmail("ada@example.com"))!.id);

  response = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { ...mutations, cookie: cookies },
    body: JSON.stringify({ email: "ada@example.com", password: "x".repeat(12) }),
  });
  assert.equal(response.status, 200);
  cookies = updateCookies(cookies, response);

  response = await fetch(`${base}/api/v1/auth/link/google`, { method: "POST", headers: { ...mutations, cookie: cookies }, body: "{}" });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { data: { redirect_url: string } }).data.redirect_url, "https://accounts.example/authorize?state=link-state");
  cookies = updateCookies(cookies, response);

  response = await fetch(`${base}/api/v1/auth/google/callback?code=code-link&state=link-state`, { headers: { cookie: cookies }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://app.example/dashboard");

  const user = (await store.repo.findUserByEmail("ada@example.com"))!;
  assert.deepEqual(await store.repo.listProviders(user.id), ["google"]);

  // A second use of the same transaction must fail and must never become a new login/registration.
  response = await fetch(`${base}/api/v1/auth/google/callback?code=code-link&state=link-state`, { headers: { cookie: cookies }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://app.example/login?error=oauth_failed");
  assert.equal((await store.repo.findUserByEmail("google@example.com")), undefined);
  assert.equal(store.users.size, 1);

  // Email mismatch is refused and still does not create an account.
  nextIdentity = { subject: "google-sub-other", email: "other@example.com", emailVerified: true, name: "Other" };
  response = await fetch(`${base}/api/v1/auth/link/google`, { method: "POST", headers: { ...mutations, cookie: cookies }, body: "{}" });
  assert.equal(response.status, 200);
  cookies = updateCookies(cookies, response);
  response = await fetch(`${base}/api/v1/auth/google/callback?code=code-other&state=link-state`, { headers: { cookie: cookies }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://app.example/login?error=oauth_failed");
  assert.equal(await store.repo.findUserByEmail("other@example.com"), undefined);
  assert.equal(store.users.size, 1);
});

test("Google link callback rejects a session revoked after link start", async (t) => {
  const store = createInMemoryAuthRepo();
  const google = {
    callbackUri: "http://api.example/api/v1/auth/google/callback",
    start: async () => ({ authorizationUrl: "https://accounts.example/authorize?state=revoked-state", state: "revoked-state", nonce: "nonce", codeVerifier: "verifier" }),
    complete: async () => ({ subject: "google-revoked", email: "ada@example.com", emailVerified: true, name: "Ada" }),
  };
  const server = createServer(createApp({ repo: store.repo, security: testSecurity(), allowedOrigins: [], google }));
  const base = await start(server);
  t.after(() => server.close());

  let response = await fetch(`${base}/api/v1/auth/csrf`);
  const csrf = (await response.json() as { data: { token: string } }).data.token;
  let cookies = updateCookies("", response);
  const headers = { "content-type": "application/json", "x-csrf-token": csrf, cookie: cookies };
  await fetch(`${base}/api/v1/auth/register`, { method: "POST", headers, body: JSON.stringify({ name: "Ada", email: "ada@example.com", password: "x".repeat(12) }) });
  await store.repo.verifyUserEmail((await store.repo.findUserByEmail("ada@example.com"))!.id);
  response = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers, body: JSON.stringify({ email: "ada@example.com", password: "x".repeat(12) }) });
  cookies = updateCookies(cookies, response);

  response = await fetch(`${base}/api/v1/auth/link/google`, { method: "POST", headers: { ...headers, cookie: cookies }, body: "{}" });
  assert.equal(response.status, 200);
  cookies = updateCookies(cookies, response);

  // Revoke the session (as logout-all does) but keep replaying the old cookie.
  await store.repo.bumpSessionVersion((await store.repo.findUserByEmail("ada@example.com"))!.id);

  response = await fetch(`${base}/api/v1/auth/google/callback?code=code&state=revoked-state`, { headers: { cookie: cookies }, redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/login?error=link_required");
  const user = (await store.repo.findUserByEmail("ada@example.com"))!;
  assert.deepEqual(await store.repo.listProviders(user.id), []);
});

test("login rate limit returns 429 with Retry-After after the limit is exceeded", async (t) => {
  const store = createInMemoryAuthRepo();
  const calls = { n: 0 };
  const app = createApp({
    repo: store.repo,
    security: testSecurity(),
    allowedOrigins: [],
    rateLimiter: {
      async check() {
        calls.n += 1;
        return calls.n <= 2 ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: 30 };
      },
    },
  });
  const server = createServer(app);
  const base = await start(server);
  t.after(() => server.close());

  let response = await fetch(`${base}/api/v1/auth/csrf`);
  let csrf = (await response.json() as { data: { token: string } }).data.token;
  let cookies = updateCookies("", response);

  const login = async () =>
    fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf, cookie: cookies },
      body: JSON.stringify({ email: "missing@example.com", password: "x".repeat(12) }),
    });

  response = await login();
  assert.equal(response.status, 401);

  response = await login();
  assert.equal(response.status, 401);

  response = await login();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "RATE_LIMITED");
});
