import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconPlus, IconTasks } from "@/components/icons";
import {
  TrackerApiError,
  createTask,
  listProjects,
  listTaskEvents,
  listTasks,
  patchTask,
  setTaskArchived,
  setTaskStatus,
  type ProjectDto,
  type TaskDto,
  type TaskEventDto,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/api";

type ViewTab = "list" | "kanban" | "history";
const STATUS_LABEL: Record<TaskStatus, string> = { todo: "Todo", in_progress: "In Progress", done: "Done" };
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High" };

function message(error: unknown) {
  return error instanceof TrackerApiError ? error.message : "The request could not be completed.";
}

function TaskForm({ task, projects, onCancel, onSave }: { task?: TaskDto; projects: ProjectDto[]; onCancel: () => void; onSave: (value: { title: string; description: string | null; project_id: string | null; priority: TaskPriority; due_date: string | null }) => Promise<void> }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState(task?.project_id ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    setError("");
    try {
      await onSave({ title: title.trim(), description: description.trim() || null, project_id: projectId || null, priority, due_date: dueDate || null });
    } catch (cause) {
      setError(message(cause));
      setSaving(false);
    }
  }

  return <form onSubmit={submit} noValidate>
    {error && <div className="form-alert error" role="alert">{error}</div>}
    <div className="field"><label htmlFor="task-title">Title</label><input id="task-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /></div>
    <div className="field"><label htmlFor="task-description">Description</label><textarea id="task-description" className="input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={3} /></div>
    <div className="field"><label htmlFor="task-project">Project</label><select id="task-project" className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.filter((project) => project.status === "active" || project.id === task?.project_id).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>
    <div style={{ display: "flex", gap: 12 }}>
      <div className="field" style={{ flex: 1 }}><label htmlFor="task-priority">Priority</label><select id="task-priority" className="input" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
      <div className="field" style={{ flex: 1 }}><label htmlFor="task-due">Due date</label><input id="task-due" className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
    </div>
    <div className="modal-foot"><button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : task ? "Save changes" : "Create task"}</button></div>
  </form>;
}

