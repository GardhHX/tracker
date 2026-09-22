import {
  Prisma,
  type FinanceRecurrenceRevision,
  type FinanceRecurrenceRule,
  type FinanceTransaction,
  type PrismaClient,
  type Task,
  type TaskRecurrenceRevision,
  type TaskRecurrenceRule,
} from "../../generated/prisma/client.js";
import { createIdempotencyExecutor } from "../../lib/idempotency.js";
import { transactionDto, transactionSnapshot } from "../finance/service.prisma.js";
import type { TransactionFields } from "../finance/types.js";
import { taskDto } from "../work/service.prisma.js";
import type { Page, TaskPriority } from "../work/types.js";
import {
  type DependencyDto,
  type FinanceRuleDto,
  type FinanceRuleFields,
  type FinanceRuleInput,
  type FinanceRulePatch,
  type M4Service,
  M4Error,
  type RecurrenceFrequency,
  type RecurrenceStatus,
  type RuleRevisionDto,
  type TaskRuleDto,
  type TaskRuleInput,
  type TaskRulePatch,
} from "./types.js";

type Db = PrismaClient | Prisma.TransactionClient;
type Timestamp = Date;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const iso = (value: Date | null) => value?.toISOString() ?? null;
const money = (value: bigint) => value.toString();

function localDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(value: string, days: number) {
  const date = asDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Preserves the original day-of-month, falling back only for short months. */
export function nextOccurrenceDate(startDate: string, frequency: RecurrenceFrequency, interval: number, currentDate: string) {
  if (frequency === "daily") return addDays(currentDate, interval);
  if (frequency === "weekly") return addDays(currentDate, interval * 7);

  const start = asDate(startDate);
  const current = asDate(currentDate);
  const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const currentMonth = current.getUTCFullYear() * 12 + current.getUTCMonth();
  const nextStep = Math.floor((currentMonth - startMonth) / interval) + 1;
  const targetMonth = startMonth + nextStep * interval;
  const year = Math.floor(targetMonth / 12);
  const month = targetMonth % 12;
  const day = Math.min(start.getUTCDate(), daysInMonth(year, month));
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function firstOccurrenceAfter(startDate: string, frequency: RecurrenceFrequency, interval: number, cutoff: string) {
  if (startDate > cutoff) return startDate;
  if (frequency === "daily") {
    const difference = Math.floor((asDate(cutoff).getTime() - asDate(startDate).getTime()) / 86_400_000);
    return addDays(startDate, (Math.floor(difference / interval) + 1) * interval);
  }
  if (frequency === "weekly") {
    const difference = Math.floor((asDate(cutoff).getTime() - asDate(startDate).getTime()) / 86_400_000);
    return addDays(startDate, (Math.floor(difference / (interval * 7)) + 1) * interval * 7);
  }

  let candidate = startDate;
  const start = asDate(startDate);
  const cut = asDate(cutoff);
  const monthDifference = (cut.getUTCFullYear() - start.getUTCFullYear()) * 12 + cut.getUTCMonth() - start.getUTCMonth();
  if (monthDifference > 0) {
    const step = Math.floor(monthDifference / interval);
    const targetMonth = start.getUTCFullYear() * 12 + start.getUTCMonth() + step * interval;
    const year = Math.floor(targetMonth / 12);
    const month = targetMonth % 12;
    candidate = new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), daysInMonth(year, month)))).toISOString().slice(0, 10);
  }
  while (candidate <= cutoff) candidate = nextOccurrenceDate(startDate, frequency, interval, candidate);
  return candidate;
}

function parseMoney(value: string) {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n || parsed > MAX_BIGINT) throw new Error();
    return parsed;
  } catch {
    throw new M4Error(422, "VALIDATION_ERROR", "Amount must be a positive whole rupiah value.");
  }
}

function assertVersion(actual: number, expected: number) {
  if (actual !== expected) throw new M4Error(409, "VERSION_CONFLICT", "The rule changed. Refresh and try again.");
}

