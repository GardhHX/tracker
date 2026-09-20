import { useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconPlus, IconTasks } from "@/components/icons";

type Status = "todo" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";
type ViewTab = "list" | "kanban" | "history";

type Task = {
  id: string;
  title: string;
  description?: string;
  project?: string;
  status: Status;
  priority: Priority;
  dueDate?: string; // ISO date (YYYY-MM-DD)
  archived: boolean;
  completedAt?: string; // ISO datetime, cleared on reopen
  dependsOn: string[]; // predecessor task ids, same project only (REQ-07)
};

type HistoryEvent = {
  id: string;
  taskId: string;
  title: string;
  project?: string;
  completedAt: string; // ISO datetime
};

const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };
const STATUS_LABEL: Record<Status, string> = { todo: "Todo", in_progress: "In Progress", done: "Done" };

// Fixed so the sample "Overdue"/"Upcoming" split stays reproducible regardless of
// the real device clock. Sample data only, per the "Sample data" tag on the page.
const DEMO_TODAY = new Date("2026-09-19T00:00:00");

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDateLong(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "done") return false;
  return new Date(task.dueDate + "T00:00:00") < DEMO_TODAY;
}

const SEED_TASKS: Task[] = [
  {
    id: "t1",
    title: "Collect traction data",
    project: "Q4 Launch",
    status: "todo",
    priority: "medium",
    dueDate: "2026-09-20",
    archived: false,
    dependsOn: [],
  },
  {
    id: "t2",
    title: "Prepare investor slides",
    description: "Ten slides covering traction, market size, and the ask.",
    project: "Q4 Launch",
    status: "todo",
    priority: "high",
    dueDate: "2026-09-10",
    archived: false,
    dependsOn: ["t1"],
  },
  {
    id: "t3",
    title: "Competitor research",
    project: "Q4 Launch",
    status: "todo",
    priority: "medium",
    dueDate: "2026-09-28",
    archived: false,
    dependsOn: [],
  },
  {
    id: "t4",
    title: "Design finance module wireframe",
    project: "Tracker",
    status: "in_progress",
    priority: "medium",
    archived: false,
    dependsOn: [],
  },
  {
    id: "t5",
    title: "Draft PRD v0.2",
    project: "Tracker",
    status: "done",
    priority: "medium",
    completedAt: "2026-09-16T14:22:00",
    archived: false,
    dependsOn: [],
  },
  {
    id: "t6",
    title: "Buy train ticket",
    status: "todo",
    priority: "low",
    dueDate: "2026-10-02",
    archived: false,
    dependsOn: [],
  },
  {
    id: "t7",
    title: "Book venue for launch event",
    project: "Q4 Launch",
    status: "done",
    priority: "medium",
    completedAt: "2026-09-10T16:03:00",
    archived: true,
    dependsOn: [],
  },
];

const SEED_HISTORY: HistoryEvent[] = [
  { id: "ev1", taskId: "t5", title: "Draft PRD v0.2", project: "Tracker", completedAt: "2026-09-16T14:22:00" },
  { id: "ev2", taskId: "t7", title: "Book venue for launch event", project: "Q4 Launch", completedAt: "2026-09-10T09:47:00" },
  { id: "ev3", taskId: "t7", title: "Book venue for launch event", project: "Q4 Launch", completedAt: "2026-09-10T16:03:00" },
];

function TaskForm({ projects, onCancel, onSave }: { projects: string[]; onCancel: () => void; onSave: (t: Omit<Task, "id" | "status" | "archived" | "completedAt" | "dependsOn">) => void }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [project, setProject] = useState("");
  const [error, setError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    onSave({ title: title.trim(), priority, dueDate: dueDate || undefined, project: project.trim() || undefined });
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="nt-title">
          Title <span className="req">*</span>
        </label>
        <input
          id="nt-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Prepare investor slides"
          maxLength={200}
          aria-invalid={!!error}
        />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="nt-priority">Priority</label>
        <select id="nt-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="nt-due">Due date (optional)</label>
          <input id="nt-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="nt-project">Project (optional)</label>
          <input
            id="nt-project"
            className="input"
            list="nt-project-options"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="No project"
          />
          <datalist id="nt-project-options">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save task
        </button>
      </div>
    </form>
  );
}

