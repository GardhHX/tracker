import {
  Prisma,
  type Habit,
  type HabitCheckIn,
  type HabitSchedule,
  type PomodoroDay,
  type PomodoroInterval,
  type PomodoroSession,
  type PomodoroState,
  type PrismaClient,
  type TimeboxEntry,
} from "../../generated/prisma/client.js";
import { createIdempotencyExecutor } from "../../lib/idempotency.js";
import { WorkError } from "../work/types.js";
import type {
  HabitCheckInDto,
  HabitDto,
  HabitScheduleDto,
  M2Service,
  PomodoroBundleDto,
  PomodoroDayDto,
  PomodoroIntervalDto,
  PomodoroResponse,
  PomodoroSessionDto,
  PomodoroStateDto,
  TimeboxDto,
  TimeboxInput,
} from "./types.js";

type Db = PrismaClient | Prisma.TransactionClient;
type Clock = () => Date;

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date | null) => value?.toISOString() ?? null;

function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(value: string, days: number) {
  const result = asDate(value);
  result.setUTCDate(result.getUTCDate() + days);
  return dateOnly(result);
}

function zonedStart(value: string, timeZone: string) {
  const wanted = Date.parse(`${value}T00:00:00.000Z`);
  let result = wanted;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(result));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
    result -= represented - wanted;
  }
  return new Date(result);
}

function weekday(value: string) {
  const day = asDate(value).getUTCDay();
  return day === 0 ? 7 : day;
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; timezone: string }>>`
    SELECT "id", "timezone" FROM "user" WHERE "id" = ${userId}::uuid FOR UPDATE
  `;
  if (!rows[0]) throw new WorkError(404, "NOT_FOUND", "User not found.");
  return rows[0];
}

function scheduleDto(value: HabitSchedule): HabitScheduleDto {
  return { id: value.id, habit_id: value.habit_id, effective_from: dateOnly(value.effective_from), weekdays: value.weekdays, created_at: value.created_at.toISOString() };
}

async function currentSchedule(db: Db, habit: Habit, today?: string) {
  const target = today ?? localDate(new Date(), habit.timezone);
  const row = await db.habitSchedule.findFirst({
    where: { habit_id: habit.id, effective_from: { lte: asDate(target < dateOnly(habit.start_date) ? dateOnly(habit.start_date) : target) } },
    orderBy: { effective_from: "desc" },
  });
  if (!row) throw new WorkError(500, "INTEGRITY_ERROR", "Habit schedule is missing.");
  return row;
}

async function habitDto(db: Db, value: Habit, today?: string): Promise<HabitDto> {
  return {
    id: value.id, version: value.version, created_at: value.created_at.toISOString(), updated_at: value.updated_at.toISOString(),
    name: value.name, start_date: dateOnly(value.start_date), timezone: value.timezone, archived_at: iso(value.archived_at),
    archived_on: value.archived_on ? dateOnly(value.archived_on) : null, current_schedule: scheduleDto(await currentSchedule(db, value, today)),
  };
}

function checkInDto(value: HabitCheckIn): HabitCheckInDto {
  return { id: value.id, habit_id: value.habit_id, date: dateOnly(value.date), checked_at: value.checked_at.toISOString(), created_at: value.created_at.toISOString() };
}

function timeboxDto(value: TimeboxEntry): TimeboxDto {
  return {
    id: value.id, version: value.version, created_at: value.created_at.toISOString(), updated_at: value.updated_at.toISOString(),
    kind: value.kind, title: value.title, starts_at: value.starts_at.toISOString(), ends_at: value.ends_at.toISOString(),
    task_id: value.task_id, habit_id: value.habit_id, status: value.status, cancelled_at: iso(value.cancelled_at),
  };
}

