import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { createApp } from "./app.js";
import { createInMemoryAuthRepo } from "./modules/auth/repo.inmemory.js";
import type { M1Service, ProjectDto, TaskDto } from "./modules/work/types.js";

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

test("allowed browser origins receive credentialed CORS headers", async (t) => {
  const app = createApp({
    repo: createInMemoryAuthRepo().repo,
    security: testSecurity(),
    allowedOrigins: ["http://127.0.0.1:3000"],
  });
  const server = createServer(app);
  const base = await start(server);
  t.after(() => server.close());

  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:3000",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-csrf-token",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /X-CSRF-Token/i);
});

test("unknown browser origins remain blocked", async (t) => {
  const app = createApp({
    repo: createInMemoryAuthRepo().repo,
    security: testSecurity(),
    allowedOrigins: ["http://127.0.0.1:3000"],
  });
  const server = createServer(app);
  const base = await start(server);
  t.after(() => server.close());

  const response = await fetch(`${base}/api/v1/auth/csrf`, {
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "CSRF_INVALID");
});

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

test("email-producing endpoints enforce the shared recipient limit", async (t) => {
  const store = createInMemoryAuthRepo();
  const checkedKeys: string[] = [];
  const app = createApp({
    repo: store.repo,
    security: testSecurity(),
    allowedOrigins: [],
    rateLimiter: {
      async check(key) {
        checkedKeys.push(key);
        return key.startsWith("email-send:email:")
          ? { allowed: false, retryAfterSeconds: 600 }
          : { allowed: true, retryAfterSeconds: 0 };
      },
    },
  });
  const server = createServer(app);
  const base = await start(server);
  t.after(() => server.close());

  let response = await fetch(`${base}/api/v1/auth/csrf`);
  const csrf = (await response.json() as { data: { token: string } }).data.token;
  const cookies = updateCookies("", response);
  response = await fetch(`${base}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf, cookie: cookies },
    body: JSON.stringify({ name: "Ada", email: "ADA@EXAMPLE.COM", password: "x".repeat(12) }),
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  assert.deepEqual(checkedKeys, ["email-send:email:ada@example.com"]);
  assert.equal(await store.repo.findUserByEmail("ada@example.com"), undefined);
});

test("M1 HTTP routes require verified sessions, validate input, and forward idempotency", async (t) => {
  const store = createInMemoryAuthRepo();
  const verified = await store.repo.createUserWithState({ name: "Verified", email: "verified@example.com", passwordHash: "hash", emailVerifiedAt: new Date() });
  const task: TaskDto = {
    id: "11111111-1111-4111-8111-111111111111", version: 1, created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z",
    project_id: null, title: "M1 task", description: null, status: "todo", priority: "medium", due_date: null, completed_at: null, archived_at: null,
    recurrence_rule_id: null, occurrence_date: null, rule_version: null,
  };
  const project: ProjectDto = {
    id: "22222222-2222-4222-8222-222222222222", version: 1, created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z",
    name: "M1 project", description: null, status: "active", completed_at: null, archived_at: null, done_count: 0, task_count: 0, progress_percent: 0,
  };
  const calls: Array<{ userId: string; key: string }> = [];
  const archiveCalls: Array<{ userId: string; id: string; version: number; archived: boolean }> = [];
  const projectStatusCalls: Array<{ userId: string; id: string; version: number; status: string }> = [];
  const unsupported = async () => { throw new Error("unexpected M1 service call"); };
  const m1: M1Service = {
    listProjects: unsupported, getProject: unsupported, createProject: unsupported, patchProject: unsupported,
    async setProjectStatus(userId, id, input) {
      projectStatusCalls.push({ userId, id, ...input });
      return { ...project, status: input.status, archived_at: input.status === "archived" ? "2026-09-21T01:00:00.000Z" : null };
    },
    async listTasks(_userId, query) { return { data: [task], meta: { page: query.page, page_size: query.pageSize, total: 1 } }; },
    getTask: unsupported,
    async createTask(userId, input, key) { calls.push({ userId, key }); return { data: { ...task, title: input.title }, status: 201, replayed: false }; },
    patchTask: unsupported,
    setTaskStatus: unsupported,
    async setTaskArchived(userId, id, version, archived) {
      archiveCalls.push({ userId, id, version, archived });
      return { ...task, archived_at: archived ? "2026-09-21T01:00:00.000Z" : null };
    },
    listTaskEvents: unsupported,
  };
  const server = createServer(createApp({ repo: store.repo, security: testSecurity(), allowedOrigins: [], m1 }));
  const base = await start(server);
  t.after(() => server.close());

  let response = await fetch(`${base}/api/v1/tasks`, { headers: { cookie: `tracker_session=${verified.id}:1` } });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { meta: { total: number } }).meta.total, 1);

  response = await fetch(`${base}/api/v1/auth/csrf`);
  const csrf = (await response.json() as { data: { token: string } }).data.token;
  const csrfCookie = updateCookies("", response);
  const cookie = `${csrfCookie}; tracker_session=${verified.id}:1`;
  response = await fetch(`${base}/api/v1/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf, "idempotency-key": "m1-test-key", cookie },
    body: JSON.stringify({ title: "Created over HTTP", unknown: true }),
  });
  assert.equal(response.status, 422);

  response = await fetch(`${base}/api/v1/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf, "idempotency-key": "m1-test-key", cookie },
    body: JSON.stringify({ title: "Created over HTTP" }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json() as { data: TaskDto }).data.title, "Created over HTTP");
  assert.deepEqual(calls, [{ userId: verified.id, key: "m1-test-key" }]);

  response = await fetch(`${base}/api/v1/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf, cookie },
  });
  assert.equal(response.status, 422);

  response = await fetch(`${base}/api/v1/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf, "if-match": '"7"', cookie },
  });
  assert.equal(response.status, 204);
  assert.deepEqual(archiveCalls, [{ userId: verified.id, id: task.id, version: 7, archived: true }]);

  response = await fetch(`${base}/api/v1/projects/${project.id}`, {
    method: "DELETE",
    headers: { "x-csrf-token": csrf, "if-match": "4", cookie },
  });
  assert.equal(response.status, 204);
  assert.deepEqual(projectStatusCalls, [{ userId: verified.id, id: project.id, version: 4, status: "archived" }]);

  const unverified = await store.repo.createUserWithState({ name: "Unverified", email: "unverified@example.com", passwordHash: "hash" });
  response = await fetch(`${base}/api/v1/tasks`, { headers: { cookie: `tracker_session=${unverified.id}:1` } });
  assert.equal(response.status, 403);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "EMAIL_UNVERIFIED");
});
