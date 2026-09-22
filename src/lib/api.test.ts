import assert from "node:assert/strict";
import test from "node:test";
import {
  googleStartUrl,
  loginWithPassword,
  registerWithPassword,
  TrackerApiError,
  createTask,
  deleteTask,
  listTasks,
  setHabitCheckIn,
  startPomodoro,
  createFinanceTransaction,
  createFinanceRule,
  createTaskRule,
  listFinanceAccounts,
  listFinanceRules,
  listTaskRules,
  setTaskDependency,
  stopFinanceRule,
  downloadTaskCsv,
  getTaskReport,
} from "./api.js";

test("googleStartUrl targets the custom Express OAuth start endpoint", () => {
  assert.equal(
    googleStartUrl("http://127.0.0.1:4000"),
    "http://127.0.0.1:4000/api/v1/auth/google/start",
  );
});

test("googleStartUrl uses the same-origin API path by default", () => {
  assert.equal(googleStartUrl(), "/api/v1/auth/google/start");
});

test("loginWithPassword obtains CSRF and sends credentials to Express", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ data: { token: "csrf-123" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        data: {
          id: "user-1",
          email: "ada@example.com",
          name: "Ada",
          email_verified_at: null,
          version: 1,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const user = await loginWithPassword(
    { email: "ada@example.com", password: "correct horse" },
    fakeFetch,
  );

  assert.equal(user.id, "user-1");
  assert.equal(calls[0]?.input, "/api/v1/auth/csrf");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(calls[1]?.input, "/api/v1/auth/login");
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.credentials, "include");
  assert.equal((calls[1]?.init?.headers as Record<string, string>)["x-csrf-token"], "csrf-123");
  assert.equal(
    calls[1]?.init?.body,
    JSON.stringify({ email: "ada@example.com", password: "correct horse" }),
  );
});