async function lockUser(db: Db, userId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`m4:${userId}`}, 0))`;
}

async function ownedTask(db: Db, userId: string, id: string) {
  const task = await db.task.findFirst({ where: { user_id: userId, id } });
  if (!task) throw new M4Error(404, "NOT_FOUND", "Task not found.");
  return task;
}

async function ownedProject(db: Db, userId: string, id: string) {
  const project = await db.project.findFirst({ where: { user_id: userId, id } });
  if (!project) throw new M4Error(404, "NOT_FOUND", "Project not found.");
  return project;
}

async function ownedAccount(db: Db, userId: string, id: string) {
  const account = await db.financeAccount.findFirst({ where: { user_id: userId, id } });
  if (!account) throw new M4Error(404, "NOT_FOUND", "Finance account not found.");
  return account;
}

async function ownedCategory(db: Db, userId: string, id: string) {
  const category = await db.financeCategory.findFirst({ where: { user_id: userId, id } });
  if (!category) throw new M4Error(404, "NOT_FOUND", "Finance category not found.");
  return category;
}

async function ownedTaskRule(db: Db, userId: string, id: string) {
  const rule = await db.taskRecurrenceRule.findFirst({ where: { user_id: userId, id } });
  if (!rule) throw new M4Error(404, "NOT_FOUND", "Task recurrence rule not found.");
  return rule;
}

async function ownedFinanceRule(db: Db, userId: string, id: string) {
  const rule = await db.financeRecurrenceRule.findFirst({ where: { user_id: userId, id } });
  if (!rule) throw new M4Error(404, "NOT_FOUND", "Finance recurrence rule not found.");
  return rule;
}

async function taskBlockedReason(db: Db, rule: TaskRecurrenceRule) {
  if (!rule.project_id) return null;
  const project = await db.project.findFirst({ where: { user_id: rule.user_id, id: rule.project_id }, select: { status: true } });
  return project?.status === "active" ? null : "PROJECT_NOT_ACTIVE";
}

async function taskRuleDto(db: Db, rule: TaskRecurrenceRule): Promise<TaskRuleDto> {
  return {
    id: rule.id, version: rule.version, created_at: rule.created_at.toISOString(), updated_at: rule.updated_at.toISOString(),
    title: rule.title, description: rule.description, project_id: rule.project_id, priority: rule.priority,
    frequency: rule.frequency, interval: rule.interval, start_date: dateOnly(rule.start_date)!, end_date: dateOnly(rule.end_date), timezone: rule.timezone,
    status: rule.status, next_date: dateOnly(rule.next_date), last_generated_date: dateOnly(rule.last_generated_date), processing_updated_at: iso(rule.processing_updated_at),
    blocked_reason: await taskBlockedReason(db, rule),
  };
}

function financeRuleDto(rule: FinanceRecurrenceRule): FinanceRuleDto {
  return {
    id: rule.id, version: rule.version, created_at: rule.created_at.toISOString(), updated_at: rule.updated_at.toISOString(),
    type: rule.type, account_id: rule.account_id, to_account_id: rule.to_account_id, category_id: rule.category_id, amount: money(rule.amount), note: rule.note,
    frequency: rule.frequency, interval: rule.interval, start_date: dateOnly(rule.start_date)!, end_date: dateOnly(rule.end_date), timezone: rule.timezone,
    status: rule.status, next_date: dateOnly(rule.next_date), last_generated_date: dateOnly(rule.last_generated_date), processing_updated_at: iso(rule.processing_updated_at), blocked_reason: null,
  };
}

function taskRuleSnapshot(rule: TaskRecurrenceRule) {
  return {
    title: rule.title, description: rule.description, project_id: rule.project_id, priority: rule.priority,
    frequency: rule.frequency, interval: rule.interval, start_date: dateOnly(rule.start_date), end_date: dateOnly(rule.end_date), timezone: rule.timezone,
  };
}

function financeRuleSnapshot(rule: FinanceRecurrenceRule) {
  return {
    type: rule.type, account_id: rule.account_id, to_account_id: rule.to_account_id, category_id: rule.category_id, amount: money(rule.amount), note: rule.note,
    frequency: rule.frequency, interval: rule.interval, start_date: dateOnly(rule.start_date), end_date: dateOnly(rule.end_date), timezone: rule.timezone,
  };
}

function taskRevisionDto(revision: TaskRecurrenceRevision): RuleRevisionDto {
  return { id: revision.id, rule_id: revision.rule_id, rule_version: revision.rule_version, action: revision.action, snapshot: revision.snapshot as Record<string, unknown>, effective_after: dateOnly(revision.effective_after), changed_at: revision.changed_at.toISOString() };
}

function financeRevisionDto(revision: FinanceRecurrenceRevision): RuleRevisionDto {
  return { id: revision.id, rule_id: revision.rule_id, rule_version: revision.rule_version, action: revision.action, snapshot: revision.snapshot as Record<string, unknown>, effective_after: dateOnly(revision.effective_after), changed_at: revision.changed_at.toISOString() };
}

async function appendTaskCreatedEvent(db: Db, task: Task) {
  const project = task.project_id ? await db.project.findFirst({ where: { user_id: task.user_id, id: task.project_id }, select: { name: true } }) : null;
  await db.taskEvent.create({ data: {
    user_id: task.user_id, task_id: task.id, task_version: task.version, event_type: "created", from_status: null, to_status: task.status,
    previous_project_id: null, project_id_at_event: task.project_id, task_title_snapshot: task.title, project_name_snapshot: project?.name ?? null, archived: false,
  } });
}

async function assertFinanceFields(db: Db, userId: string, fields: FinanceRuleFields) {
  const account = await ownedAccount(db, userId, fields.account_id);
  if (account.archived_at) throw new M4Error(409, "RESOURCE_ARCHIVED", "The source account is archived.");
  if (fields.type === "transfer") {
    if (!fields.to_account_id || fields.to_account_id === fields.account_id || fields.category_id) throw new M4Error(422, "VALIDATION_ERROR", "Transfers require a different destination account and no category.");
    const destination = await ownedAccount(db, userId, fields.to_account_id);
    if (destination.archived_at) throw new M4Error(409, "RESOURCE_ARCHIVED", "The destination account is archived.");
    return;
  }
  if (fields.to_account_id || !fields.category_id) throw new M4Error(422, "VALIDATION_ERROR", "Income and expense rules require a matching category and no destination account.");
  const category = await ownedCategory(db, userId, fields.category_id);
  if (category.archived_at) throw new M4Error(409, "RESOURCE_ARCHIVED", "The category is archived.");
  if (category.type !== fields.type) throw new M4Error(422, "CATEGORY_TYPE_MISMATCH", "The category type must match the rule type.");
}

function financeFieldsOf(rule: FinanceRecurrenceRule): FinanceRuleFields {
  return { type: rule.type, account_id: rule.account_id, to_account_id: rule.to_account_id, category_id: rule.category_id, amount: money(rule.amount), note: rule.note };
}

function sameFinanceFields(left: FinanceRuleFields, right: FinanceRuleFields) {
  return left.type === right.type && left.account_id === right.account_id && (left.to_account_id ?? null) === (right.to_account_id ?? null)
    && (left.category_id ?? null) === (right.category_id ?? null) && left.amount === right.amount && (left.note ?? null) === (right.note ?? null);
}

function nextForEditedRule(startDate: string, frequency: RecurrenceFrequency, interval: number, endDate: string | null, cutoff: string) {
  const next = firstOccurrenceAfter(startDate, frequency, interval, cutoff);
  return endDate && next > endDate ? null : next;
}

function catchupCutoff(now: Timestamp, timezone: string, lastGeneratedDate: Date | null) {
  const today = localDate(now, timezone);
  const last = dateOnly(lastGeneratedDate);
  return last && last > today ? last : today;
}

function countDueOccurrences(startDate: string, frequency: RecurrenceFrequency, interval: number, nextDate: string | null, endDate: string | null, today: string, maximum: number) {
  let count = 0;
  let cursor = nextDate;
  while (cursor && cursor <= today && (!endDate || cursor <= endDate)) {
    count += 1;
    if (count > maximum) return count;
    cursor = nextOccurrenceDate(startDate, frequency, interval, cursor);
  }
  return count;
}

async function generateTaskOccurrences(db: Db, rule: TaskRecurrenceRule, now: Timestamp, maximum: number) {
  if (rule.status !== "active" || !rule.next_date) return 0;
  if (await taskBlockedReason(db, rule)) return 0;
  const today = localDate(now, rule.timezone);
  let cursor = dateOnly(rule.next_date)!;
  const endDate = dateOnly(rule.end_date);
  let generated = 0;
  let lastGenerated = dateOnly(rule.last_generated_date);
  while (cursor <= today && (!endDate || cursor <= endDate) && generated < maximum) {
    const task = await db.task.create({ data: {
      user_id: rule.user_id, title: rule.title, description: rule.description, project_id: rule.project_id, priority: rule.priority, due_date: asDate(cursor),
      recurrence_rule_id: rule.id, occurrence_date: asDate(cursor), rule_version: rule.version,
    } });
    await appendTaskCreatedEvent(db, task);
    generated += 1;
    lastGenerated = cursor;
    cursor = nextOccurrenceDate(dateOnly(rule.start_date)!, rule.frequency, rule.interval, cursor);
  }
  const expired = Boolean(endDate && cursor > endDate);
  if (generated > 0 || expired) {
    await db.taskRecurrenceRule.update({ where: { id: rule.id }, data: {
      next_date: expired ? null : asDate(cursor), last_generated_date: lastGenerated ? asDate(lastGenerated) : null,
      processing_updated_at: now, ...(expired ? { status: "expired" } : {}),
    } });
  }
  return generated;
}

async function generateFinanceOccurrences(db: Db, rule: FinanceRecurrenceRule, now: Timestamp, maximum: number) {
  if (rule.status !== "active" || !rule.next_date) return 0;
  const fields = financeFieldsOf(rule);
  try { await assertFinanceFields(db, rule.user_id, fields); } catch (error) {
    if (error instanceof M4Error && error.code === "RESOURCE_ARCHIVED") return 0;
    throw error;
  }
  const today = localDate(now, rule.timezone);
  let cursor = dateOnly(rule.next_date)!;
  const endDate = dateOnly(rule.end_date);
  let generated = 0;
  let lastGenerated = dateOnly(rule.last_generated_date);
  while (cursor <= today && (!endDate || cursor <= endDate) && generated < maximum) {
    const transaction = await db.financeTransaction.create({ data: {
      user_id: rule.user_id, type: rule.type, status: "draft", account_id: rule.account_id, to_account_id: rule.to_account_id, category_id: rule.category_id,
      amount: rule.amount, date: asDate(cursor), note: rule.note, recurrence_rule_id: rule.id, occurrence_date: asDate(cursor), rule_version: rule.version,
    } });
    await db.financeTransactionRevision.create({ data: {
      user_id: transaction.user_id, transaction_id: transaction.id, transaction_version: transaction.version, action: "created",
      snapshot: transactionSnapshot(transaction) as unknown as Prisma.InputJsonObject, changed_at: now,
    } });
    generated += 1;
    lastGenerated = cursor;
    cursor = nextOccurrenceDate(dateOnly(rule.start_date)!, rule.frequency, rule.interval, cursor);
  }
  const expired = Boolean(endDate && cursor > endDate);
  if (generated > 0 || expired) {
    await db.financeRecurrenceRule.update({ where: { id: rule.id }, data: {
      next_date: expired ? null : asDate(cursor), last_generated_date: lastGenerated ? asDate(lastGenerated) : null,
      processing_updated_at: now, ...(expired ? { status: "expired" } : {}),
    } });
  }
  return generated;
}

export function createPrismaM4Service(db: PrismaClient, options: { now?: () => Date } = {}): M4Service {
  const now = options.now ?? (() => new Date());
  const executeIdempotent = createIdempotencyExecutor(db, { now });
  const idempotentResult = <T>(value: { status: number; body: Prisma.InputJsonValue; replayed: boolean }) => ({ data: (value.body as { data: T }).data, status: value.status, replayed: value.replayed });

  const processTaskRule = async (userId: string, ruleId: string, maximum: number) => db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const rule = await ownedTaskRule(tx, userId, ruleId);
    return generateTaskOccurrences(tx, rule, now(), maximum);
  });
  const processFinanceRule = async (userId: string, ruleId: string, maximum: number) => db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const rule = await ownedFinanceRule(tx, userId, ruleId);
    return generateFinanceOccurrences(tx, rule, now(), maximum);
  });

  return {
    async listTaskRules(userId, status, page, pageSize) {
      const where = { user_id: userId, ...(status === "all" ? {} : { status }) };
      const [rows, total] = await Promise.all([
        db.taskRecurrenceRule.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
        db.taskRecurrenceRule.count({ where }),
      ]);
      return { data: await Promise.all(rows.map((row) => taskRuleDto(db, row))), meta: { page, page_size: pageSize, total } };
    },

    createTaskRule: async (userId, input, key) => idempotentResult<TaskRuleDto>(await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/tasks/recurrences", requestBody: input }, async (tx) => {
      await lockUser(tx, userId);
      if (input.project_id) {
        const project = await ownedProject(tx, userId, input.project_id);
        if (project.status !== "active") throw new M4Error(409, "PROJECT_NOT_ACTIVE", "Reopen the project before adding a recurrence rule.");
      }
      const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new M4Error(404, "NOT_FOUND", "User not found.");
      const start = asDate(input.start_date);
      const end = input.end_date ? asDate(input.end_date) : null;
      const created = await tx.taskRecurrenceRule.create({ data: {
        user_id: userId, title: input.title, description: input.description ?? null, project_id: input.project_id ?? null, priority: input.priority ?? "medium",
        frequency: input.frequency, interval: input.interval ?? 1, start_date: start, end_date: end, timezone: user.timezone, next_date: start,
      } });
      await tx.taskRecurrenceRevision.create({ data: { user_id: userId, rule_id: created.id, rule_version: 1, action: "created", snapshot: taskRuleSnapshot(created) as Prisma.InputJsonObject, changed_at: now() } });
      return { status: 201, body: { data: await taskRuleDto(tx, created) } as unknown as Prisma.InputJsonObject };
    })),

    getTaskRule: async (userId, id) => taskRuleDto(db, await ownedTaskRule(db, userId, id)),

    async patchTaskRule(userId, id, input) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        let current = await ownedTaskRule(tx, userId, id);
        assertVersion(current.version, input.version);
        if (current.status !== "active") throw new M4Error(409, "INVALID_STATE", "Stopped and expired rules are read-only.");
        if (await taskBlockedReason(tx, current)) throw new M4Error(409, "PROJECT_NOT_ACTIVE", "Reopen the project before editing this recurrence rule.");
        const due = countDueOccurrences(dateOnly(current.start_date)!, current.frequency, current.interval, dateOnly(current.next_date), dateOnly(current.end_date), localDate(now(), current.timezone), 100);
        if (due > 100) throw new M4Error(409, "RECURRENCE_CATCHUP_PENDING", "The worker must finish the recurrence backlog before this change.");
        if (due) await generateTaskOccurrences(tx, current, now(), 100);
        current = await ownedTaskRule(tx, userId, id);
        const next = {
          title: input.title ?? current.title, description: input.description === undefined ? current.description : input.description,
          project_id: input.project_id === undefined ? current.project_id : input.project_id, priority: input.priority ?? current.priority,
          frequency: input.frequency ?? current.frequency, interval: input.interval ?? current.interval,
          end_date: input.end_date === undefined ? dateOnly(current.end_date) : input.end_date,
        };
        if (next.end_date && next.end_date < dateOnly(current.start_date)!) throw new M4Error(422, "VALIDATION_ERROR", "end_date must be on or after start_date.");
        if (next.project_id) {
          const project = await ownedProject(tx, userId, next.project_id);
          if (project.status !== "active") throw new M4Error(409, "PROJECT_NOT_ACTIVE", "Reopen the project before assigning this rule.");
        }
        const noOp = next.title === current.title && next.description === current.description && next.project_id === current.project_id && next.priority === current.priority && next.frequency === current.frequency && next.interval === current.interval && next.end_date === dateOnly(current.end_date);
        if (noOp) return taskRuleDto(tx, current);
        const cutoff = catchupCutoff(now(), current.timezone, current.last_generated_date);
        const nextDate = nextForEditedRule(dateOnly(current.start_date)!, next.frequency, next.interval, next.end_date, cutoff);
        const updated = await tx.taskRecurrenceRule.update({ where: { id }, data: {
          ...next, end_date: next.end_date ? asDate(next.end_date) : null, next_date: nextDate ? asDate(nextDate) : null,
          status: nextDate ? "active" : "expired", version: { increment: 1 }, updated_at: now(),
        } });
        await tx.taskRecurrenceRevision.create({ data: { user_id: userId, rule_id: id, rule_version: updated.version, action: "edited", snapshot: taskRuleSnapshot(updated) as Prisma.InputJsonObject, effective_after: asDate(cutoff), changed_at: now() } });
        return taskRuleDto(tx, updated);
      });
    },

    async stopTaskRule(userId, id, version) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        let current = await ownedTaskRule(tx, userId, id);
        assertVersion(current.version, version);
        if (current.status !== "active") return taskRuleDto(tx, current);
        const blocked = await taskBlockedReason(tx, current);
        if (!blocked) {
          const due = countDueOccurrences(dateOnly(current.start_date)!, current.frequency, current.interval, dateOnly(current.next_date), dateOnly(current.end_date), localDate(now(), current.timezone), 100);
          if (due > 100) throw new M4Error(409, "RECURRENCE_CATCHUP_PENDING", "The worker must finish the recurrence backlog before this change.");
          if (due) await generateTaskOccurrences(tx, current, now(), 100);
          current = await ownedTaskRule(tx, userId, id);
        }
        const cutoff = catchupCutoff(now(), current.timezone, current.last_generated_date);
        const updated = await tx.taskRecurrenceRule.update({ where: { id }, data: { status: "stopped", next_date: null, version: { increment: 1 }, updated_at: now() } });
        await tx.taskRecurrenceRevision.create({ data: { user_id: userId, rule_id: id, rule_version: updated.version, action: "stopped", snapshot: taskRuleSnapshot(updated) as Prisma.InputJsonObject, effective_after: asDate(cutoff), changed_at: now() } });
        return taskRuleDto(tx, updated);
      });
    },

    async listTaskOccurrences(userId, id, from, to, page, pageSize) {
      await ownedTaskRule(db, userId, id);
      const where = { user_id: userId, recurrence_rule_id: id, occurrence_date: { gte: asDate(from), lte: asDate(to) } };
      const [rows, total] = await Promise.all([
        db.task.findMany({ where, orderBy: [{ occurrence_date: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        db.task.count({ where }),
      ]);
      return { data: rows.map(taskDto), meta: { page, page_size: pageSize, total } };
    },

    async listTaskRuleRevisions(userId, id, page, pageSize) {
      await ownedTaskRule(db, userId, id);
      const where = { user_id: userId, rule_id: id };
      const [rows, total] = await Promise.all([
        db.taskRecurrenceRevision.findMany({ where, orderBy: [{ rule_version: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        db.taskRecurrenceRevision.count({ where }),
      ]);
      return { data: rows.map(taskRevisionDto), meta: { page, page_size: pageSize, total } };
    },

    async listDependencies(userId, taskId, page, pageSize) {
      await ownedTask(db, userId, taskId);
      const where = { user_id: userId, task_id: taskId };
      const [rows, total] = await Promise.all([
        db.taskDependency.findMany({ where, include: { predecessor: true }, orderBy: [{ created_at: "asc" }, { predecessor_id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        db.taskDependency.count({ where }),
      ]);
      return { data: rows.map((row) => ({ task_id: row.task_id, predecessor_id: row.predecessor_id, predecessor_status: row.predecessor.status, predecessor_title: row.predecessor.title, created_at: row.created_at.toISOString() })), meta: { page, page_size: pageSize, total } };
    },

    async setDependency(userId, taskId, predecessorId) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const [task, predecessor] = await Promise.all([ownedTask(tx, userId, taskId), ownedTask(tx, userId, predecessorId)]);
        if (!task.project_id || task.project_id !== predecessor.project_id) throw new M4Error(409, "INVALID_STATE", "Dependencies require two tasks in the same project.");
        const project = await ownedProject(tx, userId, task.project_id);
        if (project.status !== "active" || task.archived_at || predecessor.archived_at) throw new M4Error(409, "PROJECT_NOT_ACTIVE", "Dependencies require active, unarchived tasks in an active project.");
        if (task.status === "done" && predecessor.status !== "done") throw new M4Error(409, "TASK_BLOCKED", "A completed task cannot depend on an unfinished predecessor.");
        const existing = await tx.taskDependency.findUnique({ where: { task_id_predecessor_id: { task_id: taskId, predecessor_id: predecessorId } }, include: { predecessor: true } });
        if (existing) return { task_id: existing.task_id, predecessor_id: existing.predecessor_id, predecessor_status: existing.predecessor.status, predecessor_title: existing.predecessor.title, created_at: existing.created_at.toISOString() };
        const seen = new Set<string>();
        const queue = [predecessorId];
        while (queue.length) {
          const current = queue.pop()!;
          if (current === taskId) throw new M4Error(409, "DEPENDENCY_CYCLE", "A task cannot depend on itself through a cycle.");
          if (seen.has(current)) continue;
          seen.add(current);
          const upstream = await tx.taskDependency.findMany({ where: { user_id: userId, task_id: current }, select: { predecessor_id: true } });
          queue.push(...upstream.map((edge) => edge.predecessor_id));
        }
        const created = await tx.taskDependency.create({ data: { user_id: userId, task_id: taskId, predecessor_id: predecessorId }, include: { predecessor: true } });
        return { task_id: created.task_id, predecessor_id: created.predecessor_id, predecessor_status: created.predecessor.status, predecessor_title: created.predecessor.title, created_at: created.created_at.toISOString() };
      });
    },

    async deleteDependency(userId, taskId, predecessorId) {
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        await ownedTask(tx, userId, taskId);
        const deleted = await tx.taskDependency.deleteMany({ where: { user_id: userId, task_id: taskId, predecessor_id: predecessorId } });
        if (deleted.count !== 1) throw new M4Error(404, "NOT_FOUND", "Dependency not found.");
      });
    },

    async listFinanceRules(userId, status, page, pageSize) {
      const where = { user_id: userId, ...(status === "all" ? {} : { status }) };
      const [rows, total] = await Promise.all([
        db.financeRecurrenceRule.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
        db.financeRecurrenceRule.count({ where }),
      ]);
      return { data: rows.map(financeRuleDto), meta: { page, page_size: pageSize, total } };
    },

    createFinanceRule: async (userId, input, key) => idempotentResult<FinanceRuleDto>(await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/finance/recurrences", requestBody: input }, async (tx) => {
      await lockUser(tx, userId);
      const fields: FinanceRuleFields = { type: input.type, account_id: input.account_id, to_account_id: input.to_account_id ?? null, category_id: input.category_id ?? null, amount: input.amount, note: input.note ?? null };
      await assertFinanceFields(tx, userId, fields);
      const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new M4Error(404, "NOT_FOUND", "User not found.");
      const start = asDate(input.start_date);
      const created = await tx.financeRecurrenceRule.create({ data: {
        user_id: userId, ...fields, amount: parseMoney(fields.amount), frequency: input.frequency, interval: input.interval ?? 1, start_date: start,
        end_date: input.end_date ? asDate(input.end_date) : null, timezone: user.timezone, next_date: start,
      } });
      await tx.financeRecurrenceRevision.create({ data: { user_id: userId, rule_id: created.id, rule_version: 1, action: "created", snapshot: financeRuleSnapshot(created) as Prisma.InputJsonObject, changed_at: now() } });
      return { status: 201, body: { data: financeRuleDto(created) } as unknown as Prisma.InputJsonObject };
    })),

    getFinanceRule: async (userId, id) => financeRuleDto(await ownedFinanceRule(db, userId, id)),

    async patchFinanceRule(userId, id, input) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        let current = await ownedFinanceRule(tx, userId, id);
        assertVersion(current.version, input.version);
        if (current.status !== "active") throw new M4Error(409, "INVALID_STATE", "Stopped and expired rules are read-only.");
        const due = countDueOccurrences(dateOnly(current.start_date)!, current.frequency, current.interval, dateOnly(current.next_date), dateOnly(current.end_date), localDate(now(), current.timezone), 100);
        if (due > 100) throw new M4Error(409, "RECURRENCE_CATCHUP_PENDING", "The worker must finish the recurrence backlog before this change.");
        if (due) await generateFinanceOccurrences(tx, current, now(), 100);
        current = await ownedFinanceRule(tx, userId, id);
        const fields: FinanceRuleFields = {
          type: input.type ?? current.type, account_id: input.account_id ?? current.account_id,
          to_account_id: input.to_account_id === undefined ? current.to_account_id : input.to_account_id,
          category_id: input.category_id === undefined ? current.category_id : input.category_id,
          amount: input.amount ?? money(current.amount), note: input.note === undefined ? current.note : input.note,
        };
        const frequency = input.frequency ?? current.frequency;
        const interval = input.interval ?? current.interval;
        const endDate = input.end_date === undefined ? dateOnly(current.end_date) : input.end_date;
        if (endDate && endDate < dateOnly(current.start_date)!) throw new M4Error(422, "VALIDATION_ERROR", "end_date must be on or after start_date.");
        await assertFinanceFields(tx, userId, fields);
        const noOp = sameFinanceFields(financeFieldsOf(current), fields) && frequency === current.frequency && interval === current.interval && endDate === dateOnly(current.end_date);
        if (noOp) return financeRuleDto(current);
        const cutoff = catchupCutoff(now(), current.timezone, current.last_generated_date);
        const nextDate = nextForEditedRule(dateOnly(current.start_date)!, frequency, interval, endDate, cutoff);
        const updated = await tx.financeRecurrenceRule.update({ where: { id }, data: {
          type: fields.type, account_id: fields.account_id, to_account_id: fields.to_account_id ?? null, category_id: fields.category_id ?? null, amount: parseMoney(fields.amount), note: fields.note ?? null,
          frequency, interval, end_date: endDate ? asDate(endDate) : null, next_date: nextDate ? asDate(nextDate) : null,
          status: nextDate ? "active" : "expired", version: { increment: 1 }, updated_at: now(),
        } });
        await tx.financeRecurrenceRevision.create({ data: { user_id: userId, rule_id: id, rule_version: updated.version, action: "edited", snapshot: financeRuleSnapshot(updated) as Prisma.InputJsonObject, effective_after: asDate(cutoff), changed_at: now() } });
        return financeRuleDto(updated);
      });
    },

    async stopFinanceRule(userId, id, version) {
      return db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        let current = await ownedFinanceRule(tx, userId, id);
        assertVersion(current.version, version);
        if (current.status !== "active") return financeRuleDto(current);
        const due = countDueOccurrences(dateOnly(current.start_date)!, current.frequency, current.interval, dateOnly(current.next_date), dateOnly(current.end_date), localDate(now(), current.timezone), 100);
        if (due > 100) throw new M4Error(409, "RECURRENCE_CATCHUP_PENDING", "The worker must finish the recurrence backlog before this change.");
        if (due) await generateFinanceOccurrences(tx, current, now(), 100);
        current = await ownedFinanceRule(tx, userId, id);
        const cutoff = catchupCutoff(now(), current.timezone, current.last_generated_date);
        const updated = await tx.financeRecurrenceRule.update({ where: { id }, data: { status: "stopped", next_date: null, version: { increment: 1 }, updated_at: now() } });
        await tx.financeRecurrenceRevision.create({ data: { user_id: userId, rule_id: id, rule_version: updated.version, action: "stopped", snapshot: financeRuleSnapshot(updated) as Prisma.InputJsonObject, effective_after: asDate(cutoff), changed_at: now() } });
        return financeRuleDto(updated);
      });
    },

    async listFinanceOccurrences(userId, id, from, to, page, pageSize) {
      await ownedFinanceRule(db, userId, id);
      const where = { user_id: userId, recurrence_rule_id: id, occurrence_date: { gte: asDate(from), lte: asDate(to) } };
      const [rows, total] = await Promise.all([
        db.financeTransaction.findMany({ where, orderBy: [{ occurrence_date: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        db.financeTransaction.count({ where }),
      ]);
      return { data: rows.map(transactionDto), meta: { page, page_size: pageSize, total } };
    },

    async listFinanceRuleRevisions(userId, id, page, pageSize) {
      await ownedFinanceRule(db, userId, id);
      const where = { user_id: userId, rule_id: id };
      const [rows, total] = await Promise.all([
        db.financeRecurrenceRevision.findMany({ where, orderBy: [{ rule_version: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
        db.financeRecurrenceRevision.count({ where }),
      ]);
      return { data: rows.map(financeRevisionDto), meta: { page, page_size: pageSize, total } };
    },

    async processDueRules(limit = 100) {
      const [taskRules, financeRules] = await Promise.all([
        db.taskRecurrenceRule.findMany({ where: { status: "active", next_date: { not: null } }, orderBy: [{ next_date: "asc" }, { id: "asc" }], take: limit }),
        db.financeRecurrenceRule.findMany({ where: { status: "active", next_date: { not: null } }, orderBy: [{ next_date: "asc" }, { id: "asc" }], take: limit }),
      ]);
      let taskOccurrences = 0;
      let financeOccurrences = 0;
      for (const rule of taskRules) taskOccurrences += await processTaskRule(rule.user_id, rule.id, 100);
      for (const rule of financeRules) financeOccurrences += await processFinanceRule(rule.user_id, rule.id, 100);
      return { taskOccurrences, financeOccurrences };
    },
  };
}