function dayDto(value: PomodoroDay): PomodoroDayDto {
  return {
    id: value.id, version: value.version, created_at: value.created_at.toISOString(), updated_at: value.updated_at.toISOString(),
    cycle_date: dateOnly(value.cycle_date), timezone: value.timezone, next_phase: value.next_phase,
    completed_focus_count: value.completed_focus_count,
  };
}

function stateDto(value: PomodoroState, day: PomodoroDay): PomodoroStateDto {
  return {
    cycle_day_id: day.id, cycle_date: dateOnly(day.cycle_date), timezone: day.timezone, next_phase: value.next_phase,
    completed_focus_count: value.completed_focus_count, version: value.version, updated_at: value.updated_at.toISOString(),
  };
}

function intervalDto(value: PomodoroInterval): PomodoroIntervalDto {
  return { id: value.id, session_id: value.session_id, started_at: value.started_at.toISOString(), ended_at: iso(value.ended_at) };
}

function activeDuration(intervals: PomodoroInterval[], session: PomodoroSession, serverNow: Date) {
  return intervals.reduce((total, interval) => {
    const end = interval.ended_at ?? (session.due_at && session.due_at < serverNow ? session.due_at : serverNow);
    return total + Math.max(0, end.getTime() - interval.started_at.getTime());
  }, 0);
}

function sessionDto(session: PomodoroSession, day: PomodoroDay, intervals: PomodoroInterval[], serverNow: Date): PomodoroSessionDto {
  const duration = activeDuration(intervals, session, serverNow);
  return {
    id: session.id, version: session.version, created_at: session.created_at.toISOString(), updated_at: session.updated_at.toISOString(),
    cycle_day_id: session.cycle_day_id, cycle_date: dateOnly(day.cycle_date), cycle_timezone: day.timezone,
    phase: session.phase, status: session.status, planned_seconds: session.planned_seconds, task_id: session.task_id,
    project_id_at_start: session.project_id_at_start, task_title_snapshot: session.task_title_snapshot,
    project_name_snapshot: session.project_name_snapshot, started_at: session.started_at.toISOString(), due_at: iso(session.due_at),
    ended_at: iso(session.ended_at), active_duration_ms: duration,
    remaining_seconds: session.status === "running" || session.status === "paused" ? Math.ceil(Math.max(0, session.planned_seconds * 1000 - duration) / 1000) : 0,
  };
}

async function ownedHabit(db: Db, userId: string, id: string) {
  const value = await db.habit.findFirst({ where: { id, user_id: userId } });
  if (!value) throw new WorkError(404, "NOT_FOUND", "Habit not found.");
  return value;
}

async function ownedTimebox(db: Db, userId: string, id: string) {
  const value = await db.timeboxEntry.findFirst({ where: { id, user_id: userId } });
  if (!value) throw new WorkError(404, "NOT_FOUND", "Timebox entry not found.");
  return value;
}

async function ownedSession(db: Db, userId: string, id: string) {
  const value = await db.pomodoroSession.findFirst({ where: { id, user_id: userId } });
  if (!value) throw new WorkError(404, "NOT_FOUND", "Pomodoro session not found.");
  return value;
}

function assertVersion(actual: number, expected: number) {
  if (actual !== expected) throw new WorkError(409, "VERSION_CONFLICT", "The resource changed. Refresh and try again.");
}

async function ensureDay(tx: Prisma.TransactionClient, userId: string, date: string, timezone: string) {
  return tx.pomodoroDay.upsert({
    where: { user_id_cycle_date: { user_id: userId, cycle_date: asDate(date) } },
    create: { user_id: userId, cycle_date: asDate(date), timezone },
    update: {},
  });
}