export default function TasksPage() {
  const [tab, setTab] = useState<ViewTab>("list");
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [history, setHistory] = useState<HistoryEvent[]>(SEED_HISTORY);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingDepFor, setAddingDepFor] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "upcoming" | "no_date">("all");
  const [showArchived, setShowArchived] = useState(false);

  const projects = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.project).filter((p): p is string => !!p))).sort(),
    [tasks]
  );

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!showArchived && t.archived) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (projectFilter === "__none__" && t.project) return false;
      if (projectFilter !== "all" && projectFilter !== "__none__" && t.project !== projectFilter) return false;
      if (dueFilter === "overdue" && !isOverdue(t)) return false;
      if (dueFilter === "upcoming" && (!t.dueDate || isOverdue(t) || t.status === "done")) return false;
      if (dueFilter === "no_date" && t.dueDate) return false;
      return true;
    });
  }, [tasks, showArchived, statusFilter, projectFilter, dueFilter]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  function blockingDeps(task: Task): Task[] {
    return task.dependsOn
      .map((id) => tasks.find((t) => t.id === id))
      .filter((t): t is Task => !!t && t.status !== "done");
  }

  function setTaskStatus(id: string, status: Status) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    if (status === "done" && blockingDeps(task).length > 0) return;
    if (status === "done") {
      const nowIso = new Date().toISOString();
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status, completedAt: nowIso } : t)));
      setHistory((prev) => [{ id: `ev-${Date.now()}`, taskId: id, title: task.title, project: task.project, completedAt: nowIso }, ...prev]);
    } else if (task.status === "done") {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status, completedAt: undefined } : t)));
    } else {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    }
  }

  function toggleArchived(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: !t.archived } : t)));
  }

  function addTask(input: Omit<Task, "id" | "status" | "archived" | "completedAt" | "dependsOn">) {
    setTasks((prev) => [...prev, { ...input, id: `t-${Date.now()}`, status: "todo", archived: false, dependsOn: [] }]);
    setAdding(false);
  }

  function removeDependency(taskId: string, depId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== depId) } : t)));
  }

  function addDependency(taskId: string, depId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dependsOn: [...t.dependsOn, depId] } : t)));
    setAddingDepFor(null);
  }

  function dependencyCandidates(task: Task) {
    return tasks.filter(
      (t) =>
        t.id !== task.id &&
        !t.archived &&
        t.project === task.project &&
        !task.dependsOn.includes(t.id) &&
        !t.dependsOn.includes(task.id)
    );
  }

  const sortedHistory = useMemo(() => [...history].sort((a, b) => b.completedAt.localeCompare(a.completedAt)), [history]);
  const historyByDate = useMemo(() => {
    const groups = new Map<string, HistoryEvent[]>();
    for (const ev of sortedHistory) {
      const day = fmtDateLong(ev.completedAt);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(ev);
    }
    return Array.from(groups.entries());
  }, [sortedHistory]);

  function priorityChip(task: Task) {
    return <span className="chip">{PRIORITY_LABEL[task.priority]}</span>;
  }
  function dueLabel(task: Task) {
    if (task.status === "done") return task.completedAt ? `Done ${fmtDate(task.completedAt.slice(0, 10))}` : "Done";
    if (isOverdue(task)) return "Overdue";
    if (task.dueDate) return fmtDate(task.dueDate);
    return "No due date";
  }

  return (
    <AppShell active="tasks" title="Tasks">
      <div className="page-head">
        <h1>Tasks</h1>
        <span className="sample-tag">Sample data</span>
      </div>

      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Tasks view">
          <button role="tab" aria-selected={tab === "list"} onClick={() => setTab("list")} type="button">
            List
          </button>
          <button role="tab" aria-selected={tab === "kanban"} onClick={() => setTab("kanban")} type="button">
            Kanban
          </button>
          <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")} type="button">
            History
          </button>
        </div>

        {tab !== "history" && (
          <>
            <select className="filter-select" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | Status)}>
              <option value="all">Status: All</option>
              <option value="todo">Status: Todo</option>
              <option value="in_progress">Status: In Progress</option>
              <option value="done">Status: Done</option>
            </select>
            <select className="filter-select" aria-label="Filter by project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="all">Project: All</option>
              <option value="__none__">No project</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  Project: {p}
                </option>
              ))}
            </select>
            <select className="filter-select" aria-label="Filter by due date" value={dueFilter} onChange={(e) => setDueFilter(e.target.value as typeof dueFilter)}>
              <option value="all">Due: All</option>
              <option value="overdue">Due: Overdue</option>
              <option value="upcoming">Due: Upcoming</option>
              <option value="no_date">Due: No date</option>
            </select>
            <select
              className="filter-select"
              aria-label="Show archived tasks"
              value={showArchived ? "show" : "hide"}
              onChange={(e) => setShowArchived(e.target.value === "show")}
            >
              <option value="hide">Archived: Hide</option>
              <option value="show">Archived: Show</option>
            </select>
          </>
        )}

        <span className="spacer" />
        {tab !== "history" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <IconPlus width={16} height={16} /> New task
          </button>
        )}
      </div>

      {tab === "list" &&
        (visibleTasks.length === 0 ? (
          <div className="empty-state">
            <span className="es-ic" aria-hidden>
              <IconTasks width={22} height={22} />
            </span>
            <h1>{tasks.length === 0 ? "No tasks yet" : "No tasks match these filters"}</h1>
            <p>
              {tasks.length === 0
                ? "Personal and project tasks you create will show up here, filterable by status, project, and due date."
                : "Try widening a filter, or clear them to see every task."}
            </p>
            {tasks.length === 0 && (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Create your first task
              </button>
            )}
          </div>
        ) : (
          <div className="task-list">
            {visibleTasks.map((t) => (
              <div className={`task-row${isOverdue(t) ? " is-overdue" : ""}`} key={t.id}>
                <button
                  type="button"
                  className={`chk-btn${t.status === "done" ? " is-done" : ""}`}
                  aria-pressed={t.status === "done"}
                  aria-label={t.status === "done" ? `Reopen ${t.title}` : `Mark ${t.title} as done`}
                  disabled={t.status !== "done" && blockingDeps(t).length > 0}
                  title={t.status !== "done" && blockingDeps(t).length > 0 ? `Blocked by: ${blockingDeps(t)[0].title}` : undefined}
                  onClick={() => setTaskStatus(t.id, t.status === "done" ? "todo" : "done")}
                >
                  {t.status === "done" && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
                <button type="button" className={`task-row-title${t.status === "done" ? " is-done" : ""}`} onClick={() => setSelectedTaskId(t.id)}>
                  {t.title}
                </button>
                <div className="task-row-meta">
                  {t.archived && <span className="chip">Archived</span>}
                  {t.project && <span className="chip">{t.project}</span>}
                  {priorityChip(t)}
                  <span className="task-row-due tnum">{dueLabel(t)}</span>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === "kanban" && (
        <>
          <div className="kanban">
            {(["todo", "in_progress", "done"] as Status[]).map((status) => {
              const inCol = visibleTasks.filter((t) => t.status === status);
              return (
                <div className="kan-col" key={status}>
                  <div className="kan-col-head">
                    <span>{STATUS_LABEL[status]}</span>
                    <span className="count-badge">{inCol.length}</span>
                  </div>
                  {inCol.map((t) => (
                    <div className={`kan-card${t.status === "done" ? " is-done" : ""}`} key={t.id}>
                      <button type="button" className="task-row-title" style={{ padding: 0 }} onClick={() => setSelectedTaskId(t.id)}>
                        <span className="kc-title">{t.title}</span>
                      </button>
                      <div className="kc-meta">
                        {t.project && <span className="chip">{t.project}</span>}
                        {priorityChip(t)}
                        {isOverdue(t) && <span className="chip-flag">Overdue</span>}
                      </div>
                      <div className="kc-move">
                        <label className="field-hint" htmlFor={`mv-${t.id}`}>
                          Move to
                        </label>
                        <select
                          id={`mv-${t.id}`}
                          value={t.status}
                          disabled={t.status !== "done" && blockingDeps(t).length > 0 && status !== "done"}
                          onChange={(e) => setTaskStatus(t.id, e.target.value as Status)}
                        >
                          <option value="todo">Todo</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done" disabled={blockingDeps(t).length > 0}>
                            Done
                          </option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="field-hint" style={{ marginTop: 16 }}>
            The status picker is the keyboard-operable alternative to dragging a card between columns.
          </p>
        </>
      )}

      {tab === "history" && (
        <div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Completion events for this session, not current status. Reopening a task and completing it again adds a second
            event without losing the first.
          </p>
          {historyByDate.length === 0 ? (
            <div className="empty-state">
              <h1>No completions yet</h1>
              <p>Mark a task done from the List or Kanban view to see it appear here.</p>
            </div>
          ) : (
            historyByDate.map(([day, events]) => (
              <div key={day}>
                <div className="history-date">{day}</div>
                {events.map((ev) => (
                  <div className="history-row" key={ev.id}>
                    <span
                      className="chk-btn is-done"
                      style={{ pointerEvents: "none", width: 22, height: 22 }}
                      aria-hidden
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    <span>{ev.title}</span>
                    {ev.project && <span className="chip">{ev.project}</span>}
                    <span className="hr-time tnum">Completed {fmtDateTime(ev.completedAt)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {adding && (
        <Modal title="New task" onClose={() => setAdding(false)}>
          <TaskForm projects={projects} onCancel={() => setAdding(false)} onSave={addTask} />
        </Modal>
      )}

      {selectedTask && (
        <Modal title={selectedTask.title} onClose={() => setSelectedTaskId(null)}>
          <div className="detail-chips">
            {selectedTask.status === "done" && <span className="chip">Done</span>}
            {selectedTask.archived && <span className="chip">Archived</span>}
            {isOverdue(selectedTask) && <span className="chip-flag">Overdue</span>}
            {selectedTask.status !== "done" && priorityChip(selectedTask)}
            {selectedTask.project && <span className="chip">{selectedTask.project}</span>}
          </div>

          {selectedTask.description && <p className="detail-desc">{selectedTask.description}</p>}

          {selectedTask.status !== "done" && (
            <div className="detail-section">
              <label>Dependencies (predecessors)</label>
              {selectedTask.dependsOn.length === 0 && !addingDepFor && (
                <p className="field-hint" style={{ marginBottom: 8 }}>
                  No dependencies.
                </p>
              )}
              {selectedTask.dependsOn.map((depId) => {
                const dep = tasks.find((t) => t.id === depId);
                if (!dep) return null;
                const blocking = dep.status !== "done";
                return (
                  <div className="dep-row" key={depId}>
                    <span className={`dep-name${blocking ? " is-blocking" : ""}`}>
                      {dep.title}
                      {blocking ? " — not done yet" : " — done"}
                    </span>
                    <button type="button" className="btn btn-sm" onClick={() => removeDependency(selectedTask.id, depId)}>
                      Remove
                    </button>
                  </div>
                );
              })}
              {addingDepFor === selectedTask.id ? (
                dependencyCandidates(selectedTask).length === 0 ? (
                  <p className="field-hint">No eligible tasks in the same project.</p>
                ) : (
                  <select
                    className="input"
                    style={{ marginTop: 8 }}
                    defaultValue=""
                    onChange={(e) => e.target.value && addDependency(selectedTask.id, e.target.value)}
                  >
                    <option value="" disabled>
                      Choose a task&hellip;
                    </option>
                    {dependencyCandidates(selectedTask).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )
              ) : (
                <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setAddingDepFor(selectedTask.id)}>
                  <IconPlus width={14} height={14} /> Add dependency
                </button>
              )}
            </div>
          )}

          <div className="detail-section">
            <label>History</label>
            <div className="detail-hist-row">
              <span className="dh-k">Created</span>
              <span className="tnum">{STATUS_LABEL[selectedTask.status]}</span>
            </div>
            {selectedTask.completedAt && (
              <div className="detail-hist-row">
                <span className="dh-k">Completed</span>
                <span className="tnum">{fmtDateLong(selectedTask.completedAt)}, {fmtDateTime(selectedTask.completedAt)}</span>
              </div>
            )}
          </div>

          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={selectedTask.status !== "done" && blockingDeps(selectedTask).length > 0}
              onClick={() => setTaskStatus(selectedTask.id, selectedTask.status === "done" ? "todo" : "done")}
            >
              {selectedTask.status === "done" ? "Reopen" : "Mark done"}
            </button>
            {selectedTask.status !== "done" && <button className="btn" type="button">Start Pomodoro</button>}
            <button type="button" className="btn" onClick={() => toggleArchived(selectedTask.id)}>
              {selectedTask.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
          {selectedTask.status !== "done" && blockingDeps(selectedTask).length > 0 && (
            <p className="blocked-hint">Blocked by: {blockingDeps(selectedTask).map((d) => d.title).join(", ")}</p>
          )}
        </Modal>
      )}
    </AppShell>
  );
}
