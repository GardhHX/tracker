import { type PrismaClient } from "../../generated/prisma/client.js";
import type { BudgetReport, CsvExport, FinanceReport, HabitReport, M5Service, PomodoroReport, ReportRange, TaskReport } from "./types.js";
import { M5Error } from "./types.js";

type Clock = () => Date;
type ResolvedRange = ReportRange & { start: Date; end: Date };

const MAX_EXPORT_ROWS = 10_000;
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = asDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
};
const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const nextMonth = (value: string) => {
  const date = asDate(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return dateOnly(date);
};

function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
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

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = asDate(value);
  return !Number.isNaN(parsed.getTime()) && dateOnly(parsed) === value;
}

function weekday(value: string) {
  const day = asDate(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function overlapMs(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  return Math.max(0, Math.min(end.getTime(), rangeEnd.getTime()) - Math.max(start.getTime(), rangeStart.getTime()));
}

function csvCell(value: string | number | boolean | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function enforceExportLimit(rows: unknown[]) {
  if (rows.length > MAX_EXPORT_ROWS) throw new M5Error(422, "EXPORT_TOO_LARGE", "Export is limited to 10000 rows. Narrow the date range and try again.");
}

export function createPrismaM5Service(db: PrismaClient, options: { now?: Clock } = {}): M5Service {
  const now = options.now ?? (() => new Date());

  async function resolveRange(userId: string, input: { from?: string; to?: string }): Promise<ResolvedRange> {
    if ((input.from && !input.to) || (!input.from && input.to)) throw new M5Error(422, "INVALID_QUERY", "from and to must be provided together.");
    const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    if (!user) throw new M5Error(404, "NOT_FOUND", "User not found.");
    const today = localDate(now(), user.timezone);
    const from = input.from ?? monthStart(today);
    const to = input.to ?? today;
    if (!validDate(from) || !validDate(to) || from > to) throw new M5Error(422, "INVALID_QUERY", "from and to must be a valid date pair.");
    if (to > today) throw new M5Error(422, "FUTURE_RANGE", "Reports cannot include dates after today.");
    if ((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000 >= 366) throw new M5Error(422, "RANGE_TOO_LARGE", "Date range cannot exceed 366 days.");
    return { from, to, timezone: user.timezone, start: zonedStart(from, user.timezone), end: zonedStart(addDays(to, 1), user.timezone) };
  }

  async function ownedProject(userId: string, projectId: string) {
    const project = await db.project.findFirst({ where: { user_id: userId, id: projectId }, select: { id: true } });
    if (!project) throw new M5Error(404, "NOT_FOUND", "Project not found.");
  }

  async function taskRows(userId: string, range: ResolvedRange, projectId?: string) {
    return db.taskEvent.findMany({
      where: { user_id: userId, event_type: "status_changed", to_status: "done", occurred_at: { gte: range.start, lt: range.end }, ...(projectId ? { project_id_at_event: projectId } : {}) },
      orderBy: [{ occurred_at: "asc" }, { id: "asc" }],
    });
  }

  function summarizeTasks(rows: Awaited<ReturnType<typeof taskRows>>): TaskReport {
    const grouped = new Map<string, { project_id: string | null; project_name_snapshot: string | null; ids: Set<string>; completed_count: number }>();
    for (const row of rows) {
      const key = row.project_id_at_event ?? "personal";
      const group = grouped.get(key) ?? { project_id: row.project_id_at_event, project_name_snapshot: row.project_name_snapshot, ids: new Set<string>(), completed_count: 0 };
      group.completed_count += 1;
      group.ids.add(row.task_id);
      group.project_name_snapshot = row.project_name_snapshot;
      grouped.set(key, group);
    }
    return {
      completed_count: rows.length,
      distinct_task_count: new Set(rows.map((row) => row.task_id)).size,
      per_project: [...grouped.values()].map((group) => ({ project_id: group.project_id, project_name_snapshot: group.project_name_snapshot, completed_count: group.completed_count, distinct_task_count: group.ids.size })),
    };
  }

  async function pomodoroRows(userId: string, range: ResolvedRange, projectId?: string) {
    return db.pomodoroInterval.findMany({
      where: {
        user_id: userId,
        ended_at: { not: null, gt: range.start },
        started_at: { lt: range.end },
        session: { user_id: userId, phase: "focus", status: { in: ["completed", "cancelled"] }, ...(projectId ? { project_id_at_start: projectId } : {}) },
      },
      include: { session: { include: { cycle_day: true } } },
      orderBy: [{ started_at: "asc" }, { id: "asc" }],
    });
  }

  async function summarizePomodoro(userId: string, range: ResolvedRange, projectId?: string): Promise<{ report: PomodoroReport; rows: Awaited<ReturnType<typeof pomodoroRows>> }> {
    const [rows, terminal] = await Promise.all([
      pomodoroRows(userId, range, projectId),
      db.pomodoroSession.findMany({ where: { user_id: userId, phase: "focus", status: { in: ["completed", "cancelled"] }, ended_at: { gte: range.start, lt: range.end }, ...(projectId ? { project_id_at_start: projectId } : {}) }, select: { status: true } }),
    ]);
    const grouped = new Map<string, { project_id: string | null; project_name_snapshot: string | null; duration: number }>();
    let duration = 0;
    for (const row of rows) {
      const elapsed = overlapMs(row.started_at, row.ended_at!, range.start, range.end);
      duration += elapsed;
      const key = row.session.project_id_at_start ?? "personal";
      const group = grouped.get(key) ?? { project_id: row.session.project_id_at_start, project_name_snapshot: row.session.project_name_snapshot, duration: 0 };
      group.duration += elapsed;
      group.project_name_snapshot = row.session.project_name_snapshot;
      grouped.set(key, group);
    }
    return {
      rows,
      report: {
        focus_duration_ms: duration,
        focus_duration_seconds: Math.floor(duration / 1000),
        completed_focus_count: terminal.filter((row) => row.status === "completed").length,
        cancelled_focus_count: terminal.filter((row) => row.status === "cancelled").length,
        per_project: [...grouped.values()].map((group) => ({ project_id: group.project_id, project_name_snapshot: group.project_name_snapshot, focus_duration_ms: group.duration, focus_duration_seconds: Math.floor(group.duration / 1000) })),
      },
    };
  }

  async function habitRows(userId: string, range: ResolvedRange) {
    const habits = await db.habit.findMany({
      where: { user_id: userId, start_date: { lte: asDate(range.to) } },
      include: {
        schedules: { where: { effective_from: { lte: asDate(range.to) } }, orderBy: { effective_from: "asc" } },
        check_ins: { where: { date: { gte: asDate(range.from), lte: asDate(range.to) } }, select: { date: true } },
      },
      orderBy: { name: "asc" },
    });
    const rows: Array<{ habit_id: string; name: string; timezone: string; date: string; scheduled: boolean; checked: boolean }> = [];
    for (const habit of habits) {
      const first = dateOnly(habit.start_date) > range.from ? dateOnly(habit.start_date) : range.from;
      const archived = habit.archived_on ? dateOnly(habit.archived_on) : range.to;
      const last = archived < range.to ? archived : range.to;
      const checked = new Set(habit.check_ins.map((row) => dateOnly(row.date)));
      for (let date = first; date <= last; date = addDays(date, 1)) {
        const schedule = [...habit.schedules].reverse().find((row) => dateOnly(row.effective_from) <= date);
        if (schedule?.weekdays.includes(weekday(date))) rows.push({ habit_id: habit.id, name: habit.name, timezone: habit.timezone, date, scheduled: true, checked: checked.has(date) });
      }
    }
    return { rows, habits: habits.map((habit) => ({ habit_id: habit.id, name: habit.name, timezone: habit.timezone })) };
  }

  async function summarizeHabits(userId: string, range: ResolvedRange): Promise<HabitReport> {
    const { rows, habits } = await habitRows(userId, range);
    const groups = new Map<string, { habit_id: string; name: string; timezone: string; scheduled_days: number; completed_days: number }>();
    for (const habit of habits) groups.set(habit.habit_id, { ...habit, scheduled_days: 0, completed_days: 0 });
    for (const row of rows) {
      const group = groups.get(row.habit_id) ?? { habit_id: row.habit_id, name: row.name, timezone: row.timezone, scheduled_days: 0, completed_days: 0 };
      group.scheduled_days += 1;
      if (row.checked) group.completed_days += 1;
      groups.set(row.habit_id, group);
    }
    return [...groups.values()].map((group) => ({ ...group, ratio: group.scheduled_days ? group.completed_days / group.scheduled_days : null }));
  }

  async function financeRows(userId: string, range: ResolvedRange) {
    return db.financeTransaction.findMany({
      where: { user_id: userId, status: "posted", type: { in: ["income", "expense"] }, date: { gte: asDate(range.from), lte: asDate(range.to) } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
  }

  function summarizeFinance(rows: Awaited<ReturnType<typeof financeRows>>): FinanceReport {
    let income = 0n;
    let expense = 0n;
    const categories = new Map<string, { category_id: string; type: "income" | "expense"; total: bigint }>();
    for (const row of rows) {
      if (row.type !== "income" && row.type !== "expense") continue;
      if (row.type === "income") income += row.amount;
      else expense += row.amount;
      if (row.category_id) {
        const key = `${row.type}:${row.category_id}`;
        const category = categories.get(key) ?? { category_id: row.category_id, type: row.type, total: 0n };
        category.total += row.amount;
        categories.set(key, category);
      }
    }
    return { income: income.toString(), expense: expense.toString(), net: (income - expense).toString(), per_category: [...categories.values()].map((row) => ({ category_id: row.category_id, type: row.type, total: row.total.toString() })), basis: "current_corrected_transactions" };
  }

  async function budgetRows(userId: string, range: ResolvedRange) {
    const today = localDate(now(), range.timezone);
    const rows = await db.budget.findMany({ where: { user_id: userId, month: { gte: asDate(monthStart(range.from)), lte: asDate(monthStart(range.to)) } }, orderBy: [{ month: "asc" }, { category_id: "asc" }] });
    return Promise.all(rows.map(async (budget) => {
      const end = nextMonth(dateOnly(budget.month));
      const transactions = await db.financeTransaction.findMany({ where: { user_id: userId, category_id: budget.category_id, type: "expense", status: "posted", date: { gte: budget.month, lt: asDate(end), lte: asDate(today) } }, select: { amount: true } });
      const spent = transactions.reduce((sum, transaction) => sum + transaction.amount, 0n);
      return { month: dateOnly(budget.month), category_id: budget.category_id, limit_amount: budget.limit_amount.toString(), spent: spent.toString(), remaining: (budget.limit_amount - spent).toString(), basis: "full_calendar_month" as const };
    }));
  }

  function namedExport(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): CsvExport {
    enforceExportLimit(rows);
    return { filename, body: toCsv(headers, rows) };
  }

  return {
    async taskSummary(userId, input) {
      const range = await resolveRange(userId, input);
      return { range, tasks: summarizeTasks(await taskRows(userId, range)) };
    },
    async projectSummary(userId, projectId, input) {
      const range = await resolveRange(userId, input);
      await ownedProject(userId, projectId);
      const [tasks, pomodoro] = await Promise.all([taskRows(userId, range, projectId), summarizePomodoro(userId, range, projectId)]);
      return { range, tasks: summarizeTasks(tasks), pomodoro: pomodoro.report };
    },
    async habitSummary(userId, input) {
      const range = await resolveRange(userId, input);
      const habits = await summarizeHabits(userId, range);
      return { range, habits };
    },
    async pomodoroSummary(userId, input) {
      const range = await resolveRange(userId, input);
      return { range, pomodoro: (await summarizePomodoro(userId, range)).report };
    },
    async financeSummary(userId, input) {
      const range = await resolveRange(userId, input);
      const [finance, budgets] = await Promise.all([financeRows(userId, range), budgetRows(userId, range)]);
      return { range, finance: summarizeFinance(finance), budgets };
    },
    async exportTasks(userId, input) {
      const range = await resolveRange(userId, input);
      const rows = await taskRows(userId, range);
      return namedExport(`tasks-${range.from}-${range.to}.csv`, ["event_id", "task_id", "task_title_snapshot", "project_id_at_event", "project_name_snapshot", "occurred_at"], rows.map((row) => [row.id, row.task_id, row.task_title_snapshot, row.project_id_at_event, row.project_name_snapshot, row.occurred_at.toISOString()]));
    },
    async exportProject(userId, projectId, section, input) {
      const range = await resolveRange(userId, input);
      await ownedProject(userId, projectId);
      if (section === "tasks") {
        const rows = await taskRows(userId, range, projectId);
        return namedExport(`project-tasks-${range.from}-${range.to}.csv`, ["event_id", "task_id", "task_title_snapshot", "project_id_at_event", "project_name_snapshot", "occurred_at"], rows.map((row) => [row.id, row.task_id, row.task_title_snapshot, row.project_id_at_event, row.project_name_snapshot, row.occurred_at.toISOString()]));
      }
      const rows = await pomodoroRows(userId, range, projectId);
      return namedExport(`project-pomodoro-${range.from}-${range.to}.csv`, ["interval_id", "session_id", "session_status", "cycle_date", "cycle_timezone", "task_id", "project_id_at_start", "project_name_snapshot", "interval_started_at", "interval_ended_at", "overlap_ms"], rows.map((row) => [row.id, row.session_id, row.session.status, dateOnly(row.session.cycle_day.cycle_date), row.session.cycle_day.timezone, row.session.task_id, row.session.project_id_at_start, row.session.project_name_snapshot, row.started_at.toISOString(), row.ended_at!.toISOString(), overlapMs(row.started_at, row.ended_at!, range.start, range.end)]));
    },
    async exportHabits(userId, input) {
      const range = await resolveRange(userId, input);
      const { rows } = await habitRows(userId, range);
      return namedExport(`habits-${range.from}-${range.to}.csv`, ["habit_id", "name", "timezone", "date", "scheduled", "checked"], rows.map((row) => [row.habit_id, row.name, row.timezone, row.date, row.scheduled, row.checked]));
    },
    async exportPomodoro(userId, input) {
      const range = await resolveRange(userId, input);
      const rows = await pomodoroRows(userId, range);
      return namedExport(`pomodoro-${range.from}-${range.to}.csv`, ["interval_id", "session_id", "session_status", "cycle_date", "cycle_timezone", "task_id", "project_id_at_start", "project_name_snapshot", "interval_started_at", "interval_ended_at", "overlap_ms"], rows.map((row) => [row.id, row.session_id, row.session.status, dateOnly(row.session.cycle_day.cycle_date), row.session.cycle_day.timezone, row.session.task_id, row.session.project_id_at_start, row.session.project_name_snapshot, row.started_at.toISOString(), row.ended_at!.toISOString(), overlapMs(row.started_at, row.ended_at!, range.start, range.end)]));
    },
    async exportFinance(userId, section, input) {
      const range = await resolveRange(userId, input);
      if (section === "finance") {
        const rows = await financeRows(userId, range);
        return namedExport(`finance-${range.from}-${range.to}.csv`, ["transaction_id", "transaction_version", "type", "account_id", "category_id", "amount", "date", "note"], rows.map((row) => [row.id, row.version, row.type, row.account_id, row.category_id, row.amount.toString(), dateOnly(row.date), row.note]));
      }
      const rows = await budgetRows(userId, range);
      return namedExport(`budgets-${range.from}-${range.to}.csv`, ["month", "category_id", "limit_amount", "spent", "remaining"], rows.map((row) => [row.month, row.category_id, row.limit_amount, row.spent, row.remaining]));
    },
  };
}