async function syncIdleState(tx: Prisma.TransactionClient, userId: string, timezone: string, serverNow: Date) {
  const open = await tx.pomodoroSession.findFirst({ where: { user_id: userId, status: { in: ["running", "paused"] } } });
  const state = await tx.pomodoroState.findUnique({ where: { user_id: userId } });
  if (!state) throw new WorkError(500, "INTEGRITY_ERROR", "Pomodoro state is missing.");
  if (open) {
    const day = await tx.pomodoroDay.findUnique({ where: { id: open.cycle_day_id } });
    if (!day) throw new WorkError(500, "INTEGRITY_ERROR", "Pomodoro day is missing.");
    return { state, day };
  }
  const day = await ensureDay(tx, userId, localDate(serverNow, timezone), timezone);
  if (state.cycle_day_id === day.id && state.next_phase === day.next_phase && state.completed_focus_count === day.completed_focus_count) return { state, day };
  const updated = await tx.pomodoroState.update({ where: { user_id: userId }, data: { cycle_day_id: day.id, next_phase: day.next_phase, completed_focus_count: day.completed_focus_count, version: { increment: 1 } } });
  return { state: updated, day };
}

export async function reconcilePomodoroForUser(tx: Prisma.TransactionClient, userId: string, serverNow: Date) {
  const user = await lockUser(tx, userId);
  const open = await tx.pomodoroSession.findFirst({ where: { user_id: userId, status: { in: ["running", "paused"] } } });
  if (open?.status === "running" && open.due_at && open.due_at <= serverNow) {
    const endedAt = open.due_at;
    await tx.pomodoroInterval.updateMany({ where: { session_id: open.id, ended_at: null }, data: { ended_at: endedAt } });
    await tx.pomodoroSession.update({ where: { id: open.id }, data: { status: "completed", due_at: null, ended_at: endedAt, version: { increment: 1 } } });
    const day = await tx.pomodoroDay.findUnique({ where: { id: open.cycle_day_id } });
    if (!day) throw new WorkError(500, "INTEGRITY_ERROR", "Pomodoro day is missing.");
    const count = day.completed_focus_count + (open.phase === "focus" ? 1 : 0);
    const next = open.phase === "focus" ? (count % 4 === 0 ? "long_break" : "short_break") : "focus";
    const updatedDay = await tx.pomodoroDay.update({ where: { id: day.id }, data: { completed_focus_count: count, next_phase: next, version: { increment: 1 } } });
    const state = await tx.pomodoroState.findUnique({ where: { user_id: userId } });
    if (state?.cycle_day_id === day.id) await tx.pomodoroState.update({ where: { user_id: userId }, data: { completed_focus_count: updatedDay.completed_focus_count, next_phase: updatedDay.next_phase, version: { increment: 1 } } });
  }
  await syncIdleState(tx, userId, user.timezone, serverNow);
}

async function bundle(tx: Prisma.TransactionClient, userId: string, serverNow: Date): Promise<PomodoroBundleDto> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new WorkError(404, "NOT_FOUND", "User not found.");
  const { state, day: stateDay } = await syncIdleState(tx, userId, user.timezone, serverNow);
  const today = await ensureDay(tx, userId, localDate(serverNow, user.timezone), user.timezone);
  const session = await tx.pomodoroSession.findFirst({ where: { user_id: userId, status: { in: ["running", "paused"] } } });
  let sessionValue: PomodoroSessionDto | null = null;
  if (session) {
    const sessionDay = await tx.pomodoroDay.findUnique({ where: { id: session.cycle_day_id } });
    const intervals = await tx.pomodoroInterval.findMany({ where: { session_id: session.id }, orderBy: { started_at: "asc" } });
    if (!sessionDay) throw new WorkError(500, "INTEGRITY_ERROR", "Pomodoro day is missing.");
    sessionValue = sessionDto(session, sessionDay, intervals, serverNow);
  }
  return { state: stateDto(state, stateDay), today: dayDto(today), session: sessionValue };
}

async function assertLinkableTask(db: Db, userId: string, id: string) {
  const task = await db.task.findFirst({ where: { id, user_id: userId }, include: { project: true } });
  if (!task) throw new WorkError(404, "NOT_FOUND", "Task not found.");
  if (task.archived_at || task.status === "done" || (task.project && task.project.status !== "active")) throw new WorkError(409, "INVALID_STATE", "Only an open task in an active project can be linked.");
  return task;
}

