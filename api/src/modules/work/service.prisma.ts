import { Prisma, type PrismaClient, type Project, type Task, type TaskEvent } from "../../generated/prisma/client.js";
import { createIdempotencyExecutor } from "../../lib/idempotency.js";
import type { M1Service, Page, ProjectDto, ProjectListQuery, TaskDto, TaskEventDto, TaskListQuery, TaskStatus } from "./types.js";
import { WorkError } from "./types.js";
import { reconcilePomodoroForUser } from "../m2/service.prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;

const iso = (value: Date | null) => value?.toISOString() ?? null;
const dateOnly = (value: Date | null) => value ? value.toISOString().slice(0, 10) : null;
const asDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00.000Z`) : null;

function projectDto(project: Project, counts: { done: number; total: number }): ProjectDto {
  return {
    id: project.id,
    version: project.version,
    created_at: project.created_at.toISOString(),
    updated_at: project.updated_at.toISOString(),
    name: project.name,
    description: project.description,
    status: project.status,
    completed_at: iso(project.completed_at),
    archived_at: iso(project.archived_at),
    done_count: counts.done,
    task_count: counts.total,
    progress_percent: counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 1000) / 10,
  };
}

export function taskDto(task: Task): TaskDto {
  return {
    id: task.id,
    version: task.version,
    created_at: task.created_at.toISOString(),
    updated_at: task.updated_at.toISOString(),
    project_id: task.project_id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_date: dateOnly(task.due_date),
    completed_at: iso(task.completed_at),
    archived_at: iso(task.archived_at),
    recurrence_rule_id: task.recurrence_rule_id,
    occurrence_date: dateOnly(task.occurrence_date),
    rule_version: task.rule_version,
  };
}

function eventDto(event: TaskEvent): TaskEventDto {
  return {
    id: event.id,
    task_id: event.task_id,
    task_version: event.task_version,
    event_type: event.event_type,
    from_status: event.from_status,
    to_status: event.to_status,
    previous_project_id: event.previous_project_id,
    project_id_at_event: event.project_id_at_event,
    task_title_snapshot: event.task_title_snapshot,
    project_name_snapshot: event.project_name_snapshot,
    archived: event.archived,
    occurred_at: event.occurred_at.toISOString(),
  };
}

async function ownedProject(db: Db, userId: string, id: string) {
  const project = await db.project.findFirst({ where: { id, user_id: userId } });
  if (!project) throw new WorkError(404, "NOT_FOUND", "Project not found.");
  return project;
}

async function ownedTask(db: Db, userId: string, id: string) {
  const task = await db.task.findFirst({ where: { id, user_id: userId } });
  if (!task) throw new WorkError(404, "NOT_FOUND", "Task not found.");
  return task;
}

function assertVersion(actual: number, expected: number) {
  if (actual !== expected) throw new WorkError(409, "VERSION_CONFLICT", "The resource changed. Refresh and try again.");
}

async function assertProjectActive(db: Db, userId: string, projectId: string | null) {
  if (!projectId) return null;
  const project = await ownedProject(db, userId, projectId);
  if (project.status !== "active") throw new WorkError(409, "PROJECT_NOT_ACTIVE", "Reopen the project before changing its tasks.");
  return project;
}

async function projectCounts(db: Db, projectId: string) {
  const [total, done] = await Promise.all([
    db.task.count({ where: { project_id: projectId, archived_at: null } }),
    db.task.count({ where: { project_id: projectId, archived_at: null, status: "done" } }),
  ]);
  return { total, done };
}

async function loadProjectDto(db: Db, userId: string, id: string) {
  const project = await ownedProject(db, userId, id);
  return projectDto(project, await projectCounts(db, project.id));
}

async function appendEvent(db: Db, task: Task, input: { eventType: TaskEvent["event_type"]; fromStatus: TaskStatus | null; previousProjectId: string | null }) {
  const project = task.project_id ? await db.project.findFirst({ where: { id: task.project_id, user_id: task.user_id }, select: { name: true } }) : null;
  await db.taskEvent.create({ data: {
    user_id: task.user_id,
    task_id: task.id,
    task_version: task.version,
    event_type: input.eventType,
    from_status: input.fromStatus,
    to_status: task.status,
    previous_project_id: input.previousProjectId,
    project_id_at_event: task.project_id,
    task_title_snapshot: task.title,
    project_name_snapshot: project?.name ?? null,
    archived: task.archived_at !== null,
  } });
}

function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function zonedStart(value: string, timeZone: string) {
  const wanted = Date.parse(`${value}T00:00:00.000Z`);
  let result = wanted;
  for (let i = 0; i < 2; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(result));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
    result -= represented - wanted;
  }
  return new Date(result);
}

export function createPrismaM1Service(db: PrismaClient, options: { now?: () => Date } = {}): M1Service {
  const now = options.now ?? (() => new Date());
  const executeIdempotent = createIdempotencyExecutor(db, { now });

  return {
    async listProjects(userId, query) {
      const where: Prisma.ProjectWhereInput = { user_id: userId, ...(query.status === "all" ? {} : { status: query.status }) };
      const [rows, total] = await Promise.all([
        db.project.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.project.count({ where }),
      ]);
      const data = await Promise.all(rows.map(async (row) => projectDto(row, await projectCounts(db, row.id))));
      return { data, meta: { page: query.page, page_size: query.pageSize, total } };
    },

    getProject: loadProjectDto.bind(null, db),

    async createProject(userId, input, key) {
      const result = await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/projects", requestBody: input }, async (tx) => {
        const project = await tx.project.create({ data: { user_id: userId, name: input.name, description: input.description ?? null } });
        const body = { data: projectDto(project, { total: 0, done: 0 }) } as unknown as Prisma.InputJsonObject;
        return { status: 201, body };
      });
      return { data: (result.body as unknown as { data: ProjectDto }).data, status: result.status, replayed: result.replayed };
    },

    async patchProject(userId, id, input) {
      return db.$transaction(async (tx) => {
        const current = await ownedProject(tx, userId, id);
        assertVersion(current.version, input.version);
        if (current.status !== "active") throw new WorkError(409, "PROJECT_NOT_ACTIVE", "Reopen the project before editing it.");
        const name = input.name ?? current.name;
        const description = input.description === undefined ? current.description : input.description;
        if (name === current.name && description === current.description) return projectDto(current, await projectCounts(tx, id));
        const updated = await tx.project.updateMany({ where: { id, user_id: userId, version: input.version }, data: { name, description, version: { increment: 1 } } });
        if (updated.count !== 1) throw new WorkError(409, "VERSION_CONFLICT", "The project changed. Refresh and try again.");
        return loadProjectDto(tx, userId, id);
      });
    },

    async setProjectStatus(userId, id, input) {
      return db.$transaction(async (tx) => {
        if (input.status !== "active") await reconcilePomodoroForUser(tx, userId, now());
        const current = await ownedProject(tx, userId, id);
        assertVersion(current.version, input.version);
        if (current.status === input.status) return projectDto(current, await projectCounts(tx, id));
        if (input.status === "completed") {
          const unfinished = await tx.task.count({ where: { project_id: id, archived_at: null, status: { not: "done" } } });
          if (unfinished > 0) throw new WorkError(409, "RESOURCE_IN_USE", "Finish or archive every open task before completing the project.");
        }
        if (input.status !== "active") {
          const focus = await tx.pomodoroSession.findFirst({ where: { user_id: userId, project_id_at_start: id, phase: "focus", status: { in: ["running", "paused"] } } });
          if (focus) throw new WorkError(409, "POMODORO_IN_PROGRESS", "Finish or cancel the active focus session first.");
        }
        const timestamp = now();
        const data = input.status === "active"
          ? { status: "active" as const, completed_at: null, archived_at: null }
          : input.status === "completed"
            ? { status: "completed" as const, completed_at: timestamp, archived_at: null }
            : { status: "archived" as const, archived_at: timestamp };
        const updated = await tx.project.updateMany({ where: { id, user_id: userId, version: input.version }, data: { ...data, version: { increment: 1 } } });
        if (updated.count !== 1) throw new WorkError(409, "VERSION_CONFLICT", "The project changed. Refresh and try again.");
        return loadProjectDto(tx, userId, id);
      });
    },

    async listTasks(userId, query) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new WorkError(404, "NOT_FOUND", "User not found.");
      const dueDate: Prisma.DateTimeNullableFilter | undefined = query.overdue || (query.dueFrom && query.dueTo) ? {
        ...(query.overdue ? { lt: asDate(localDate(now(), user.timezone))! } : {}),
        ...(query.dueFrom && query.dueTo ? { gte: asDate(query.dueFrom)!, lte: asDate(query.dueTo)! } : {}),
      } : undefined;
      const where: Prisma.TaskWhereInput = {
        user_id: userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.projectId ? { project_id: query.projectId } : {}),
        ...(query.personal ? { project_id: null } : {}),
        ...(query.archived === "all" ? {} : query.archived ? { archived_at: { not: null } } : { archived_at: null }),
        ...(query.overdue ? { status: { not: "done" } } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
      };
      const [rows, total] = await Promise.all([
        db.task.findMany({ where, orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.task.count({ where }),
      ]);
      return { data: rows.map(taskDto), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async getTask(userId, id) { return taskDto(await ownedTask(db, userId, id)); },

    async createTask(userId, input, key) {
      const result = await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/tasks", requestBody: input }, async (tx) => {
        await assertProjectActive(tx, userId, input.project_id ?? null);
        const task = await tx.task.create({ data: { user_id: userId, title: input.title, description: input.description ?? null, project_id: input.project_id ?? null, priority: input.priority ?? "medium", due_date: asDate(input.due_date) } });
        await appendEvent(tx, task, { eventType: "created", fromStatus: null, previousProjectId: null });
        return { status: 201, body: { data: taskDto(task) } as unknown as Prisma.InputJsonObject };
      });
      return { data: (result.body as unknown as { data: TaskDto }).data, status: result.status, replayed: result.replayed };
    },

    async patchTask(userId, id, input) {
      return db.$transaction(async (tx) => {
        if (input.project_id !== undefined) await reconcilePomodoroForUser(tx, userId, now());
        const current = await ownedTask(tx, userId, id);
        assertVersion(current.version, input.version);
        await assertProjectActive(tx, userId, current.project_id);
        const projectId = input.project_id === undefined ? current.project_id : input.project_id;
        if (projectId !== current.project_id) {
          const dependency = await tx.taskDependency.findFirst({ where: { user_id: userId, OR: [{ task_id: id }, { predecessor_id: id }] } });
          if (dependency) throw new WorkError(409, "RESOURCE_IN_USE", "Remove this task's dependencies before moving it to another project.");
          const focus = await tx.pomodoroSession.findFirst({ where: { user_id: userId, task_id: id, phase: "focus", status: { in: ["running", "paused"] } } });
          if (focus) throw new WorkError(409, "POMODORO_IN_PROGRESS", "Finish or cancel the active focus session first.");
        }
        await assertProjectActive(tx, userId, projectId);
        const next = {
          title: input.title ?? current.title,
          description: input.description === undefined ? current.description : input.description,
          project_id: projectId,
          priority: input.priority ?? current.priority,
          due_date: input.due_date === undefined ? current.due_date : asDate(input.due_date),
        };
        const noOp = next.title === current.title && next.description === current.description && next.project_id === current.project_id && next.priority === current.priority && dateOnly(next.due_date) === dateOnly(current.due_date);
        if (noOp) return taskDto(current);
        const eventType = next.project_id !== current.project_id ? "project_changed" : "edited";
        const updated = await tx.task.updateMany({ where: { id, user_id: userId, version: input.version }, data: { ...next, version: { increment: 1 } } });
        if (updated.count !== 1) throw new WorkError(409, "VERSION_CONFLICT", "The task changed. Refresh and try again.");
        const task = await ownedTask(tx, userId, id);
        await appendEvent(tx, task, { eventType, fromStatus: current.status, previousProjectId: current.project_id });
        return taskDto(task);
      });
    },

    async setTaskStatus(userId, id, input) {
      return db.$transaction(async (tx) => {
        if (input.status === "done") await reconcilePomodoroForUser(tx, userId, now());
        const current = await ownedTask(tx, userId, id);
        assertVersion(current.version, input.version);
        await assertProjectActive(tx, userId, current.project_id);
        if (current.archived_at) throw new WorkError(409, "INVALID_STATE", "Unarchive the task before changing its status.");
        if (current.status === input.status) return taskDto(current);
        if (input.status === "done") {
          const blocked = await tx.taskDependency.findFirst({ where: { user_id: userId, task_id: id, predecessor: { status: { not: "done" } } } });
          if (blocked) throw new WorkError(409, "TASK_BLOCKED", "Finish every predecessor before completing this task.");
          const focus = await tx.pomodoroSession.findFirst({ where: { user_id: userId, task_id: id, phase: "focus", status: { in: ["running", "paused"] } } });
          if (focus) throw new WorkError(409, "POMODORO_IN_PROGRESS", "Finish or cancel the active focus session first.");
        }
        if (current.status === "done" && input.status !== "done") {
          const completedSuccessor = await tx.taskDependency.findFirst({ where: { user_id: userId, predecessor_id: id, task: { status: "done" } } });
          if (completedSuccessor) throw new WorkError(409, "TASK_BLOCKED", "Reopen completed successor tasks before reopening this predecessor.");
        }
        const updated = await tx.task.updateMany({ where: { id, user_id: userId, version: input.version }, data: { status: input.status, completed_at: input.status === "done" ? now() : null, version: { increment: 1 } } });
        if (updated.count !== 1) throw new WorkError(409, "VERSION_CONFLICT", "The task changed. Refresh and try again.");
        const task = await ownedTask(tx, userId, id);
        await appendEvent(tx, task, { eventType: "status_changed", fromStatus: current.status, previousProjectId: current.project_id });
        return taskDto(task);
      });
    },

    async setTaskArchived(userId, id, version, archived) {
      return db.$transaction(async (tx) => {
        if (archived) await reconcilePomodoroForUser(tx, userId, now());
        const current = await ownedTask(tx, userId, id);
        assertVersion(current.version, version);
        await assertProjectActive(tx, userId, current.project_id);
        if ((current.archived_at !== null) === archived) return taskDto(current);
        if (archived) {
          const focus = await tx.pomodoroSession.findFirst({ where: { user_id: userId, task_id: id, phase: "focus", status: { in: ["running", "paused"] } } });
          if (focus) throw new WorkError(409, "POMODORO_IN_PROGRESS", "Finish or cancel the active focus session first.");
        }
        const updated = await tx.task.updateMany({ where: { id, user_id: userId, version }, data: { archived_at: archived ? now() : null, version: { increment: 1 } } });
        if (updated.count !== 1) throw new WorkError(409, "VERSION_CONFLICT", "The task changed. Refresh and try again.");
        const task = await ownedTask(tx, userId, id);
        await appendEvent(tx, task, { eventType: archived ? "archived" : "unarchived", fromStatus: current.status, previousProjectId: current.project_id });
        return taskDto(task);
      });
    },

    async listTaskEvents(userId, taskId, query) {
      await ownedTask(db, userId, taskId);
      const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
      if (!user) throw new WorkError(404, "NOT_FOUND", "User not found.");
      const today = localDate(now(), user.timezone);
      const from = query.from ?? `${today.slice(0, 8)}01`;
      const to = query.to ?? today;
      const where: Prisma.TaskEventWhereInput = { user_id: userId, task_id: taskId, occurred_at: { gte: zonedStart(from, user.timezone), lt: zonedStart(addDays(to, 1), user.timezone) } };
      const [rows, total] = await Promise.all([
        db.taskEvent.findMany({ where, orderBy: [{ occurred_at: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.taskEvent.count({ where }),
      ]);
      return { data: rows.map(eventDto), meta: { page: query.page, page_size: query.pageSize, total } };
    },
  };
}
