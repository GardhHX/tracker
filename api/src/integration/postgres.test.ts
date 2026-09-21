import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createIdempotencyExecutor, IdempotencyConflictError } from "../lib/idempotency.js";
import { createPostgresRateLimiter, hashRateLimitKey } from "../lib/ratelimit.js";
import { prisma } from "../lib/prisma.js";
import { cleanupExpiredSecurityData } from "../lib/maintenance.js";
import { createPrismaM1Service } from "../modules/work/service.prisma.js";
import { WorkError } from "../modules/work/types.js";
import { createPrismaM2Service } from "../modules/m2/service.prisma.js";
import { createPrismaM3Service } from "../modules/finance/service.prisma.js";
import { FinanceError } from "../modules/finance/types.js";

const postgresTest = process.env.RUN_POSTGRES_INTEGRATION === "1" ? test : test.skip;

postgresTest("PostgreSQL persistence primitives are atomic and replay-safe", async (t) => {
  const suffix = randomUUID();
  const email = `integration-${suffix}@example.invalid`;
  const rateKey = `integration-rate:${suffix}`;
  const rateHash = hashRateLimitKey(rateKey, "integration-test-secret");
  let userId: string | undefined;

  t.after(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { bucket_hash: rateHash } });
    if (userId) {
      await prisma.financeTransactionRevision.deleteMany({ where: { user_id: userId } });
      await prisma.financeTransaction.deleteMany({ where: { user_id: userId } });
      await prisma.budget.deleteMany({ where: { user_id: userId } });
      await prisma.financeAccountBalanceChange.deleteMany({ where: { user_id: userId } });
      await prisma.financeCategory.deleteMany({ where: { user_id: userId } });
      await prisma.financeAccount.deleteMany({ where: { user_id: userId } });
      await prisma.pomodoroInterval.deleteMany({ where: { user_id: userId } });
      await prisma.pomodoroSession.deleteMany({ where: { user_id: userId } });
      await prisma.timeboxEntry.deleteMany({ where: { user_id: userId } });
      await prisma.habitCheckIn.deleteMany({ where: { user_id: userId } });
      await prisma.habitSchedule.deleteMany({ where: { user_id: userId } });
      await prisma.habit.deleteMany({ where: { user_id: userId } });
      await prisma.pomodoroState.deleteMany({ where: { user_id: userId } });
      await prisma.pomodoroDay.deleteMany({ where: { user_id: userId } });
      await prisma.taskEvent.deleteMany({ where: { user_id: userId } });
      await prisma.task.deleteMany({ where: { user_id: userId } });
      await prisma.project.deleteMany({ where: { user_id: userId } });
      await prisma.idempotencyRecord.deleteMany({ where: { user_id: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } else {
      await prisma.user.deleteMany({ where: { email } });
    }
    await prisma.$disconnect();
  });

  await t.test("rate-limit UPSERT persists one shared counter", async () => {
    const limiter = createPostgresRateLimiter(prisma, "integration-test-secret", { cleanupEvery: 0 });
    assert.equal((await limiter.check(rateKey, 1, 60_000)).allowed, true);
    assert.equal((await limiter.check(rateKey, 1, 60_000)).allowed, false);

    const bucket = await prisma.rateLimitBucket.findUnique({ where: { bucket_hash: rateHash } });
    assert.equal(bucket?.count, 2);
  });

  await t.test("idempotency replays, rejects payload conflicts, serializes concurrency, and rolls back", async () => {
    const user = await prisma.user.create({ data: { email, name: "Integration User" } });
    userId = user.id;
    await prisma.pomodoroState.create({ data: { user_id: user.id } });
    const execute = createIdempotencyExecutor(prisma);
    const route = "/api/v1/timebox";
    const key = `idem-${randomUUID()}`;
    let workRuns = 0;

    const first = await execute(
      { userId, key, method: "POST", route, requestBody: { title: "Deep work", starts_at: "2026-09-21T01:00:00.000Z" } },
      async () => {
        workRuns += 1;
        return { status: 201, body: { id: "timebox-integration-1", title: "Deep work" } };
      },
    );
    const replay = await execute(
      { userId, key, method: "POST", route, requestBody: { starts_at: "2026-09-21T01:00:00.000Z", title: "Deep work" } },
      async () => {
        workRuns += 1;
        return { status: 201, body: { id: "should-not-run" } };
      },
    );

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.body, first.body);
    assert.equal(workRuns, 1);
    await assert.rejects(
      execute(
        { userId, key, method: "POST", route, requestBody: { title: "Different payload" } },
        async () => ({ status: 201, body: { id: "should-not-run" } }),
      ),
      IdempotencyConflictError,
    );

    const concurrentKey = `idem-${randomUUID()}`;
    let concurrentRuns = 0;
    const concurrentRequest = () =>
      execute(
        { userId: user.id, key: concurrentKey, method: "POST", route, requestBody: { title: "Concurrent" } },
        async (tx) => {
          concurrentRuns += 1;
          await tx.user.update({ where: { id: user.id }, data: { version: { increment: 1 } } });
          return { status: 201, body: { id: "timebox-concurrent" } };
        },
      );
    const concurrent = await Promise.all([concurrentRequest(), concurrentRequest()]);
    assert.deepEqual(concurrent.map((result) => result.replayed).sort(), [false, true]);
    assert.equal(concurrentRuns, 1);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).version, 2);

    const rollbackKey = `idem-${randomUUID()}`;
    await assert.rejects(
      execute(
        { userId: user.id, key: rollbackKey, method: "POST", route, requestBody: { title: "Rollback" } },
        async (tx) => {
          await tx.user.update({ where: { id: user.id }, data: { version: { increment: 1 } } });
          throw new Error("domain write failed");
        },
      ),
      /domain write failed/,
    );
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).version, 2);
    assert.equal(
      await prisma.idempotencyRecord.count({ where: { user_id: user.id, key: rollbackKey } }),
      0,
    );
  });

  await t.test("maintenance removes expired idempotency and rate-limit rows", async () => {
    assert.ok(userId);
    const expiredRateHash = hashRateLimitKey(`expired:${suffix}`, "integration-test-secret");
    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.idempotencyRecord.create({
      data: {
        user_id: userId,
        key: `expired-${randomUUID()}`,
        method: "POST",
        route: "/api/v1/timebox",
        request_hash: "expired-request-hash",
        response_status: 201,
        response_json: { id: "expired" },
        expires_at: expiredAt,
      },
    });
    await prisma.rateLimitBucket.create({
      data: {
        bucket_hash: expiredRateHash,
        window_start: new Date(expiredAt.getTime() - 60_000),
        count: 1,
        expires_at: expiredAt,
      },
    });

    const removed = await cleanupExpiredSecurityData(prisma);
    assert.ok(removed.idempotencyRecords >= 1);
    assert.ok(removed.rateLimitBuckets >= 1);
    assert.equal(await prisma.rateLimitBucket.findUnique({ where: { bucket_hash: expiredRateHash } }), null);
    assert.ok(await prisma.rateLimitBucket.findUnique({ where: { bucket_hash: rateHash } }));
  });

  await t.test("M1 persists project/task mutations with immutable atomic history", async () => {
    assert.ok(userId);
    const service = createPrismaM1Service(prisma, { now: () => new Date("2026-09-21T06:00:00.000Z") });
    const firstProject = await service.createProject(userId, { name: "First project" }, `project-${randomUUID()}`);
    const secondProject = await service.createProject(userId, { name: "Second project" }, `project-${randomUUID()}`);
    const createKey = `task-${randomUUID()}`;
    const created = await service.createTask(userId, { title: "Ship M1", project_id: firstProject.data.id, priority: "high", due_date: "2026-09-22" }, createKey);
    const replay = await service.createTask(userId, { title: "Ship M1", project_id: firstProject.data.id, priority: "high", due_date: "2026-09-22" }, createKey);
    assert.equal(replay.replayed, true);
    assert.equal(replay.data.id, created.data.id);
    assert.equal(await prisma.task.count({ where: { id: created.data.id } }), 1);
    assert.equal(await prisma.taskEvent.count({ where: { task_id: created.data.id } }), 1);

    await assert.rejects(
      service.setProjectStatus(userId, firstProject.data.id, { version: firstProject.data.version, status: "completed" }),
      (error: unknown) => error instanceof WorkError && error.code === "RESOURCE_IN_USE",
    );

    const noOp = await service.patchTask(userId, created.data.id, { version: 1, title: "Ship M1" });
    assert.equal(noOp.version, 1);
    assert.equal(await prisma.taskEvent.count({ where: { task_id: created.data.id } }), 1);

    const doneOnce = await service.setTaskStatus(userId, created.data.id, { version: 1, status: "done" });
    const doneNoOp = await service.setTaskStatus(userId, created.data.id, { version: doneOnce.version, status: "done" });
    assert.equal(doneNoOp.version, doneOnce.version);
    assert.equal(await prisma.taskEvent.count({ where: { task_id: created.data.id } }), 2);
    const reopened = await service.setTaskStatus(userId, created.data.id, { version: doneOnce.version, status: "todo" });
    const moved = await service.patchTask(userId, created.data.id, { version: reopened.version, project_id: secondProject.data.id, title: "Ship M1 renamed" });
    const doneTwice = await service.setTaskStatus(userId, created.data.id, { version: moved.version, status: "done" });
    assert.ok(doneTwice.completed_at);

    const history = await service.listTaskEvents(userId, created.data.id, { from: "2026-09-01", to: "2026-09-30", page: 1, pageSize: 100 });
    assert.deepEqual(history.data.map((event) => event.event_type), ["created", "status_changed", "status_changed", "project_changed", "status_changed"]);
    const completions = history.data.filter((event) => event.event_type === "status_changed" && event.to_status === "done");
    assert.equal(completions.length, 2);
    assert.equal(completions[0].project_id_at_event, firstProject.data.id);
    assert.equal(completions[0].task_title_snapshot, "Ship M1");
    assert.equal(completions[1].project_id_at_event, secondProject.data.id);
    assert.equal(completions[1].task_title_snapshot, "Ship M1 renamed");

    const renamedProject = await service.patchProject(userId, firstProject.data.id, { version: firstProject.data.version, name: "First project renamed" });
    const historyAfterRename = await service.listTaskEvents(userId, created.data.id, { from: "2026-09-01", to: "2026-09-30", page: 1, pageSize: 100 });
    assert.equal(historyAfterRename.data.find((event) => event.to_status === "done")?.project_name_snapshot, "First project");
    const archivedProject = await service.setProjectStatus(userId, firstProject.data.id, { version: renamedProject.version, status: "archived" });
    assert.equal(archivedProject.status, "archived");
    assert.equal((await service.getTask(userId, created.data.id)).project_id, secondProject.data.id);
    assert.equal((await service.getProject(userId, secondProject.data.id)).progress_percent, 100);

    await assert.rejects(
      service.setTaskStatus(userId, created.data.id, { version: 1, status: "todo" }),
      (error: unknown) => error instanceof WorkError && error.code === "VERSION_CONFLICT",
    );

    const other = await prisma.user.create({ data: { email: `other-${suffix}@example.invalid`, name: "Other" } });
    try {
      await assert.rejects(
        service.getTask(other.id, created.data.id),
        (error: unknown) => error instanceof WorkError && error.code === "NOT_FOUND",
      );
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  await t.test("M2 persists habits, Timebox plans, and server-authoritative Pomodoro state", async () => {
    assert.ok(userId);
    let current = new Date("2026-09-21T06:00:00.000Z");
    const service = createPrismaM2Service(prisma, { now: () => current });
    const work = createPrismaM1Service(prisma, { now: () => current });

    const habit = await service.createHabit(userId, { name: "Read daily", start_date: "2026-09-21", weekdays: [1, 2, 3, 4, 5, 6, 7] }, `habit-${randomUUID()}`);
    const checkIn = await service.setHabitCheckIn(userId, habit.data.id, "2026-09-21");
    assert.equal(checkIn.date, "2026-09-21");
    assert.equal((await service.setHabitCheckIn(userId, habit.data.id, "2026-09-21")).id, checkIn.id);
    const scheduled = await service.setHabitSchedule(userId, habit.data.id, { version: habit.data.version, weekdays: [1, 3, 5] }, `schedule-${randomUUID()}`);
    assert.equal(scheduled.data.version, 2);
    assert.equal((await service.listHabitSchedules(userId, habit.data.id)).data.length, 2);

    const timebox = await service.createTimebox(userId, { kind: "habit", title: "Read", starts_at: "2026-09-21T12:00:00.000Z", ends_at: "2026-09-21T12:30:00.000Z", habit_id: habit.data.id }, `timebox-${randomUUID()}`);
    assert.equal((await service.listTimebox(userId, { date: "2026-09-21", status: "planned", page: 1, pageSize: 25 })).data[0]?.id, timebox.data.id);
    assert.equal((await service.cancelTimebox(userId, timebox.data.id, timebox.data.version)).status, "cancelled");

    const task = await work.createTask(userId, { title: "Focused task" }, `m2-task-${randomUUID()}`);
    const initial = await service.getPomodoroActive(userId);
    const started = await service.startPomodoro(userId, { state_version: initial.data.state.version, task_id: task.data.id }, `pomo-${randomUUID()}`);
    assert.equal(started.data.session?.status, "running");
    current = new Date("2026-09-21T06:05:00.000Z");
    const paused = await service.pausePomodoro(userId, started.data.session!.id, started.data.session!.version);
    assert.equal(paused.data.session?.remaining_seconds, 1200);
    current = new Date("2026-09-21T06:20:00.000Z");
    const resumed = await service.resumePomodoro(userId, paused.data.session!.id, paused.data.session!.version);
    assert.equal(resumed.data.session?.due_at, "2026-09-21T06:40:00.000Z");
    await assert.rejects(
      work.setTaskStatus(userId, task.data.id, { version: task.data.version, status: "done" }),
      (error: unknown) => error instanceof WorkError && error.code === "POMODORO_IN_PROGRESS",
    );
    current = new Date("2026-09-21T06:40:01.000Z");
    const completed = await service.getPomodoroActive(userId);
    assert.equal(completed.data.session, null);
    assert.equal(completed.data.today.completed_focus_count, 1);
    assert.equal(completed.data.state.next_phase, "short_break");
    const completedSession = (await service.listPomodoroSessions(userId, { from: "2026-09-21", to: "2026-09-21", page: 1, pageSize: 25 })).data.find((item) => item.status === "completed");
    assert.equal(completedSession?.active_duration_ms, 1_500_000);
    const breakStarted = await service.startPomodoro(userId, { state_version: completed.data.state.version }, `break-${randomUUID()}`);
    const cancelled = await service.cancelPomodoro(userId, breakStarted.data.session!.id, breakStarted.data.session!.version);
    assert.equal(cancelled.data.state.next_phase, "focus");

    current = new Date("2026-09-21T06:41:00.000Z");
    const secondFocus = await service.startPomodoro(userId, { state_version: cancelled.data.state.version }, `pomo-${randomUUID()}`);
    current = new Date("2026-09-21T07:06:01.000Z");
    const [reconciledA, reconciledB] = await Promise.all([service.getPomodoroActive(userId), service.getPomodoroActive(userId)]);
    assert.equal(reconciledA.data.today.completed_focus_count, 2);
    assert.equal(reconciledB.data.today.completed_focus_count, 2);
    assert.equal(await prisma.pomodoroSession.count({ where: { id: secondFocus.data.session!.id, status: "completed" } }), 1);

    const originalDayId = reconciledA.data.today.id;
    current = new Date("2026-09-21T10:00:00.000Z");
    await prisma.user.update({ where: { id: userId }, data: { timezone: "Pacific/Kiritimati" } });
    const nextZoneDay = await service.getPomodoroActive(userId);
    assert.equal(nextZoneDay.data.today.cycle_date, "2026-09-22");
    await prisma.user.update({ where: { id: userId }, data: { timezone: "Asia/Jakarta" } });
    const reusedDay = await service.getPomodoroActive(userId);
    assert.equal(reusedDay.data.today.id, originalDayId);
    assert.equal(reusedDay.data.today.completed_focus_count, 2);

    current = new Date("2026-09-21T16:50:00.000Z");
    const overnight = await service.startPomodoro(userId, { state_version: reusedDay.data.state.version }, `overnight-${randomUUID()}`);
    current = new Date("2026-09-21T17:15:01.000Z");
    assert.equal(await service.reconcileDueSessions(), 1);
    const afterMidnight = await service.getPomodoroActive(userId);
    assert.equal(afterMidnight.data.today.cycle_date, "2026-09-22");
    assert.equal(afterMidnight.data.today.completed_focus_count, 0);
    const overnightDetail = await service.getPomodoroSession(userId, overnight.data.session!.id);
    assert.equal(overnightDetail.data.cycle_date, "2026-09-21");
    assert.equal(overnightDetail.data.status, "completed");
    const sessions = await service.listPomodoroSessions(userId, { from: "2026-09-21", to: "2026-09-21", page: 1, pageSize: 25 });
    assert.deepEqual(sessions.data.map((item) => item.status).sort(), ["cancelled", "completed", "completed", "completed"]);
  });

  await t.test("M3 keeps balances, transfers, revisions, and budgets atomic", async () => {
    assert.ok(userId);
    const now = new Date("2026-09-21T08:00:00.000Z");
    const service = createPrismaM3Service(prisma, { now: () => now });

    const sourceKey = `account-${randomUUID()}`;
    const source = await service.createAccount(userId, { name: "Primary", type: "bank", opening_balance: "1000000" }, sourceKey);
    const sourceReplay = await service.createAccount(userId, { name: "Primary", type: "bank", opening_balance: "1000000" }, sourceKey);
    assert.equal(sourceReplay.replayed, true);
    assert.equal(sourceReplay.data.id, source.data.id);
    assert.equal(await prisma.financeAccountBalanceChange.count({ where: { account_id: source.data.id } }), 1);
    const destination = await service.createAccount(userId, { name: "Wallet", type: "ewallet", opening_balance: "100000" }, `account-${randomUUID()}`);

    const corrected = await service.patchAccount(userId, source.data.id, { version: source.data.version, opening_balance: "1200000" });
    assert.equal(corrected.balance, "1200000");
    assert.equal((await service.listBalanceChanges(userId, source.data.id, { page: 1, pageSize: 25 })).data.length, 2);

    const incomeCategory = await service.createCategory(userId, { name: "Salary", type: "income" }, `category-${randomUUID()}`);
    const expenseCategory = await service.createCategory(userId, { name: "Food", type: "expense" }, `category-${randomUUID()}`);
    const income = await service.createTransaction(userId, {
      type: "income", status: "posted", account_id: source.data.id, category_id: incomeCategory.data.id, amount: "500000", date: "2026-09-21",
    }, `transaction-${randomUUID()}`);
    assert.equal(income.data.status, "posted");

    const draft = await service.createTransaction(userId, {
      type: "expense", status: "draft", account_id: source.data.id, category_id: expenseCategory.data.id, amount: "200000", date: "2026-09-21",
    }, `transaction-${randomUUID()}`);
    assert.equal((await service.getAccount(userId, source.data.id)).balance, "1700000");
    const posted = await service.postTransaction(userId, draft.data.id, draft.data.version, `post-${randomUUID()}`);
    assert.equal(posted.data.status, "posted");
    assert.equal((await service.getAccount(userId, source.data.id)).balance, "1500000");

    const correctedExpense = await service.patchTransaction(userId, posted.data.id, { version: posted.data.version, amount: "250000" });
    assert.equal((await service.getAccount(userId, source.data.id)).balance, "1450000");
    assert.deepEqual((await service.listRevisions(userId, posted.data.id, { page: 1, pageSize: 25 })).data.map((item) => item.action), ["created", "posted", "edited"]);
    const voided = await service.voidTransaction(userId, correctedExpense.id, correctedExpense.version);
    assert.equal(voided.status, "void");
    assert.equal((await service.getAccount(userId, source.data.id)).balance, "1700000");
    await assert.rejects(service.patchTransaction(userId, voided.id, { version: voided.version, note: "cannot edit" }), (error: unknown) => error instanceof FinanceError && error.code === "INVALID_STATE");

    const transferKey = `transfer-${randomUUID()}`;
    const transferInput = { type: "transfer" as const, status: "posted" as const, account_id: source.data.id, to_account_id: destination.data.id, category_id: null, amount: "300000", date: "2026-09-21" };
    const [transferA, transferB] = await Promise.all([service.createTransaction(userId, transferInput, transferKey), service.createTransaction(userId, transferInput, transferKey)]);
    assert.equal([transferA.replayed, transferB.replayed].filter(Boolean).length, 1);
    assert.equal(await prisma.financeTransaction.count({ where: { id: transferA.data.id } }), 1);
    assert.equal((await service.getAccount(userId, source.data.id)).balance, "1400000");
    assert.equal((await service.getAccount(userId, destination.data.id)).balance, "400000");

    const expense = await service.createTransaction(userId, {
      type: "expense", status: "posted", account_id: source.data.id, category_id: expenseCategory.data.id, amount: "150000", date: "2026-09-21",
    }, `transaction-${randomUUID()}`);
    const budget = await service.createBudget(userId, { category_id: expenseCategory.data.id, month: "2026-09-01", limit_amount: "100000" }, `budget-${randomUUID()}`);
    assert.equal(budget.data.spent, "150000");
    assert.equal(budget.data.remaining, "-50000");
    const raised = await service.patchBudget(userId, budget.data.id, { version: budget.data.version, limit_amount: "200000" });
    assert.equal(raised.remaining, "50000");
    await service.deleteBudget(userId, raised.id, raised.version);
    assert.equal(await prisma.budget.count({ where: { id: raised.id } }), 0);
    assert.equal(await prisma.financeTransaction.count({ where: { id: expense.data.id } }), 1);

    const archivedCategory = await service.archiveCategory(userId, expenseCategory.data.id, expenseCategory.data.version);
    await assert.rejects(service.createTransaction(userId, {
      type: "expense", status: "posted", account_id: source.data.id, category_id: archivedCategory.id, amount: "1", date: "2026-09-21",
    }, `transaction-${randomUUID()}`), (error: unknown) => error instanceof FinanceError && error.code === "RESOURCE_ARCHIVED");

    const other = await prisma.user.create({ data: { email: `finance-other-${suffix}@example.invalid`, name: "Finance Other" } });
    try {
      await assert.rejects(service.getAccount(other.id, source.data.id), (error: unknown) => error instanceof FinanceError && error.code === "NOT_FOUND");
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