export default function TasksPage() {
  const [tab, setTab] = useState<ViewTab>("list");
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [events, setEvents] = useState<TaskEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "upcoming" | "no_date">("all");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [taskPage, projectPage] = await Promise.all([listTasks(), listProjects("all")]);
      setTasks(taskPage.data); setProjects(projectPage.data);
    } catch (cause) { setError(message(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (tab !== "history") return;
    setHistoryLoading(true);
    Promise.all(tasks.map((task) => listTaskEvents(task.id)))
      .then((pages) => setEvents(pages.flatMap((page) => page.data).filter((event) => event.event_type === "status_changed" && event.to_status === "done").sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))))
      .catch((cause) => setError(message(cause)))
      .finally(() => setHistoryLoading(false));
  }, [tab, tasks]);

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const activeProjectIds = useMemo(() => new Set(projects.filter((project) => project.status === "active").map((project) => project.id)), [projects]);
  const isLocked = (task: TaskDto) => Boolean(task.project_id && !activeProjectIds.has(task.project_id));
  const today = new Date().toISOString().slice(0, 10);
  const visible = tasks.filter((task) => {
    if (!showArchived && task.archived_at) return false;
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (projectFilter === "personal" && task.project_id) return false;
    if (projectFilter !== "all" && projectFilter !== "personal" && task.project_id !== projectFilter) return false;
    const overdue = Boolean(task.due_date && task.due_date < today && task.status !== "done");
    if (dueFilter === "overdue" && !overdue) return false;
    if (dueFilter === "upcoming" && (!task.due_date || overdue || task.status === "done")) return false;
    if (dueFilter === "no_date" && task.due_date) return false;
    return true;
  });
  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  function replace(next: TaskDto) { setTasks((current) => current.map((task) => task.id === next.id ? next : task)); }
  async function mutate(work: () => Promise<TaskDto>) {
    setError("");
    try { replace(await work()); }
    catch (cause) { setError(message(cause)); if (cause instanceof TrackerApiError && cause.code === "VERSION_CONFLICT") await load(); }
  }

  return <AppShell active="tasks" title="Tasks">
    <div className="page-head"><h1>Tasks</h1></div>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="btn btn-sm" type="button" onClick={() => void load()}>Retry</button></div>}
    <div className="toolbar">
      <div className="seg" role="tablist" aria-label="Tasks view">{(["list", "kanban", "history"] as ViewTab[]).map((value) => <button key={value} role="tab" aria-selected={tab === value} type="button" onClick={() => setTab(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      {tab !== "history" && <>
        <select className="filter-select" aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Status: All</option><option value="todo">Status: Todo</option><option value="in_progress">Status: In Progress</option><option value="done">Status: Done</option></select>
        <select className="filter-select" aria-label="Filter by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="all">Project: All</option><option value="personal">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>Project: {project.name}</option>)}</select>
        <select className="filter-select" aria-label="Filter by due date" value={dueFilter} onChange={(event) => setDueFilter(event.target.value as typeof dueFilter)}><option value="all">Due: All</option><option value="overdue">Due: Overdue</option><option value="upcoming">Due: Upcoming</option><option value="no_date">Due: No date</option></select>
        <select className="filter-select" aria-label="Show archived tasks" value={showArchived ? "show" : "hide"} onChange={(event) => setShowArchived(event.target.value === "show")}><option value="hide">Archived: Hide</option><option value="show">Archived: Show</option></select>
      </>}
      <span className="spacer" />{tab !== "history" && <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><IconPlus width={16} height={16} /> New task</button>}
    </div>

    {loading ? <div className="empty-state"><p>Loading tasks…</p></div> : tab === "history" ? (
      historyLoading ? <div className="empty-state"><p>Loading history…</p></div> : events.length === 0 ? <div className="empty-state"><h1>No completed-task history this month</h1><p>Completion events remain here even after a task is reopened or moved.</p></div> : <div className="task-list">{events.map((event) => <div className="history-row" key={event.id}><div><strong>{event.task_title_snapshot}</strong><div className="field-hint">{new Date(event.occurred_at).toLocaleString()}</div></div><div className="task-row-meta">{event.project_name_snapshot && <span className="chip">{event.project_name_snapshot}</span>}<span className="chip">Completed</span></div></div>)}</div>
    ) : tab === "kanban" ? <div className="kanban">{(["todo", "in_progress", "done"] as TaskStatus[]).map((status) => <div className="kan-col" key={status}><div className="kan-col-head"><span>{STATUS_LABEL[status]}</span><span className="count-badge">{visible.filter((task) => task.status === status).length}</span></div>{visible.filter((task) => task.status === status).map((task) => <div className={`kan-card${task.status === "done" ? " is-done" : ""}`} key={task.id}><button type="button" className="task-row-title" onClick={() => setSelectedId(task.id)}>{task.title}</button><div className="kc-meta">{task.project_id && <span className="chip">{projectNames.get(task.project_id)}</span>}<span className="chip">{PRIORITY_LABEL[task.priority]}</span>{isLocked(task) && <span className="chip">Project closed</span>}</div><div className="kc-move"><label htmlFor={`move-${task.id}`} className="field-hint">Move to</label><select id={`move-${task.id}`} value={task.status} disabled={Boolean(task.archived_at) || isLocked(task)} onChange={(event) => void mutate(() => setTaskStatus(task.id, { version: task.version, status: event.target.value as TaskStatus }))}><option value="todo">Todo</option><option value="in_progress">In Progress</option><option value="done">Done</option></select></div></div>)}</div>)}</div>
    : visible.length === 0 ? <div className="empty-state"><span className="es-ic" aria-hidden><IconTasks width={22} height={22} /></span><h1>{tasks.length ? "No tasks match these filters" : "No tasks yet"}</h1><p>{tasks.length ? "Change a filter to see other tasks." : "Create a task to start tracking work."}</p>{!tasks.length && <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>Create your first task</button>}</div>
    : <div className="task-list">{visible.map((task) => <div className="task-row" key={task.id}><button type="button" className={`chk-btn${task.status === "done" ? " is-done" : ""}`} disabled={Boolean(task.archived_at) || isLocked(task)} aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} title={isLocked(task) ? "Reopen the project before changing this task." : undefined} onClick={() => void mutate(() => setTaskStatus(task.id, { version: task.version, status: task.status === "done" ? "todo" : "done" }))}>{task.status === "done" ? "✓" : ""}</button><button type="button" className={`task-row-title${task.status === "done" ? " is-done" : ""}`} onClick={() => setSelectedId(task.id)}>{task.title}</button><div className="task-row-meta">{task.archived_at && <span className="chip">Archived</span>}{task.project_id && <span className="chip">{projectNames.get(task.project_id)}</span>}{isLocked(task) && <span className="chip">Project closed</span>}<span className="chip">{PRIORITY_LABEL[task.priority]}</span><span className="task-row-due">{task.due_date ?? "No due date"}</span></div></div>)}</div>}

    {adding && <Modal title="New task" onClose={() => setAdding(false)}><TaskForm projects={projects} onCancel={() => setAdding(false)} onSave={async (value) => { const created = await createTask(value); setTasks((current) => [created, ...current]); setAdding(false); }} /></Modal>}
    {selected && !editing && <Modal title={selected.title} onClose={() => setSelectedId(null)}><div className="detail-chips"><span className="chip">{STATUS_LABEL[selected.status]}</span><span className="chip">{PRIORITY_LABEL[selected.priority]}</span>{selected.project_id && <span className="chip">{projectNames.get(selected.project_id)}</span>}{selected.archived_at && <span className="chip">Archived</span>}</div>{selected.description && <p className="detail-desc">{selected.description}</p>}{isLocked(selected) && <p className="info-note">Reopen the project before changing this task.</p>}<div className="detail-actions"><button className="btn btn-primary" type="button" disabled={Boolean(selected.archived_at) || isLocked(selected)} onClick={() => void mutate(() => setTaskStatus(selected.id, { version: selected.version, status: selected.status === "done" ? "todo" : "done" }))}>{selected.status === "done" ? "Reopen" : "Mark done"}</button><button className="btn" type="button" disabled={Boolean(selected.archived_at) || isLocked(selected)} onClick={() => setEditing(true)}>Edit</button><button className="btn" type="button" disabled={isLocked(selected)} onClick={() => void mutate(() => setTaskArchived(selected.id, selected.version, !selected.archived_at))}>{selected.archived_at ? "Unarchive" : "Archive"}</button></div></Modal>}
    {selected && editing && <Modal title={`Edit ${selected.title}`} onClose={() => setEditing(false)}><TaskForm task={selected} projects={projects} onCancel={() => setEditing(false)} onSave={async (value) => { replace(await patchTask(selected.id, { version: selected.version, ...value })); setEditing(false); }} /></Modal>}
  </AppShell>;
}
