import { useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconArrowLeft, IconKanban, IconLock, IconPlus } from "@/components/icons";

type ProjStatus = "active" | "completed" | "archived";
type TaskStatus = "todo" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";
type DetailView = "board" | "list";
type StatusFilter = "active" | "completed" | "archived" | "all";

type Project = {
  id: string;
  name: string;
  description?: string;
  completed: boolean; // completed_at set (REQ-06: independent of archived)
  archived: boolean; // archived_at set
};

type PTask = {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  archived: boolean;
  dependsOn: string[]; // predecessor task ids, same project only (REQ-07)
};

const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };
const STATUS_LABEL: Record<TaskStatus, string> = { todo: "Todo", in_progress: "In Progress", done: "Done" };
const ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

const SEED_PROJECTS: Project[] = [
  { id: "p-q4", name: "Q4 Launch", description: "Everything that has to ship for the launch event.", completed: false, archived: false },
  { id: "p-mvp", name: "Tracker MVP", description: "First usable version of the tracker itself.", completed: false, archived: false },
  { id: "p-home", name: "Home Renovation", completed: false, archived: false },
  { id: "p-legacy", name: "Legacy Website Migration", description: "Moved the old marketing site to the new stack.", completed: true, archived: true },
];

const SEED_TASKS: PTask[] = [
  // Q4 Launch: 3 todo, 2 in progress, 7 done = 12 total, 7 done -> 58%
  { id: "q1", projectId: "p-q4", title: "Final design approval", description: "Sign-off on the final artwork. One task depends on this.", status: "todo", priority: "high", archived: false, dependsOn: [] },
  { id: "q2", projectId: "p-q4", title: "Write launch email", status: "todo", priority: "medium", archived: false, dependsOn: [] },
  { id: "q3", projectId: "p-q4", title: "Brief the sales team", status: "todo", priority: "low", archived: false, dependsOn: [] },
  { id: "q4", projectId: "p-q4", title: "Send to print", description: "Final print files to the vendor. Waits on the design being signed off.", status: "in_progress", priority: "high", archived: false, dependsOn: ["q1"] },
  { id: "q5", projectId: "p-q4", title: "Set up landing page", status: "in_progress", priority: "medium", archived: false, dependsOn: [] },
  { id: "q6", projectId: "p-q4", title: "Venue booking", status: "done", priority: "medium", archived: false, dependsOn: [] },
  { id: "q7", projectId: "p-q4", title: "Confirm keynote speaker", status: "done", priority: "high", archived: false, dependsOn: [] },
  { id: "q8", projectId: "p-q4", title: "Order banners", status: "done", priority: "low", archived: false, dependsOn: [] },
  { id: "q9", projectId: "p-q4", title: "Draft press release", status: "done", priority: "medium", archived: false, dependsOn: [] },
  { id: "q10", projectId: "p-q4", title: "Line up catering", status: "done", priority: "low", archived: false, dependsOn: [] },
  { id: "q11", projectId: "p-q4", title: "Build guest list", status: "done", priority: "medium", archived: false, dependsOn: [] },
  { id: "q12", projectId: "p-q4", title: "Reserve AV gear", status: "done", priority: "low", archived: false, dependsOn: [] },
  // Tracker MVP: 3 done of 9 -> 33%
  { id: "m1", projectId: "p-mvp", title: "Set up the repo", status: "done", priority: "high", archived: false, dependsOn: [] },
  { id: "m2", projectId: "p-mvp", title: "Write the PRD", status: "done", priority: "high", archived: false, dependsOn: [] },
  { id: "m3", projectId: "p-mvp", title: "Pick the stack", status: "done", priority: "medium", archived: false, dependsOn: [] },
  { id: "m4", projectId: "p-mvp", title: "Build the app shell", status: "in_progress", priority: "high", archived: false, dependsOn: [] },
  { id: "m5", projectId: "p-mvp", title: "Design the finance module", status: "in_progress", priority: "medium", archived: false, dependsOn: [] },
  { id: "m6", projectId: "p-mvp", title: "Wire up authentication", status: "todo", priority: "high", archived: false, dependsOn: [] },
  { id: "m7", projectId: "p-mvp", title: "Model the database", status: "todo", priority: "high", archived: false, dependsOn: [] },
  { id: "m8", projectId: "p-mvp", title: "Write integration tests", status: "todo", priority: "medium", archived: false, dependsOn: ["m7"] },
  { id: "m9", projectId: "p-mvp", title: "Set up CI", status: "todo", priority: "low", archived: false, dependsOn: [] },
  // Legacy Website Migration: 5 of 5 done -> 100%
  { id: "l1", projectId: "p-legacy", title: "Audit old pages", status: "done", priority: "medium", archived: false, dependsOn: [] },
  { id: "l2", projectId: "p-legacy", title: "Rebuild templates", status: "done", priority: "high", archived: false, dependsOn: [] },
  { id: "l3", projectId: "p-legacy", title: "Migrate content", status: "done", priority: "medium", archived: false, dependsOn: [] },
  { id: "l4", projectId: "p-legacy", title: "Set up redirects", status: "done", priority: "high", archived: false, dependsOn: [] },
  { id: "l5", projectId: "p-legacy", title: "Cut over DNS", status: "done", priority: "high", archived: false, dependsOn: [] },
];

function ProjectForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: { name: string; description?: string }) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("A project name is required.");
      return;
    }
    onSave({ name: name.trim(), description: description.trim() || undefined });
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="np-name">
          Name <span className="req">*</span>
        </label>
        <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 Launch" maxLength={120} aria-invalid={!!error} />
      </div>
      <div className="field" style={{ marginBottom: 4 }}>
        <label htmlFor="np-desc">Description (optional)</label>
        <textarea id="np-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this project is for." maxLength={5000} rows={3} style={{ minHeight: 84, padding: "10px 14px", lineHeight: 1.5, resize: "vertical" }} />
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        A new project starts Active with 0% progress. Add tasks to it from the project.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create project
        </button>
      </div>
    </form>
  );
}

function TaskForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: { title: string; priority: Priority }) => void }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [error, setError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("A task title is required.");
      return;
    }
    onSave({ title: title.trim(), priority });
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
        <input id="nt-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send to print" maxLength={200} aria-invalid={!!error} />
      </div>
      <div className="field" style={{ marginBottom: 4 }}>
        <label htmlFor="nt-priority">Priority</label>
        <select id="nt-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Add task
        </button>
      </div>
    </form>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [tasks, setTasks] = useState<PTask[]>(SEED_TASKS);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<DetailView>("board");
  const [addingProject, setAddingProject] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addingDepFor, setAddingDepFor] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [completeError, setCompleteError] = useState(false);

  function statusOf(p: Project): ProjStatus {
    if (p.archived) return "archived";
    if (p.completed) return "completed";
    return "active";
  }

  function progressOf(projectId: string) {
    const live = tasks.filter((t) => t.projectId === projectId && !t.archived);
    const total = live.length;
    const done = live.filter((t) => t.status === "done").length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }

  const visibleProjects = useMemo(
    () => projects.filter((p) => (statusFilter === "all" ? true : statusOf(p) === statusFilter)),
    [projects, statusFilter]
  );

  const openProject = projects.find((p) => p.id === openId) ?? null;
  const projectTasks = useMemo(
    () => (openProject ? tasks.filter((t) => t.projectId === openProject.id && !t.archived) : []),
    [tasks, openProject]
  );
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  function blockingDeps(task: PTask): PTask[] {
    return task.dependsOn.map((id) => tasks.find((t) => t.id === id)).filter((t): t is PTask => !!t && t.status !== "done");
  }

  function setTaskStatus(id: string, status: TaskStatus) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    if (status === "done" && blockingDeps(task).length > 0) return; // blocked cannot complete (REQ-07)
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  function toggleTaskArchived(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, archived: !t.archived } : t)));
  }

  function addTaskToProject(projectId: string, input: { title: string; priority: Priority }) {
    setTasks((prev) => [...prev, { id: `t-${Date.now()}`, projectId, title: input.title, priority: input.priority, status: "todo", archived: false, dependsOn: [] }]);
    setAddingTask(false);
  }

  function addProject(input: { name: string; description?: string }) {
    const id = `p-${Date.now()}`;
    setProjects((prev) => [...prev, { id, name: input.name, description: input.description, completed: false, archived: false }]);
    setAddingProject(false);
    setStatusFilter("active");
  }

  function removeDependency(taskId: string, depId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== depId) } : t)));
  }
  function addDependency(taskId: string, depId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, dependsOn: [...t.dependsOn, depId] } : t)));
    setAddingDepFor(null);
  }
  function dependencyCandidates(task: PTask) {
    return tasks.filter((t) => t.projectId === task.projectId && t.id !== task.id && !t.archived && !task.dependsOn.includes(t.id) && !t.dependsOn.includes(task.id));
  }

  function unfinishedCount(projectId: string) {
    return tasks.filter((t) => t.projectId === projectId && !t.archived && t.status !== "done").length;
  }

  function tryComplete(project: Project) {
    if (unfinishedCount(project.id) > 0) {
      setCompleteError(true);
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, completed: true } : p)));
    setCompleteError(false);
  }
  function archiveProject(project: Project) {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, archived: true } : p)));
    setArchiveConfirm(false);
    setOpenId(null); // archived projects leave the active list
  }
  function reopenProject(project: Project) {
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, completed: false, archived: false } : p)));
  }

  function openDetail(id: string) {
    setOpenId(id);
    setView("board");
    setCompleteError(false);
  }

  function statusChips(p: Project) {
    const s = statusOf(p);
    return (
      <>
        {s === "active" && <span className="chip">Active</span>}
        {p.completed && <span className="chip">Done</span>}
        {p.archived && <span className="chip">Archived</span>}
      </>
    );
  }

  // ---------- Detail view ----------
  if (openProject) {
    const { total, done, pct } = progressOf(openProject.id);
    const blockedTasks = projectTasks.filter((t) => t.status !== "done" && blockingDeps(t).length > 0);
    const isClosed = openProject.completed || openProject.archived;

    return (
      <AppShell active="projects" title={openProject.name}>
        <button type="button" className="backlink" onClick={() => setOpenId(null)}>
          <IconArrowLeft width={15} height={15} /> Projects
        </button>

        <div className="proj-detail-head">
          <div>
            <div className="pd-title">
              {openProject.name} {statusChips(openProject)}
            </div>
            <div className="pd-sub">
              {total === 0 ? "No tasks yet" : `${done} of ${total} tasks done`}
              {(() => {
                const todo = projectTasks.filter((t) => t.status === "todo").length;
                const inProg = projectTasks.filter((t) => t.status === "in_progress").length;
                return total === 0 ? "" : ` · ${todo} todo, ${inProg} in progress`;
              })()}
            </div>
            <div className="detail-actions" style={{ marginTop: 14 }}>
              {!isClosed && (
                <>
                  <button type="button" className="btn btn-sm" onClick={() => tryComplete(openProject)}>
                    Complete project
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setArchiveConfirm(true)}>
                    Archive
                  </button>
                </>
              )}
              {isClosed && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => reopenProject(openProject)}>
                  Reopen
                </button>
              )}
              <span className="sample-tag">Sample data</span>
            </div>
          </div>
          <div className="pd-figure">
            <div className="pd-pct">{pct}%</div>
            <div className="pd-caption">complete</div>
          </div>
        </div>

        <div className="pd-bar">
          <div className="pbar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>

        {completeError && (
          <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
            <span>
              <strong>This project can&apos;t be completed yet.</strong> {unfinishedCount(openProject.id)} task
              {unfinishedCount(openProject.id) === 1 ? " is" : "s are"} still unfinished. Finish or archive them first, then mark {openProject.name} complete.
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setCompleteError(false)}>
              Got it
            </button>
          </div>
        )}

        {blockedTasks.length > 0 && (
          <div className="info-note proj-blocked" style={{ marginTop: 16 }}>
            <IconLock width={18} height={18} />
            <span>
              <strong>&quot;{blockedTasks[0].title}&quot;</strong> can&apos;t be completed while{" "}
              <strong>&quot;{blockingDeps(blockedTasks[0])[0].title}&quot;</strong> is still open. Finish that task, or remove the dependency, first.
            </span>
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="seg" role="tablist" aria-label="Task view">
            <button role="tab" aria-selected={view === "board"} type="button" onClick={() => setView("board")}>
              Board
            </button>
            <button role="tab" aria-selected={view === "list"} type="button" onClick={() => setView("list")}>
              List
            </button>
          </div>
          <span className="spacer" />
          {!isClosed && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddingTask(true)}>
              <IconPlus width={16} height={16} /> Add task
            </button>
          )}
        </div>

        {projectTasks.length === 0 ? (
          <div className="empty-state">
            <span className="es-ic" aria-hidden>
              <IconKanban width={22} height={22} />
            </span>
            <h1>No tasks yet</h1>
            <p>Add the first task to start tracking this project&apos;s progress.</p>
            {!isClosed && (
              <button type="button" className="btn btn-primary" onClick={() => setAddingTask(true)}>
                Add a task
              </button>
            )}
          </div>
        ) : view === "board" ? (
          <>
            <div className="kanban">
              {ORDER.map((status) => {
                const inCol = projectTasks.filter((t) => t.status === status);
                return (
                  <div className="kan-col" key={status}>
                    <div className="kan-col-head">
                      <span>{STATUS_LABEL[status]}</span>
                      <span className="count-badge">{inCol.length}</span>
                    </div>
                    {inCol.map((t) => {
                      const blocked = t.status !== "done" && blockingDeps(t).length > 0;
                      return (
                        <div className={`kan-card${t.status === "done" ? " is-done" : ""}`} key={t.id}>
                          <button type="button" className="task-row-title" style={{ padding: 0 }} onClick={() => setSelectedTaskId(t.id)}>
                            <span className="kc-title">{t.title}</span>
                          </button>
                          <div className="kc-meta">
                            <span className="chip">{PRIORITY_LABEL[t.priority]}</span>
                            {blocked && <span className="chip-flag">Blocked</span>}
                          </div>
                          {!isClosed && (
                            <div className="kc-move">
                              <label className="field-hint" htmlFor={`mv-${t.id}`}>
                                Move to
                              </label>
                              <select id={`mv-${t.id}`} value={t.status} onChange={(e) => setTaskStatus(t.id, e.target.value as TaskStatus)}>
                                <option value="todo">Todo</option>
                                <option value="in_progress">In Progress</option>
                                <option value="done" disabled={blocked}>
                                  {blocked ? "Done (blocked)" : "Done"}
                                </option>
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="field-hint" style={{ marginTop: 16 }}>
              The status picker is the keyboard-operable alternative to dragging a card between columns. Moving a blocked card to Done is disabled, with the reason shown on the task.
            </p>
          </>
        ) : (
          <>
            <div className="task-list">
              {projectTasks.map((t) => {
                const blocked = t.status !== "done" && blockingDeps(t).length > 0;
                return (
                  <div className="task-row" key={t.id}>
                    <button
                      type="button"
                      className={`chk-btn${t.status === "done" ? " is-done" : ""}`}
                      aria-pressed={t.status === "done"}
                      aria-label={t.status === "done" ? `Reopen ${t.title}` : `Mark ${t.title} as done`}
                      disabled={isClosed || blocked}
                      title={blocked ? `Blocked by: ${blockingDeps(t)[0].title}` : undefined}
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
                      <span className="chip">{STATUS_LABEL[t.status]}</span>
                      {blocked ? <span className="chip-flag">Blocked</span> : <span className="chip">{PRIORITY_LABEL[t.priority]}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="field-hint" style={{ marginTop: 16 }}>
              List and Board show the same tasks. A blocked task&apos;s checkbox is disabled, with the blocker named in its detail.
            </p>
          </>
        )}

        {addingTask && (
          <Modal title={`Add task to ${openProject.name}`} onClose={() => setAddingTask(false)}>
            <TaskForm onCancel={() => setAddingTask(false)} onSave={(input) => addTaskToProject(openProject.id, input)} />
          </Modal>
        )}

        {archiveConfirm && (
          <Modal title={`Archive ${openProject.name}?`} onClose={() => setArchiveConfirm(false)}>
            <p className="detail-desc">
              It will be hidden from your active projects list. All its tasks and history are kept, and nothing is auto-archived. Switch the Status
              filter to Archived to find it again, then Reopen to bring it back.
            </p>
            <div className="modal-foot">
              <button type="button" className="btn btn-quiet" onClick={() => setArchiveConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => archiveProject(openProject)}>
                Archive project
              </button>
            </div>
          </Modal>
        )}

        {selectedTask && (
          <Modal title={selectedTask.title} onClose={() => setSelectedTaskId(null)}>
            <div className="detail-chips">
              <span className="chip">{STATUS_LABEL[selectedTask.status]}</span>
              {selectedTask.status !== "done" && <span className="chip">{PRIORITY_LABEL[selectedTask.priority]}</span>}
              {selectedTask.status !== "done" && blockingDeps(selectedTask).length > 0 && <span className="chip-flag">Blocked</span>}
              <span className="chip">{openProject.name}</span>
            </div>

            {selectedTask.description && <p className="detail-desc">{selectedTask.description}</p>}

            {selectedTask.status !== "done" && (
              <div className="detail-section">
                <label>Dependencies (predecessors)</label>
                {selectedTask.dependsOn.length === 0 && addingDepFor !== selectedTask.id && (
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
                        {dep.title} {blocking ? "(not done yet)" : "(done)"}
                      </span>
                      <button type="button" className="btn btn-sm" onClick={() => removeDependency(selectedTask.id, depId)}>
                        Remove
                      </button>
                    </div>
                  );
                })}
                {addingDepFor === selectedTask.id ? (
                  dependencyCandidates(selectedTask).length === 0 ? (
                    <p className="field-hint">No eligible tasks in this project.</p>
                  ) : (
                    <select className="input" style={{ marginTop: 8 }} defaultValue="" onChange={(e) => e.target.value && addDependency(selectedTask.id, e.target.value)}>
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
                <p className="field-hint" style={{ marginTop: 8 }}>
                  Dependencies stay within this project.
                </p>
              </div>
            )}

            <div className="detail-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={isClosed || (selectedTask.status !== "done" && blockingDeps(selectedTask).length > 0)}
                onClick={() => setTaskStatus(selectedTask.id, selectedTask.status === "done" ? "todo" : "done")}
              >
                {selectedTask.status === "done" ? "Reopen" : "Mark done"}
              </button>
              <button type="button" className="btn">
                Start Pomodoro
              </button>
              <button type="button" className="btn" onClick={() => toggleTaskArchived(selectedTask.id)}>
                Archive
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

  // ---------- List view ----------
  return (
    <AppShell active="projects" title="Projects">
      <div className="page-head">
        <h1>Projects</h1>
        <span className="sample-tag">Sample data</span>
      </div>

      <div className="toolbar">
        <select className="filter-select" aria-label="Filter projects by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="active">Status: Active</option>
          <option value="completed">Status: Completed</option>
          <option value="archived">Status: Archived</option>
          <option value="all">Status: All</option>
        </select>
        <span className="spacer" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddingProject(true)}>
          <IconPlus width={16} height={16} /> New project
        </button>
      </div>

      {visibleProjects.length === 0 ? (
        <div className="empty-state">
          <span className="es-ic" aria-hidden>
            <IconKanban width={22} height={22} />
          </span>
          <h1>{projects.length === 0 ? "No projects yet" : "No projects match this filter"}</h1>
          <p>
            {projects.length === 0
              ? "Group related tasks into a project to track progress and set dependencies between them."
              : "Switch the Status filter to see projects in another state."}
          </p>
          {projects.length === 0 && (
            <button type="button" className="btn btn-primary" onClick={() => setAddingProject(true)}>
              Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className="proj-list">
          {visibleProjects.map((p) => {
            const { total, done, pct } = progressOf(p.id);
            const blocked = tasks.filter((t) => t.projectId === p.id && !t.archived && t.status !== "done" && blockingDeps(t).length > 0).length;
            return (
              <div className="proj-row" key={p.id}>
                <div className="proj-main">
                  <div className="proj-name">
                    {p.name} {statusChips(p)}
                  </div>
                  <div className="proj-sub">
                    {total === 0 ? "No tasks yet" : `${done} of ${total} tasks done`}
                    {blocked > 0 ? ` · ${blocked} task${blocked === 1 ? "" : "s"} blocked` : ""}
                  </div>
                </div>
                <div className="proj-bar-wrap">
                  <div className="pbar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="proj-pct">{pct}%</div>
                </div>
                <div>
                  <button type="button" className="btn btn-sm" onClick={() => openDetail(p.id)}>
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addingProject && (
        <Modal title="New project" onClose={() => setAddingProject(false)}>
          <ProjectForm onCancel={() => setAddingProject(false)} onSave={addProject} />
        </Modal>
      )}
    </AppShell>
  );
}
