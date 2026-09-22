import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createPrismaM5Service, toCsv } from "./service.prisma.js";
import { M5Error } from "./types.js";

const now = () => new Date("2026-09-22T12:00:00.000Z");
const user = { findUnique: async () => ({ timezone: "UTC" }) };

test("M5 task summary counts completion events separately from unique task ids", async () => {
  const db = {
    user,
    taskEvent: { findMany: async () => [
      { id: "event-1", task_id: "task-a", project_id_at_event: "project-a", project_name_snapshot: "First name", task_title_snapshot: "Task A", occurred_at: new Date("2026-09-05T10:00:00.000Z") },
      { id: "event-2", task_id: "task-a", project_id_at_event: "project-a", project_name_snapshot: "Renamed project", task_title_snapshot: "Task A", occurred_at: new Date("2026-09-09T10:00:00.000Z") },
      { id: "event-3", task_id: "task-b", project_id_at_event: null, project_name_snapshot: null, task_title_snapshot: "Task B", occurred_at: new Date("2026-09-10T10:00:00.000Z") },
    ] },
  } as unknown as PrismaClient;
  const summary = await createPrismaM5Service(db, { now }).taskSummary("user-1", { from: "2026-09-01", to: "2026-09-22" });
  assert.equal(summary.tasks.completed_count, 3);
  assert.equal(summary.tasks.distinct_task_count, 2);
  assert.deepEqual(summary.tasks.per_project.find((row) => row.project_id === "project-a"), { project_id: "project-a", project_name_snapshot: "Renamed project", completed_count: 2, distinct_task_count: 1 });
});

test("M5 Pomodoro summary overlaps terminal focus intervals before rounding", async () => {
  const session = { id: "session-1", status: "cancelled", task_id: "task-1", project_id_at_start: "project-1", project_name_snapshot: "Snapshot", cycle_day: { cycle_date: new Date("2026-09-04T00:00:00.000Z"), timezone: "UTC" } };
  const db = {
    user,
    pomodoroInterval: { findMany: async () => [{ id: "interval-1", session_id: "session-1", started_at: new Date("2026-09-09T23:59:59.500Z"), ended_at: new Date("2026-09-10T00:00:00.500Z"), session }] },
    pomodoroSession: { findMany: async () => [{ status: "completed" }, { status: "cancelled" }] },
  } as unknown as PrismaClient;
  const summary = await createPrismaM5Service(db, { now }).pomodoroSummary("user-1", { from: "2026-09-10", to: "2026-09-10" });
  assert.equal(summary.pomodoro.focus_duration_ms, 500);
  assert.equal(summary.pomodoro.focus_duration_seconds, 0);
  assert.equal(summary.pomodoro.completed_focus_count, 1);
  assert.equal(summary.pomodoro.cancelled_focus_count, 1);
});

test("M5 habit summary uses historical schedules and excludes days after archive", async () => {
  const db = {
    user,
    habit: { findMany: async () => [{
      id: "habit-1", name: "Read", timezone: "UTC", start_date: new Date("2026-09-01T00:00:00.000Z"), archived_on: new Date("2026-09-04T00:00:00.000Z"),
      schedules: [
        { effective_from: new Date("2026-09-01T00:00:00.000Z"), weekdays: [1, 2, 3, 4, 5] },
        { effective_from: new Date("2026-09-03T00:00:00.000Z"), weekdays: [3, 4, 5] },
      ],
      check_ins: [{ date: new Date("2026-09-03T00:00:00.000Z") }],
    }] },
  } as unknown as PrismaClient;
  const summary = await createPrismaM5Service(db, { now }).habitSummary("user-1", { from: "2026-09-01", to: "2026-09-07" });
  assert.deepEqual(summary.habits, [{ habit_id: "habit-1", name: "Read", timezone: "UTC", scheduled_days: 4, completed_days: 1, ratio: 0.25 }]);
});

test("M5 finance and budget reports use current posted transactions and the full budget month", async () => {
  const db = {
    user,
    financeTransaction: { findMany: async (args: { where: { category_id?: string } }) => args.where.category_id
      ? [{ amount: 80n }]
      : [
        { id: "income", version: 1, type: "income", account_id: "account", category_id: "salary", amount: 200n, date: new Date("2026-09-04T00:00:00.000Z"), note: null },
        { id: "expense", version: 2, type: "expense", account_id: "account", category_id: "food", amount: 80n, date: new Date("2026-09-05T00:00:00.000Z"), note: "Lunch" },
      ],
    },
    budget: { findMany: async () => [{ month: new Date("2026-09-01T00:00:00.000Z"), category_id: "food", limit_amount: 100n }] },
  } as unknown as PrismaClient;
  const summary = await createPrismaM5Service(db, { now }).financeSummary("user-1", { from: "2026-09-04", to: "2026-09-05" });
  assert.equal(summary.finance.income, "200");
  assert.equal(summary.finance.expense, "80");
  assert.equal(summary.finance.net, "120");
  assert.deepEqual(summary.budgets, [{ month: "2026-09-01", category_id: "food", limit_amount: "100", spent: "80", remaining: "20", basis: "full_calendar_month" }]);
});

test("M5 CSV escapes quotes, newlines, and spreadsheet formulas", () => {
  assert.equal(toCsv(["note", "amount"], [["  =SUM(A1:A2), \"quoted\"\nnext", "9007199254740993"]]), "note,amount\r\n\"'  =SUM(A1:A2), \"\"quoted\"\"\nnext\",9007199254740993\r\n");
});

test("M5 refuses CSV exports over the documented row cap before returning a body", async () => {
  const db = {
    user,
    taskEvent: { findMany: async () => Array.from({ length: 10_001 }, (_, index) => ({ id: `event-${index}`, task_id: `task-${index}`, task_title_snapshot: "Task", project_id_at_event: null, project_name_snapshot: null, occurred_at: new Date("2026-09-10T00:00:00.000Z") })) },
  } as unknown as PrismaClient;
  await assert.rejects(
    createPrismaM5Service(db, { now }).exportTasks("user-1", { from: "2026-09-10", to: "2026-09-10" }),
    (error: unknown) => error instanceof M5Error && error.code === "EXPORT_TOO_LARGE",
  );
});
