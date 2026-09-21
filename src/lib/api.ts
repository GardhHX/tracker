// In development, Vite proxies /api to Express. Deployments can override this
// with an absolute VITE_API_URL when the frontend and API use different origins.
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const apiBaseUrl = (viteEnv?.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

type Fetcher = typeof fetch;
type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    request_id?: string;
  };
};
type DataEnvelope<T> = { data: T };

export class TrackerApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(input.message);
    this.name = "TrackerApiError";
    this.status = input.status;
    this.code = input.code;
    this.fields = input.fields;
    this.requestId = input.requestId;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

function apiUrl(path: string, base = apiBaseUrl) {
  return `${base}${path}`;
}

export function googleStartUrl(base = apiBaseUrl) {
  return apiUrl("/api/v1/auth/google/start", base);
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

async function throwApiError(response: Response): Promise<never> {
  const payload = await readJson<ErrorEnvelope>(response);
  const retryAfter = Number(response.headers.get("retry-after"));
  throw new TrackerApiError({
    status: response.status,
    code: payload?.error?.code ?? "REQUEST_FAILED",
    message: payload?.error?.message ?? "The request could not be completed.",
    fields: payload?.error?.fields,
    requestId: payload?.error?.request_id,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

async function post<T>(path: string, body: unknown, fetcher: Fetcher): Promise<T> {
  try {
    const csrfResponse = await fetcher(apiUrl("/api/v1/auth/csrf"), {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!csrfResponse.ok) await throwApiError(csrfResponse);

    const csrfPayload = await readJson<DataEnvelope<{ token: string }>>(csrfResponse);
    const token = csrfPayload?.data.token;
    if (!token) {
      throw new TrackerApiError({
        status: 502,
        code: "INVALID_RESPONSE",
        message: "The API returned an invalid CSRF response.",
      });
    }

    const response = await fetcher(apiUrl(path), {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": token,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) await throwApiError(response);

    const payload = await readJson<DataEnvelope<T>>(response);
    if (!payload || !("data" in payload)) {
      throw new TrackerApiError({
        status: 502,
        code: "INVALID_RESPONSE",
        message: "The API returned an invalid response.",
      });
    }
    return payload.data;
  } catch (cause) {
    if (cause instanceof TrackerApiError) throw cause;
    throw new TrackerApiError({
      status: 0,
      code: "SERVICE_UNAVAILABLE",
      message: "The authentication service could not be reached.",
    });
  }
}

async function request<T>(path: string, options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; idempotencyKey?: string } = {}, fetcher: Fetcher = fetch): Promise<T> {
  try {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { accept: "application/json" };
    if (method !== "GET") {
      const csrfResponse = await fetcher(apiUrl("/api/v1/auth/csrf"), { credentials: "include", headers });
      if (!csrfResponse.ok) await throwApiError(csrfResponse);
      const csrfPayload = await readJson<DataEnvelope<{ token: string }>>(csrfResponse);
      if (!csrfPayload?.data.token) throw new TrackerApiError({ status: 502, code: "INVALID_RESPONSE", message: "The API returned an invalid CSRF response." });
      headers["content-type"] = "application/json";
      headers["x-csrf-token"] = csrfPayload.data.token;
      if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    }
    const response = await fetcher(apiUrl(path), { method, credentials: "include", headers, ...(method === "GET" ? {} : { body: JSON.stringify(options.body ?? {}) }) });
    if (!response.ok) await throwApiError(response);
    const payload = await readJson<DataEnvelope<T>>(response);
    if (!payload || !("data" in payload)) throw new TrackerApiError({ status: 502, code: "INVALID_RESPONSE", message: "The API returned an invalid response." });
    return payload.data;
  } catch (cause) {
    if (cause instanceof TrackerApiError) throw cause;
    throw new TrackerApiError({ status: 0, code: "SERVICE_UNAVAILABLE", message: "Tracker could not reach the API." });
  }
}

async function requestEnvelope<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}, fetcher: Fetcher = fetch): Promise<{ data: T; meta: { server_now: string } }> {
  try {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = { accept: "application/json" };
    if (method !== "GET") {
      const csrfResponse = await fetcher(apiUrl("/api/v1/auth/csrf"), { credentials: "include", headers });
      if (!csrfResponse.ok) await throwApiError(csrfResponse);
      const csrfPayload = await readJson<DataEnvelope<{ token: string }>>(csrfResponse);
      if (!csrfPayload?.data.token) throw new TrackerApiError({ status: 502, code: "INVALID_RESPONSE", message: "The API returned an invalid CSRF response." });
      headers["content-type"] = "application/json";
      headers["x-csrf-token"] = csrfPayload.data.token;
      if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    }
    const response = await fetcher(apiUrl(path), { method, credentials: "include", headers, ...(method === "GET" ? {} : { body: JSON.stringify(options.body ?? {}) }) });
    if (!response.ok) await throwApiError(response);
    const payload = await readJson<{ data: T; meta: { server_now: string } }>(response);
    if (!payload?.data || !payload.meta?.server_now) throw new TrackerApiError({ status: 502, code: "INVALID_RESPONSE", message: "The API returned an invalid Pomodoro response." });
    return payload;
  } catch (cause) {
    if (cause instanceof TrackerApiError) throw cause;
    throw new TrackerApiError({ status: 0, code: "SERVICE_UNAVAILABLE", message: "Tracker could not reach the API." });
  }
}

async function deleteRequest(path: string, version: number, fetcher: Fetcher = fetch): Promise<void> {
  try {
    const csrfResponse = await fetcher(apiUrl("/api/v1/auth/csrf"), { credentials: "include", headers: { accept: "application/json" } });
    if (!csrfResponse.ok) await throwApiError(csrfResponse);
    const csrfPayload = await readJson<DataEnvelope<{ token: string }>>(csrfResponse);
    if (!csrfPayload?.data.token) throw new TrackerApiError({ status: 502, code: "INVALID_RESPONSE", message: "The API returned an invalid CSRF response." });
    const response = await fetcher(apiUrl(path), {
      method: "DELETE",
      credentials: "include",
      headers: { accept: "application/json", "x-csrf-token": csrfPayload.data.token, "if-match": `"${version}"` },
    });
    if (!response.ok) await throwApiError(response);
  } catch (cause) {
    if (cause instanceof TrackerApiError) throw cause;
    throw new TrackerApiError({ status: 0, code: "SERVICE_UNAVAILABLE", message: "Tracker could not reach the API." });
  }
}

async function deleteWithoutBody(path: string, fetcher: Fetcher = fetch): Promise<void> {
  try {
    const csrfResponse = await fetcher(apiUrl("/api/v1/auth/csrf"), { credentials: "include", headers: { accept: "application/json" } });
    if (!csrfResponse.ok) await throwApiError(csrfResponse);
    const csrfPayload = await readJson<DataEnvelope<{ token: string }>>(csrfResponse);
    if (!csrfPayload?.data.token) throw new TrackerApiError({ status: 502, code: "INVALID_RESPONSE", message: "The API returned an invalid CSRF response." });
    const response = await fetcher(apiUrl(path), { method: "DELETE", credentials: "include", headers: { accept: "application/json", "x-csrf-token": csrfPayload.data.token } });
    if (!response.ok) await throwApiError(response);
  } catch (cause) {
    if (cause instanceof TrackerApiError) throw cause;
    throw new TrackerApiError({ status: 0, code: "SERVICE_UNAVAILABLE", message: "Tracker could not reach the API." });
  }
}

async function listRequest<T>(path: string, fetcher: Fetcher = fetch): Promise<{ data: T[]; meta: { page: number; page_size: number; total: number } }> {
  try {
    const response = await fetcher(apiUrl(path), { credentials: "include", headers: { accept: "application/json" } });
    if (!response.ok) await throwApiError(response);
    const payload = await readJson<{ data: T[]; meta: { page: number; page_size: number; total: number } }>(response);
    if (!payload || !Array.isArray(payload.data) || !payload.meta) throw new TrackerApiError({ status: 502, code: "INVALID_RESPONSE", message: "The API returned an invalid list response." });
    return payload;
  } catch (cause) {
    if (cause instanceof TrackerApiError) throw cause;
    throw new TrackerApiError({ status: 0, code: "SERVICE_UNAVAILABLE", message: "Tracker could not reach the API." });
  }
}

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `tracker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ProjectStatus = "active" | "completed" | "archived";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type ProjectDto = {
  id: string; version: number; created_at: string; updated_at: string; name: string; description: string | null;
  status: ProjectStatus; completed_at: string | null; archived_at: string | null; done_count: number; task_count: number; progress_percent: number;
};
export type TaskDto = {
  id: string; version: number; created_at: string; updated_at: string; project_id: string | null; title: string; description: string | null;
  status: TaskStatus; priority: TaskPriority; due_date: string | null; completed_at: string | null; archived_at: string | null;
  recurrence_rule_id: null; occurrence_date: null; rule_version: null;
};
export type TaskEventDto = {
  id: string; task_id: string; task_version: number; event_type: "created" | "edited" | "status_changed" | "project_changed" | "archived" | "unarchived";
  from_status: TaskStatus | null; to_status: TaskStatus; previous_project_id: string | null; project_id_at_event: string | null;
  task_title_snapshot: string; project_name_snapshot: string | null; archived: boolean; occurred_at: string;
};

export const listProjects = (status: ProjectStatus | "all" = "all", fetcher?: Fetcher) => listRequest<ProjectDto>(`/api/v1/projects?status=${status}&page_size=100`, fetcher);
export const getProject = (id: string, fetcher?: Fetcher) => request<ProjectDto>(`/api/v1/projects/${id}`, {}, fetcher);
export const createProject = (input: { name: string; description?: string | null }, fetcher?: Fetcher) => request<ProjectDto>("/api/v1/projects", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const patchProject = (id: string, input: { version: number; name?: string; description?: string | null }, fetcher?: Fetcher) => request<ProjectDto>(`/api/v1/projects/${id}`, { method: "PATCH", body: input }, fetcher);
export const deleteProject = (id: string, version: number, fetcher?: Fetcher) => deleteRequest(`/api/v1/projects/${id}`, version, fetcher);
export const setProjectStatus = (id: string, input: { version: number; status: ProjectStatus }, fetcher?: Fetcher) => request<ProjectDto>(`/api/v1/projects/${id}/status`, { method: "POST", body: input }, fetcher);

export const listTasks = (query = "archived=all&page_size=100", fetcher?: Fetcher) => listRequest<TaskDto>(`/api/v1/tasks?${query}`, fetcher);
export const createTask = (input: { title: string; description?: string | null; project_id?: string | null; priority?: TaskPriority; due_date?: string | null }, fetcher?: Fetcher) => request<TaskDto>("/api/v1/tasks", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const patchTask = (id: string, input: { version: number; title?: string; description?: string | null; project_id?: string | null; priority?: TaskPriority; due_date?: string | null }, fetcher?: Fetcher) => request<TaskDto>(`/api/v1/tasks/${id}`, { method: "PATCH", body: input }, fetcher);
export const deleteTask = (id: string, version: number, fetcher?: Fetcher) => deleteRequest(`/api/v1/tasks/${id}`, version, fetcher);
export const setTaskStatus = (id: string, input: { version: number; status: TaskStatus }, fetcher?: Fetcher) => request<TaskDto>(`/api/v1/tasks/${id}/status`, { method: "POST", body: input }, fetcher);
export const setTaskArchived = (id: string, version: number, archived: boolean, fetcher?: Fetcher) => request<TaskDto>(`/api/v1/tasks/${id}/${archived ? "archive" : "unarchive"}`, { method: "POST", body: { version } }, fetcher);
export const listTaskEvents = (id: string, fetcher?: Fetcher) => listRequest<TaskEventDto>(`/api/v1/tasks/${id}/events?page_size=100`, fetcher);

export type HabitScheduleDto = { id: string; habit_id: string; effective_from: string; weekdays: number[]; created_at: string };
export type HabitCheckInDto = { id: string; habit_id: string; date: string; checked_at: string; created_at: string };
export type HabitDto = { id: string; version: number; created_at: string; updated_at: string; name: string; start_date: string; timezone: string; archived_at: string | null; archived_on: string | null; current_schedule: HabitScheduleDto };

export const listHabits = (archived: "true" | "false" | "all" = "all", fetcher?: Fetcher) => listRequest<HabitDto>(`/api/v1/habits?archived=${archived}&page_size=100`, fetcher);
export const listHabitSchedules = (id: string, fetcher?: Fetcher) => listRequest<HabitScheduleDto>(`/api/v1/habits/${id}/schedules`, fetcher);
export const createHabit = (input: { name: string; start_date: string; weekdays: number[] }, fetcher?: Fetcher) => request<HabitDto>("/api/v1/habits", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const patchHabit = (id: string, input: { version: number; name: string }, fetcher?: Fetcher) => request<HabitDto>(`/api/v1/habits/${id}`, { method: "PATCH", body: input }, fetcher);
export const setHabitSchedule = (id: string, input: { version: number; weekdays: number[] }, fetcher?: Fetcher) => request<HabitDto>(`/api/v1/habits/${id}/schedules`, { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const archiveHabit = (id: string, version: number, fetcher?: Fetcher) => request<HabitDto>(`/api/v1/habits/${id}/archive`, { method: "POST", body: { version } }, fetcher);
export const listHabitCheckIns = (id: string, from: string, to: string, fetcher?: Fetcher) => listRequest<HabitCheckInDto>(`/api/v1/habits/${id}/check-ins?from=${from}&to=${to}&page_size=100`, fetcher);
export const setHabitCheckIn = (id: string, date: string, fetcher?: Fetcher) => request<HabitCheckInDto>(`/api/v1/habits/${id}/check-ins/${date}`, { method: "PUT" }, fetcher);
export const deleteHabitCheckIn = (id: string, date: string, fetcher?: Fetcher) => deleteWithoutBody(`/api/v1/habits/${id}/check-ins/${date}`, fetcher);

export type TimeboxKind = "class" | "task" | "habit" | "focus";
export type TimeboxDto = { id: string; version: number; created_at: string; updated_at: string; kind: TimeboxKind; title: string; starts_at: string; ends_at: string; task_id: string | null; habit_id: string | null; status: "planned" | "cancelled"; cancelled_at: string | null };
export type TimeboxInput = { kind: TimeboxKind; title: string; starts_at: string; ends_at: string; task_id?: string | null; habit_id?: string | null };
export const listTimebox = (date: string, fetcher?: Fetcher) => listRequest<TimeboxDto>(`/api/v1/timebox?date=${date}&page_size=100`, fetcher);
export const createTimebox = (input: TimeboxInput, fetcher?: Fetcher) => request<TimeboxDto>("/api/v1/timebox", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const patchTimebox = (id: string, input: { version: number } & Partial<TimeboxInput>, fetcher?: Fetcher) => request<TimeboxDto>(`/api/v1/timebox/${id}`, { method: "PATCH", body: input }, fetcher);
export const cancelTimebox = (id: string, version: number, fetcher?: Fetcher) => request<TimeboxDto>(`/api/v1/timebox/${id}/cancel`, { method: "POST", body: { version } }, fetcher);

export type PomodoroPhase = "focus" | "short_break" | "long_break";
export type PomodoroSessionDto = { id: string; version: number; created_at: string; updated_at: string; cycle_day_id: string; cycle_date: string; cycle_timezone: string; phase: PomodoroPhase; status: "running" | "paused" | "completed" | "cancelled"; planned_seconds: number; task_id: string | null; project_id_at_start: string | null; task_title_snapshot: string | null; project_name_snapshot: string | null; started_at: string; due_at: string | null; ended_at: string | null; active_duration_ms: number; remaining_seconds: number };
export type PomodoroBundleDto = { state: { cycle_day_id: string; cycle_date: string; timezone: string; next_phase: PomodoroPhase; completed_focus_count: number; version: number; updated_at: string }; today: { id: string; version: number; cycle_date: string; timezone: string; next_phase: PomodoroPhase; completed_focus_count: number }; session: PomodoroSessionDto | null };
export const getPomodoroActive = (fetcher?: Fetcher) => requestEnvelope<PomodoroBundleDto>("/api/v1/pomodoro/active", {}, fetcher);
export const startPomodoro = (stateVersion: number, taskId?: string | null, fetcher?: Fetcher) => requestEnvelope<PomodoroBundleDto>("/api/v1/pomodoro/start", { method: "POST", body: { state_version: stateVersion, task_id: taskId ?? null }, idempotencyKey: idempotencyKey() }, fetcher);
export const pausePomodoro = (id: string, version: number, fetcher?: Fetcher) => requestEnvelope<PomodoroBundleDto>(`/api/v1/pomodoro/sessions/${id}/pause`, { method: "POST", body: { version } }, fetcher);
export const resumePomodoro = (id: string, version: number, fetcher?: Fetcher) => requestEnvelope<PomodoroBundleDto>(`/api/v1/pomodoro/sessions/${id}/resume`, { method: "POST", body: { version } }, fetcher);
export const cancelPomodoro = (id: string, version: number, fetcher?: Fetcher) => requestEnvelope<PomodoroBundleDto>(`/api/v1/pomodoro/sessions/${id}/cancel`, { method: "POST", body: { version } }, fetcher);
export const listPomodoroSessions = (from: string, to: string, fetcher?: Fetcher) => listRequest<PomodoroSessionDto>(`/api/v1/pomodoro/sessions?from=${from}&to=${to}&page_size=100`, fetcher);

export type FinanceAccountType = "cash" | "bank" | "ewallet";
export type FinanceCategoryType = "income" | "expense";
export type FinanceTransactionType = "income" | "expense" | "transfer";
export type FinanceTransactionStatus = "draft" | "posted" | "void";
export type FinanceAccountDto = { id: string; version: number; created_at: string; updated_at: string; name: string; type: FinanceAccountType; opening_balance: string; balance: string; archived_at: string | null };
export type FinanceBalanceChangeDto = { id: string; account_id: string; account_version: number; previous_balance: string | null; new_balance: string; changed_at: string };
export type FinanceCategoryDto = { id: string; version: number; created_at: string; updated_at: string; name: string; type: FinanceCategoryType; archived_at: string | null };
export type FinanceTransactionDto = {
  id: string; version: number; created_at: string; updated_at: string; type: FinanceTransactionType; status: FinanceTransactionStatus;
  account_id: string; to_account_id: string | null; category_id: string | null; amount: string; date: string; note: string | null;
  posted_at: string | null; voided_at: string | null; recurrence_rule_id: null; occurrence_date: null; rule_version: null;
};
export type FinanceRevisionDto = { id: string; transaction_id: string; transaction_version: number; action: "created" | "edited" | "posted" | "voided"; snapshot: FinanceTransactionDto; changed_at: string };
export type FinanceBudgetDto = { id: string; version: number; created_at: string; updated_at: string; category_id: string; month: string; limit_amount: string; spent: string; remaining: string };

export const listFinanceAccounts = (fetcher?: Fetcher) => listRequest<FinanceAccountDto>("/api/v1/finance/accounts?archived=all&page_size=100", fetcher);
export const createFinanceAccount = (input: { name: string; type: FinanceAccountType; opening_balance: string }, fetcher?: Fetcher) => request<FinanceAccountDto>("/api/v1/finance/accounts", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const patchFinanceAccount = (id: string, input: { version: number; name?: string; type?: FinanceAccountType; opening_balance?: string }, fetcher?: Fetcher) => request<FinanceAccountDto>(`/api/v1/finance/accounts/${id}`, { method: "PATCH", body: input }, fetcher);
export const archiveFinanceAccount = (id: string, version: number, fetcher?: Fetcher) => request<FinanceAccountDto>(`/api/v1/finance/accounts/${id}/archive`, { method: "POST", body: { version } }, fetcher);
export const listFinanceBalanceChanges = (id: string, fetcher?: Fetcher) => listRequest<FinanceBalanceChangeDto>(`/api/v1/finance/accounts/${id}/balance-changes?page_size=100`, fetcher);

export const listFinanceCategories = (fetcher?: Fetcher) => listRequest<FinanceCategoryDto>("/api/v1/finance/categories?archived=all&page_size=100", fetcher);
export const createFinanceCategory = (input: { name: string; type: FinanceCategoryType }, fetcher?: Fetcher) => request<FinanceCategoryDto>("/api/v1/finance/categories", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const archiveFinanceCategory = (id: string, version: number, fetcher?: Fetcher) => request<FinanceCategoryDto>(`/api/v1/finance/categories/${id}/archive`, { method: "POST", body: { version } }, fetcher);

export type FinanceTransactionInput = { type: FinanceTransactionType; account_id: string; to_account_id?: string | null; category_id?: string | null; amount: string; date: string; note?: string | null; status: "draft" | "posted" };
export const listFinanceTransactions = (from: string, to: string, fetcher?: Fetcher) => listRequest<FinanceTransactionDto>(`/api/v1/finance/transactions?from=${from}&to=${to}&page_size=100`, fetcher);
export const createFinanceTransaction = (input: FinanceTransactionInput, fetcher?: Fetcher) => request<FinanceTransactionDto>("/api/v1/finance/transactions", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const patchFinanceTransaction = (id: string, input: { version: number } & Partial<Omit<FinanceTransactionInput, "status">>, fetcher?: Fetcher) => request<FinanceTransactionDto>(`/api/v1/finance/transactions/${id}`, { method: "PATCH", body: input }, fetcher);
export const postFinanceTransaction = (id: string, version: number, fetcher?: Fetcher) => request<FinanceTransactionDto>(`/api/v1/finance/transactions/${id}/post`, { method: "POST", body: { version }, idempotencyKey: idempotencyKey() }, fetcher);
export const voidFinanceTransaction = (id: string, version: number, fetcher?: Fetcher) => request<FinanceTransactionDto>(`/api/v1/finance/transactions/${id}/void`, { method: "POST", body: { version } }, fetcher);
export const listFinanceRevisions = (id: string, fetcher?: Fetcher) => listRequest<FinanceRevisionDto>(`/api/v1/finance/transactions/${id}/revisions?page_size=100`, fetcher);

export const listFinanceBudgets = (month: string, fetcher?: Fetcher) => listRequest<FinanceBudgetDto>(`/api/v1/finance/budgets?month=${month}&page_size=100`, fetcher);
export const createFinanceBudget = (input: { category_id: string; month: string; limit_amount: string }, fetcher?: Fetcher) => request<FinanceBudgetDto>("/api/v1/finance/budgets", { method: "POST", body: input, idempotencyKey: idempotencyKey() }, fetcher);
export const patchFinanceBudget = (id: string, version: number, limitAmount: string, fetcher?: Fetcher) => request<FinanceBudgetDto>(`/api/v1/finance/budgets/${id}`, { method: "PATCH", body: { version, limit_amount: limitAmount } }, fetcher);
export const deleteFinanceBudget = (id: string, version: number, fetcher?: Fetcher) => deleteRequest(`/api/v1/finance/budgets/${id}`, version, fetcher);

export type LoginUser = {
  id: string;
  email: string;
  name: string;
  email_verified_at: string | null;
  version: number;
};

export function loginWithPassword(
  input: { email: string; password: string },
  fetcher: Fetcher = fetch,
) {
  return post<LoginUser>("/api/v1/auth/login", input, fetcher);
}

export function registerWithPassword(
  input: { name: string; email: string; password: string },
  fetcher: Fetcher = fetch,
) {
  return post<{ accepted: boolean }>("/api/v1/auth/register", input, fetcher);
}
