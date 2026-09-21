export type ProjectStatus = "active" | "completed" | "archived";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type TaskEventType = "created" | "edited" | "status_changed" | "project_changed" | "archived" | "unarchived";

export type ProjectDto = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  completed_at: string | null;
  archived_at: string | null;
  done_count: number;
  task_count: number;
  progress_percent: number;
};

export type TaskDto = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  recurrence_rule_id: string | null;
  occurrence_date: string | null;
  rule_version: number | null;
};

export type TaskEventDto = {
  id: string;
  task_id: string;
  task_version: number;
  event_type: TaskEventType;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  previous_project_id: string | null;
  project_id_at_event: string | null;
  task_title_snapshot: string;
  project_name_snapshot: string | null;
  archived: boolean;
  occurred_at: string;
};

export type Page<T> = { data: T[]; meta: { page: number; page_size: number; total: number } };
export type Mutation<T> = { data: T; status: number; replayed?: boolean };

export type ProjectListQuery = { status: ProjectStatus | "all"; page: number; pageSize: number };
export type TaskListQuery = {
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
  personal?: boolean;
  overdue?: boolean;
  dueFrom?: string;
  dueTo?: string;
  archived: boolean | "all";
  page: number;
  pageSize: number;
};

export interface M1Service {
  listProjects(userId: string, query: ProjectListQuery): Promise<Page<ProjectDto>>;
  getProject(userId: string, id: string): Promise<ProjectDto>;
  createProject(userId: string, input: { name: string; description?: string | null }, key: string): Promise<Mutation<ProjectDto>>;
  patchProject(userId: string, id: string, input: { version: number; name?: string; description?: string | null }): Promise<ProjectDto>;
  setProjectStatus(userId: string, id: string, input: { version: number; status: ProjectStatus }): Promise<ProjectDto>;
  listTasks(userId: string, query: TaskListQuery): Promise<Page<TaskDto>>;
  getTask(userId: string, id: string): Promise<TaskDto>;
  createTask(userId: string, input: { title: string; description?: string | null; project_id?: string | null; priority?: TaskPriority; due_date?: string | null }, key: string): Promise<Mutation<TaskDto>>;
  patchTask(userId: string, id: string, input: { version: number; title?: string; description?: string | null; project_id?: string | null; priority?: TaskPriority; due_date?: string | null }): Promise<TaskDto>;
  setTaskStatus(userId: string, id: string, input: { version: number; status: TaskStatus }): Promise<TaskDto>;
  setTaskArchived(userId: string, id: string, version: number, archived: boolean): Promise<TaskDto>;
  listTaskEvents(userId: string, taskId: string, query: { from?: string; to?: string; page: number; pageSize: number }): Promise<Page<TaskEventDto>>;
}

export class WorkError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields: Record<string, string> = {}) {
    super(message);
    this.name = "WorkError";
  }
}