async function assertLinkableHabit(db: Db, userId: string, id: string) {
  const habit = await ownedHabit(db, userId, id);
  if (habit.archived_at) throw new WorkError(409, "INVALID_STATE", "An archived habit cannot be linked.");
  return habit;
}

function validateTimeboxShape(input: TimeboxInput) {
  const start = new Date(input.starts_at);
  const end = new Date(input.ends_at);
  if (end <= start) throw new WorkError(422, "VALIDATION_ERROR", "End time must be after start time.");
  if (input.kind === "focus" && end.getTime() - start.getTime() !== 1_500_000) throw new WorkError(422, "VALIDATION_ERROR", "Focus timeboxes must last 25 minutes.");
  const task = input.task_id ?? null;
  const habit = input.habit_id ?? null;
  const valid = (input.kind === "class" && !task && !habit) || (input.kind === "task" && !!task && !habit) || (input.kind === "habit" && !task && !!habit) || (input.kind === "focus" && !habit);
  if (!valid) throw new WorkError(422, "VALIDATION_ERROR", "The timebox link does not match its kind.");
  return { start, end, task, habit };
}

export function createPrismaM2Service(db: PrismaClient, options: { now?: Clock } = {}): M2Service {
  const now = options.now ?? (() => new Date());
  const executeIdempotent = createIdempotencyExecutor(db, { now });

  return {
    async listHabits(userId, query) {
      const where: Prisma.HabitWhereInput = { user_id: userId, ...(query.archived === "all" ? {} : query.archived ? { archived_at: { not: null } } : { archived_at: null }) };
      const [rows, total] = await Promise.all([
        db.habit.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.habit.count({ where }),
      ]);
      return { data: await Promise.all(rows.map((row) => habitDto(db, row))), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async getHabit(userId, id) { return habitDto(db, await ownedHabit(db, userId, id)); },

    async createHabit(userId, input, key) {
      const result = await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/habits", requestBody: input }, async (tx) => {
        const user = await lockUser(tx, userId);
        const habit = await tx.habit.create({ data: { user_id: userId, name: input.name, start_date: asDate(input.start_date), timezone: user.timezone } });
        await tx.habitSchedule.create({ data: { user_id: userId, habit_id: habit.id, effective_from: habit.start_date, weekdays: [...input.weekdays].sort() } });
        return { status: 201, body: { data: await habitDto(tx, habit, localDate(now(), user.timezone)) } as unknown as Prisma.InputJsonObject };
      });
      return { data: (result.body as unknown as { data: HabitDto }).data, status: result.status, replayed: result.replayed };
    },

    async patchHabit(userId, id, input) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const current = await ownedHabit(tx, userId, id);
        assertVersion(current.version, input.version);
        if (current.archived_at) throw new WorkError(409, "INVALID_STATE", "Archived habits cannot be edited.");
        if (current.name === input.name) return habitDto(tx, current);
        const updated = await tx.habit.update({ where: { id }, data: { name: input.name, version: { increment: 1 } } });
        return habitDto(tx, updated);
      });
    },

    async listHabitSchedules(userId, id) {
      await ownedHabit(db, userId, id);
      const rows = await db.habitSchedule.findMany({ where: { habit_id: id, user_id: userId }, orderBy: { effective_from: "asc" } });
      return { data: rows.map(scheduleDto), meta: { page: 1, page_size: rows.length, total: rows.length } };
    },

    async setHabitSchedule(userId, id, input, key) {
      const result = await executeIdempotent({ userId, key, method: "POST", route: `/api/v1/habits/${id}/schedules`, requestBody: input }, async (tx) => {
        const user = await lockUser(tx, userId);
        const habit = await ownedHabit(tx, userId, id);
        assertVersion(habit.version, input.version);
        if (habit.archived_at) throw new WorkError(409, "INVALID_STATE", "Archived habits cannot change schedule.");
        const effective = addDays(localDate(now(), habit.timezone), 1);
        const weekdays = [...input.weekdays].sort();
        const existing = await tx.habitSchedule.findUnique({ where: { habit_id_effective_from: { habit_id: id, effective_from: asDate(effective) } } });
        if (existing && existing.weekdays.join(",") === weekdays.join(",")) return { status: 200, body: { data: await habitDto(tx, habit, localDate(now(), user.timezone)) } as unknown as Prisma.InputJsonObject };
        await tx.habitSchedule.upsert({ where: { habit_id_effective_from: { habit_id: id, effective_from: asDate(effective) } }, create: { user_id: userId, habit_id: id, effective_from: asDate(effective), weekdays }, update: { weekdays } });
        const updated = await tx.habit.update({ where: { id }, data: { version: { increment: 1 } } });
        return { status: existing ? 200 : 201, body: { data: await habitDto(tx, updated, localDate(now(), user.timezone)) } as unknown as Prisma.InputJsonObject };
      });
      return { data: (result.body as unknown as { data: HabitDto }).data, status: result.status, replayed: result.replayed };
    },

    async archiveHabit(userId, id, version) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const habit = await ownedHabit(tx, userId, id);
        assertVersion(habit.version, version);
        if (habit.archived_at) return habitDto(tx, habit);
        const timestamp = now();
        const updated = await tx.habit.update({ where: { id }, data: { archived_at: timestamp, archived_on: asDate(localDate(timestamp, habit.timezone)), version: { increment: 1 } } });
        return habitDto(tx, updated);
      });
    },

    async listHabitCheckIns(userId, id, query) {
      const habit = await ownedHabit(db, userId, id);
      const today = localDate(now(), habit.timezone);
      const from = query.from ?? `${today.slice(0, 8)}01`;
      const to = query.to ?? today;
      const where = { user_id: userId, habit_id: id, date: { gte: asDate(from), lte: asDate(to) } };
      const [rows, total] = await Promise.all([
        db.habitCheckIn.findMany({ where, orderBy: [{ date: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.habitCheckIn.count({ where }),
      ]);
      return { data: rows.map(checkInDto), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async setHabitCheckIn(userId, id, date) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const habit = await ownedHabit(tx, userId, id);
        const today = localDate(now(), habit.timezone);
        if (date < dateOnly(habit.start_date) || date > today || (habit.archived_on && date > dateOnly(habit.archived_on))) throw new WorkError(422, "INVALID_STATE", "This date is outside the habit calendar.");
        const schedule = await currentSchedule(tx, habit, date);
        if (!schedule.weekdays.includes(weekday(date))) throw new WorkError(422, "INVALID_STATE", "This date is not scheduled for the habit.");
        const value = await tx.habitCheckIn.upsert({ where: { habit_id_date: { habit_id: id, date: asDate(date) } }, create: { user_id: userId, habit_id: id, date: asDate(date), checked_at: now() }, update: {} });
        return checkInDto(value);
      });
    },

    async deleteHabitCheckIn(userId, id, date) {
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const habit = await ownedHabit(tx, userId, id);
        const today = localDate(now(), habit.timezone);
        if (date < dateOnly(habit.start_date) || date > today || (habit.archived_on && date > dateOnly(habit.archived_on))) throw new WorkError(422, "INVALID_STATE", "This date is outside the habit calendar.");
        const schedule = await currentSchedule(tx, habit, date);
        if (!schedule.weekdays.includes(weekday(date))) throw new WorkError(422, "INVALID_STATE", "This date is not scheduled for the habit.");
        await tx.habitCheckIn.deleteMany({ where: { user_id: userId, habit_id: id, date: asDate(date) } });
      });
    },

    async listTimebox(userId, query) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new WorkError(404, "NOT_FOUND", "User not found.");
      const date = query.date ?? localDate(now(), user.timezone);
      const from = zonedStart(date, user.timezone);
      const to = zonedStart(addDays(date, 1), user.timezone);
      const where: Prisma.TimeboxEntryWhereInput = { user_id: userId, starts_at: { lt: to }, ends_at: { gt: from }, ...(query.status === "all" ? {} : { status: query.status }) };
      const [rows, total] = await Promise.all([
        db.timeboxEntry.findMany({ where, orderBy: [{ starts_at: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.timeboxEntry.count({ where }),
      ]);
      return { data: rows.map(timeboxDto), meta: { page: query.page, page_size: query.pageSize, total, date, timezone: user.timezone } };
    },

    async getTimebox(userId, id) { return timeboxDto(await ownedTimebox(db, userId, id)); },

    async createTimebox(userId, input, key) {
      const shape = validateTimeboxShape(input);
      const result = await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/timebox", requestBody: input }, async (tx) => {
        await lockUser(tx, userId);
        if (shape.task) await assertLinkableTask(tx, userId, shape.task);
        if (shape.habit) await assertLinkableHabit(tx, userId, shape.habit);
        const value = await tx.timeboxEntry.create({ data: { user_id: userId, kind: input.kind, title: input.title, starts_at: shape.start, ends_at: shape.end, task_id: shape.task, habit_id: shape.habit } });
        return { status: 201, body: { data: timeboxDto(value) } as unknown as Prisma.InputJsonObject };
      });
      return { data: (result.body as unknown as { data: TimeboxDto }).data, status: result.status, replayed: result.replayed };
    },

    async patchTimebox(userId, id, input) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const current = await ownedTimebox(tx, userId, id);
        assertVersion(current.version, input.version);
        if (current.status === "cancelled") throw new WorkError(409, "INVALID_STATE", "Cancelled timeboxes cannot be edited.");
        const next: TimeboxInput = { kind: input.kind ?? current.kind, title: input.title ?? current.title, starts_at: input.starts_at ?? current.starts_at.toISOString(), ends_at: input.ends_at ?? current.ends_at.toISOString(), task_id: input.task_id === undefined ? current.task_id : input.task_id, habit_id: input.habit_id === undefined ? current.habit_id : input.habit_id };
        const shape = validateTimeboxShape(next);
        if (shape.task && shape.task !== current.task_id) await assertLinkableTask(tx, userId, shape.task);
        if (shape.habit && shape.habit !== current.habit_id) await assertLinkableHabit(tx, userId, shape.habit);
        const same = next.kind === current.kind && next.title === current.title && shape.start.getTime() === current.starts_at.getTime() && shape.end.getTime() === current.ends_at.getTime() && shape.task === current.task_id && shape.habit === current.habit_id;
        if (same) return timeboxDto(current);
        const updated = await tx.timeboxEntry.update({ where: { id }, data: { kind: next.kind, title: next.title, starts_at: shape.start, ends_at: shape.end, task_id: shape.task, habit_id: shape.habit, version: { increment: 1 } } });
        return timeboxDto(updated);
      });
    },

    async cancelTimebox(userId, id, version) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const current = await ownedTimebox(tx, userId, id);
        assertVersion(current.version, version);
        if (current.status === "cancelled") return timeboxDto(current);
        return timeboxDto(await tx.timeboxEntry.update({ where: { id }, data: { status: "cancelled", cancelled_at: now(), version: { increment: 1 } } }));
      });
    },

    async getPomodoroActive(userId) {
      const serverNow = now();
      const data = await db.$transaction(async (tx) => { await reconcilePomodoroForUser(tx, userId, serverNow); return bundle(tx, userId, serverNow); });
      return { data, meta: { server_now: serverNow.toISOString() } };
    },

    async startPomodoro(userId, input, key) {
      const serverNow = now();
      const result = await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/pomodoro/start", requestBody: input }, async (tx) => {
        await reconcilePomodoroForUser(tx, userId, serverNow);
        const open = await tx.pomodoroSession.findFirst({ where: { user_id: userId, status: { in: ["running", "paused"] } } });
        if (open) throw new WorkError(409, "POMODORO_ALREADY_ACTIVE", "Finish or cancel the active Pomodoro first.");
        const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
        if (!user) throw new WorkError(404, "NOT_FOUND", "User not found.");
        const { state, day } = await syncIdleState(tx, userId, user.timezone, serverNow);
        assertVersion(state.version, input.state_version);
        let task: Awaited<ReturnType<typeof assertLinkableTask>> | null = null;
        if (state.next_phase === "focus" && input.task_id) task = await assertLinkableTask(tx, userId, input.task_id);
        if (state.next_phase !== "focus" && input.task_id) throw new WorkError(422, "VALIDATION_ERROR", "Break sessions cannot link a task.");
        const seconds = state.next_phase === "focus" ? 1500 : state.next_phase === "short_break" ? 300 : 900;
        const project = task?.project_id ? await tx.project.findUnique({ where: { id: task.project_id } }) : null;
        const session = await tx.pomodoroSession.create({ data: { user_id: userId, cycle_day_id: day.id, phase: state.next_phase, status: "running", planned_seconds: seconds, task_id: task?.id ?? null, project_id_at_start: task?.project_id ?? null, task_title_snapshot: task?.title ?? null, project_name_snapshot: project?.name ?? null, started_at: serverNow, due_at: new Date(serverNow.getTime() + seconds * 1000) } });
        await tx.pomodoroInterval.create({ data: { user_id: userId, session_id: session.id, started_at: serverNow } });
        return { status: 201, body: { data: await bundle(tx, userId, serverNow), meta: { server_now: serverNow.toISOString() } } as unknown as Prisma.InputJsonObject };
      });
      const body = result.body as unknown as { data: PomodoroBundleDto; meta: { server_now: string } };
      return { ...body, status: result.status, replayed: result.replayed };
    },

    async pausePomodoro(userId, id, version) {
      const serverNow = now();
      return db.$transaction(async (tx): Promise<PomodoroResponse> => {
        await reconcilePomodoroForUser(tx, userId, serverNow);
        const session = await ownedSession(tx, userId, id);
        assertVersion(session.version, version);
        if (session.status === "paused") return { data: await bundle(tx, userId, serverNow), meta: { server_now: serverNow.toISOString() } };
        if (session.status !== "running") throw new WorkError(409, "INVALID_STATE", "Only a running session can be paused.");
        await tx.pomodoroInterval.updateMany({ where: { session_id: id, ended_at: null }, data: { ended_at: serverNow } });
        await tx.pomodoroSession.update({ where: { id }, data: { status: "paused", due_at: null, version: { increment: 1 } } });
        return { data: await bundle(tx, userId, serverNow), meta: { server_now: serverNow.toISOString() } };
      });
    },

    async resumePomodoro(userId, id, version) {
      const serverNow = now();
      return db.$transaction(async (tx): Promise<PomodoroResponse> => {
        await reconcilePomodoroForUser(tx, userId, serverNow);
        const session = await ownedSession(tx, userId, id);
        assertVersion(session.version, version);
        if (session.status === "running") return { data: await bundle(tx, userId, serverNow), meta: { server_now: serverNow.toISOString() } };
        if (session.status !== "paused") throw new WorkError(409, "INVALID_STATE", "Only a paused session can be resumed.");
        const intervals = await tx.pomodoroInterval.findMany({ where: { session_id: id } });
        const remaining = Math.max(0, session.planned_seconds * 1000 - activeDuration(intervals, session, serverNow));
        await tx.pomodoroSession.update({ where: { id }, data: { status: "running", due_at: new Date(serverNow.getTime() + remaining), version: { increment: 1 } } });
        await tx.pomodoroInterval.create({ data: { user_id: userId, session_id: id, started_at: serverNow } });
        return { data: await bundle(tx, userId, serverNow), meta: { server_now: serverNow.toISOString() } };
      });
    },

    async cancelPomodoro(userId, id, version) {
      const serverNow = now();
      return db.$transaction(async (tx): Promise<PomodoroResponse> => {
        await reconcilePomodoroForUser(tx, userId, serverNow);
        const session = await ownedSession(tx, userId, id);
        assertVersion(session.version, version);
        if (session.status === "cancelled") return { data: await bundle(tx, userId, serverNow), meta: { server_now: serverNow.toISOString() } };
        if (session.status === "completed") throw new WorkError(409, "INVALID_STATE", "Completed sessions cannot be cancelled.");
        await tx.pomodoroInterval.updateMany({ where: { session_id: id, ended_at: null }, data: { ended_at: serverNow } });
        await tx.pomodoroSession.update({ where: { id }, data: { status: "cancelled", due_at: null, ended_at: serverNow, version: { increment: 1 } } });
        const day = await tx.pomodoroDay.update({ where: { id: session.cycle_day_id }, data: { next_phase: "focus", version: { increment: 1 } } });
        const state = await tx.pomodoroState.findUnique({ where: { user_id: userId } });
        if (state?.cycle_day_id === day.id) await tx.pomodoroState.update({ where: { user_id: userId }, data: { next_phase: "focus", version: { increment: 1 } } });
        await reconcilePomodoroForUser(tx, userId, serverNow);
        return { data: await bundle(tx, userId, serverNow), meta: { server_now: serverNow.toISOString() } };
      });
    },

    async listPomodoroSessions(userId, query) {
      await db.$transaction((tx) => reconcilePomodoroForUser(tx, userId, now()));
      const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new WorkError(404, "NOT_FOUND", "User not found.");
      const today = localDate(now(), user.timezone);
      const from = query.from ?? `${today.slice(0, 8)}01`;
      const to = query.to ?? today;
      const where: Prisma.PomodoroSessionWhereInput = { user_id: userId, started_at: { gte: zonedStart(from, user.timezone), lt: zonedStart(addDays(to, 1), user.timezone) }, ...(query.phase ? { phase: query.phase } : {}), ...(query.status ? { status: query.status } : {}), ...(query.taskId ? { task_id: query.taskId } : {}), ...(query.projectId ? { project_id_at_start: query.projectId } : {}) };
      const [rows, total] = await Promise.all([
        db.pomodoroSession.findMany({ where, include: { cycle_day: true, intervals: true }, orderBy: [{ started_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.pomodoroSession.count({ where }),
      ]);
      const serverNow = now();
      return { data: rows.map((row) => sessionDto(row, row.cycle_day, row.intervals, serverNow)), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async getPomodoroSession(userId, id) {
      const serverNow = now();
      await db.$transaction((tx) => reconcilePomodoroForUser(tx, userId, serverNow));
      const session = await db.pomodoroSession.findFirst({ where: { id, user_id: userId }, include: { cycle_day: true, intervals: { orderBy: { started_at: "asc" } } } });
      if (!session) throw new WorkError(404, "NOT_FOUND", "Pomodoro session not found.");
      return { data: { ...sessionDto(session, session.cycle_day, session.intervals, serverNow), intervals: session.intervals.map(intervalDto) }, meta: { server_now: serverNow.toISOString() } };
    },

    async reconcileDueSessions(limit = 100) {
      const due = await db.pomodoroSession.findMany({ where: { status: "running", due_at: { lte: now() } }, select: { user_id: true }, distinct: ["user_id"], take: limit });
      let count = 0;
      for (const item of due) {
        const serverNow = now();
        await db.$transaction(async (tx) => { await reconcilePomodoroForUser(tx, item.user_id, serverNow); });
        count += 1;
      }
      return count;
    },
  };
}