test("registerWithPassword preserves API error details", async () => {
  let call = 0;
  const fakeFetch = (async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({ data: { token: "csrf-123" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Request validation failed.", request_id: "req-1" } }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  await assert.rejects(
    registerWithPassword(
      { name: "Ada", email: "ada@example.com", password: "correct horse" },
      fakeFetch,
    ),
    (error: unknown) =>
      error instanceof TrackerApiError &&
      error.status === 422 &&
      error.code === "VALIDATION_ERROR" &&
      error.requestId === "req-1",
  );
});

test("network failures become a service unavailable error", async () => {
  const fakeFetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  await assert.rejects(
    loginWithPassword({ email: "ada@example.com", password: "password" }, fakeFetch),
    (error: unknown) => error instanceof TrackerApiError && error.code === "SERVICE_UNAVAILABLE",
  );
});

test("M1 task client reads lists and sends CSRF plus idempotency on create", async () => {
  const task = {
    id: "task-1", version: 1, created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z", project_id: null,
    title: "M1", description: null, status: "todo", priority: "medium", due_date: null, completed_at: null, archived_at: null,
    recurrence_rule_id: null, occurrence_date: null, rule_version: null,
  } as const;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith("/auth/csrf")) return new Response(JSON.stringify({ data: { token: "csrf-m1" } }), { status: 200, headers: { "content-type": "application/json" } });
    if (init?.method === "POST") return new Response(JSON.stringify({ data: task }), { status: 201, headers: { "content-type": "application/json" } });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ data: [task], meta: { page: 1, page_size: 100, total: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const listed = await listTasks(undefined, fakeFetch);
  assert.equal(listed.data[0]?.title, "M1");
  await createTask({ title: "M1" }, fakeFetch);
  const createCall = calls[2];
  assert.equal(createCall?.input, "/api/v1/tasks");
  assert.equal(createCall?.init?.method, "POST");
  const headers = createCall?.init?.headers as Record<string, string>;
  assert.equal(headers["x-csrf-token"], "csrf-m1");
  assert.ok(headers["idempotency-key"].length >= 8);

  await deleteTask(task.id, 3, fakeFetch);
  const deleteCall = calls[4];
  assert.equal(deleteCall?.input, `/api/v1/tasks/${task.id}`);
  assert.equal(deleteCall?.init?.method, "DELETE");
  const deleteHeaders = deleteCall?.init?.headers as Record<string, string>;
  assert.equal(deleteHeaders["x-csrf-token"], "csrf-m1");
  assert.equal(deleteHeaders["if-match"], '"3"');
});

test("M2 clients send PUT check-ins and preserve Pomodoro server time", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith("/auth/csrf")) return new Response(JSON.stringify({ data: { token: "csrf-m2" } }), { status: 200, headers: { "content-type": "application/json" } });
    if (String(input).includes("check-ins")) return new Response(JSON.stringify({ data: { id: "check-1", habit_id: "11111111-1111-4111-8111-111111111111", date: "2026-09-21", checked_at: "2026-09-21T06:00:00.000Z", created_at: "2026-09-21T06:00:00.000Z" } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ data: { state: { version: 2, next_phase: "focus" }, today: { completed_focus_count: 0 }, session: null }, meta: { server_now: "2026-09-21T06:00:00.000Z" } }), { status: 201, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  await setHabitCheckIn("11111111-1111-4111-8111-111111111111", "2026-09-21", fakeFetch);
  assert.equal(calls[1]?.init?.method, "PUT");
  assert.equal((calls[1]?.init?.headers as Record<string, string>)["x-csrf-token"], "csrf-m2");

  const started = await startPomodoro(2, null, fakeFetch);
  assert.equal(started.meta.server_now, "2026-09-21T06:00:00.000Z");
  assert.equal(calls[3]?.init?.method, "POST");
  assert.ok(((calls[3]?.init?.headers as Record<string, string>)["idempotency-key"] ?? "").length >= 8);
});

test("M3 clients preserve rupiah strings and send idempotency", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const account = { id: "account-1", version: 1, created_at: "2026-09-22T00:00:00.000Z", updated_at: "2026-09-22T00:00:00.000Z", name: "Bank", type: "bank", opening_balance: "9007199254740993", balance: "9007199254740993", archived_at: null } as const;
  const transaction = { id: "tx-1", version: 1, created_at: "2026-09-22T00:00:00.000Z", updated_at: "2026-09-22T00:00:00.000Z", type: "expense", status: "posted", account_id: "account-1", to_account_id: null, category_id: "category-1", amount: "9007199254740993", date: "2026-09-22", note: null, posted_at: "2026-09-22T00:00:00.000Z", voided_at: null, recurrence_rule_id: null, occurrence_date: null, rule_version: null } as const;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith("/auth/csrf")) return new Response(JSON.stringify({ data: { token: "csrf-m3" } }), { status: 200, headers: { "content-type": "application/json" } });
    if (init?.method === "POST") return new Response(JSON.stringify({ data: transaction }), { status: 201, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ data: [account], meta: { page: 1, page_size: 100, total: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  assert.equal((await listFinanceAccounts(fakeFetch)).data[0]?.balance, "9007199254740993");
  const created = await createFinanceTransaction({ type: "expense", status: "posted", account_id: "account-1", category_id: "category-1", amount: "9007199254740993", date: "2026-09-22" }, fakeFetch);
  assert.equal(created.amount, "9007199254740993");
  assert.equal(calls[2]?.init?.method, "POST");
  assert.ok(((calls[2]?.init?.headers as Record<string, string>)["idempotency-key"] ?? "").length >= 8);
  assert.match(String(calls[2]?.init?.body), /9007199254740993/);
});

test("M4 task rule and dependency clients use their static Task routes", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const rule = { id: "rule-1", version: 1, created_at: "2026-09-22T00:00:00.000Z", updated_at: "2026-09-22T00:00:00.000Z", title: "Pay rent", description: null, project_id: null, priority: "medium", frequency: "monthly", interval: 1, start_date: "2026-09-22", end_date: null, timezone: "Asia/Jakarta", status: "active", next_date: "2026-09-22", last_generated_date: null, processing_updated_at: null, blocked_reason: null } as const;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith("/auth/csrf")) return new Response(JSON.stringify({ data: { token: "csrf-m4" } }), { status: 200, headers: { "content-type": "application/json" } });
    if (init?.method === "PUT") return new Response(JSON.stringify({ data: { task_id: "task-1", predecessor_id: "task-0", predecessor_status: "todo", predecessor_title: "Prep", created_at: "2026-09-22T00:00:00.000Z" } }), { status: 200, headers: { "content-type": "application/json" } });
    if (init?.method === "POST") return new Response(JSON.stringify({ data: rule }), { status: 201, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ data: [rule], meta: { page: 1, page_size: 100, total: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  assert.equal((await listTaskRules("all", fakeFetch)).data[0]?.title, "Pay rent");
  await createTaskRule({ title: "Pay rent", frequency: "monthly", start_date: "2026-09-22" }, fakeFetch);
  await setTaskDependency("task-1", "task-0", fakeFetch);

  assert.equal(calls[0]?.input, "/api/v1/tasks/recurrences?status=all&page_size=100");
  assert.equal(calls[2]?.input, "/api/v1/tasks/recurrences");
  assert.ok(((calls[2]?.init?.headers as Record<string, string>)["idempotency-key"] ?? "").length >= 8);
  assert.equal(calls[4]?.input, "/api/v1/tasks/task-1/dependencies/task-0");
  assert.equal(calls[4]?.init?.method, "PUT");
});

test("M4 finance rule clients preserve draft recurrence endpoints and idempotency", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const rule = { id: "rule-2", version: 1, created_at: "2026-09-22T00:00:00.000Z", updated_at: "2026-09-22T00:00:00.000Z", type: "expense", account_id: "account-1", to_account_id: null, category_id: "category-1", amount: "300000", note: null, frequency: "monthly", interval: 1, start_date: "2026-09-22", end_date: null, timezone: "Asia/Jakarta", status: "active", next_date: "2026-09-22", last_generated_date: null, processing_updated_at: null, blocked_reason: null } as const;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith("/auth/csrf")) return new Response(JSON.stringify({ data: { token: "csrf-m4-finance" } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ data: !init?.method ? [rule] : rule, meta: { page: 1, page_size: 100, total: 1 } }), { status: init?.method === "POST" && String(input).endsWith("recurrences") ? 201 : 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  assert.equal((await listFinanceRules("all", fakeFetch)).data[0]?.amount, "300000");
  await createFinanceRule({ type: "expense", account_id: "account-1", category_id: "category-1", amount: "300000", frequency: "monthly", start_date: "2026-09-22" }, fakeFetch);
  await stopFinanceRule("rule-2", 1, fakeFetch);

  assert.equal(calls[0]?.input, "/api/v1/finance/recurrences?status=all&page_size=100");
  assert.equal(calls[2]?.input, "/api/v1/finance/recurrences");
  assert.ok(((calls[2]?.init?.headers as Record<string, string>)["idempotency-key"] ?? "").length >= 8);
  assert.equal(calls[4]?.input, "/api/v1/finance/recurrences/rule-2/stop");
  assert.equal(calls[4]?.init?.method, "POST");
});

test("M5 report clients preserve the selected date range for summaries and CSV", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if ((init?.headers as Record<string, string> | undefined)?.accept === "text/csv") return new Response("event_id\r\nevent-1\r\n", { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });
    return new Response(JSON.stringify({ data: { range: { from: "2026-09-01", to: "2026-09-22", timezone: "Asia/Jakarta" }, tasks: { completed_count: 1, distinct_task_count: 1, per_project: [] } } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const summary = await getTaskReport("2026-09-01", "2026-09-22", fakeFetch);
  assert.equal(summary.tasks.completed_count, 1);
  assert.equal(calls[0]?.input, "/api/v1/tasks/reports/summary?from=2026-09-01&to=2026-09-22");
  const csv = await downloadTaskCsv("2026-09-01", "2026-09-22", fakeFetch);
  assert.equal(csv, "event_id\r\nevent-1\r\n");
  assert.equal(calls[1]?.input, "/api/v1/tasks/reports/export?from=2026-09-01&to=2026-09-22");
  assert.equal((calls[1]?.init?.headers as Record<string, string>).accept, "text/csv");
});
