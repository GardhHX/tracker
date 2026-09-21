import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconArrowLeft, IconKanban, IconPlus } from "@/components/icons";
import { TrackerApiError, createProject, listProjects, listTasks, patchProject, setProjectStatus, type ProjectDto, type ProjectStatus, type TaskDto, type TaskStatus } from "@/lib/api";

type StatusFilter = ProjectStatus | "all";
type View = "board" | "list";
const STATUS_LABEL: Record<TaskStatus, string> = { todo: "Todo", in_progress: "In Progress", done: "Done" };

function message(error: unknown) { return error instanceof TrackerApiError ? error.message : "The request could not be completed."; }

function ProjectForm({ project, onCancel, onSave }: { project?: ProjectDto; onCancel: () => void; onSave: (input: { name: string; description: string | null }) => Promise<void> }) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("A project name is required.");
    setSaving(true); setError("");
    try { await onSave({ name: name.trim(), description: description.trim() || null }); }
    catch (cause) { setError(message(cause)); setSaving(false); }
  }
  return <form onSubmit={submit} noValidate>
    {error && <div className="form-alert error" role="alert">{error}</div>}
    <div className="field"><label htmlFor="project-name">Name</label><input id="project-name" className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></div>
    <div className="field"><label htmlFor="project-description">Description</label><textarea id="project-description" className="input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={4} /></div>
    <div className="modal-foot"><button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : project ? "Save changes" : "Create project"}</button></div>
  </form>;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [projectPage, taskPage] = await Promise.all([listProjects("all"), listTasks()]);
      setProjects(projectPage.data); setTasks(taskPage.data);
    } catch (cause) { setError(message(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openProject = projects.find((project) => project.id === openId) ?? null;
  const projectTasks = tasks.filter((task) => task.project_id === openId && !task.archived_at);
  const visibleProjects = projects.filter((project) => statusFilter === "all" || project.status === statusFilter);
  function replace(next: ProjectDto) { setProjects((current) => current.map((project) => project.id === next.id ? next : project)); }
  async function changeStatus(project: ProjectDto, status: ProjectStatus) {
    setError("");
    try { replace(await setProjectStatus(project.id, { version: project.version, status })); setArchiveConfirm(false); }
    catch (cause) { setError(message(cause)); if (cause instanceof TrackerApiError && cause.code === "VERSION_CONFLICT") await load(); }
  }

  if (openProject) return <AppShell active="projects" title={openProject.name}>
    <button type="button" className="backlink" onClick={() => setOpenId(null)}><IconArrowLeft width={15} height={15} /> Projects</button>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="btn btn-sm" type="button" onClick={() => setError("")}>Dismiss</button></div>}
    <div className="proj-detail-head">
      <div><div className="pd-title">{openProject.name} <span className="chip">{openProject.status === "completed" ? "Completed" : openProject.status[0].toUpperCase() + openProject.status.slice(1)}</span></div>{openProject.description && <p className="detail-desc">{openProject.description}</p>}<div className="pd-sub">{openProject.done_count} of {openProject.task_count} tasks done</div>
        <div className="detail-actions" style={{ marginTop: 14 }}>
          {openProject.status === "active" ? <><button className="btn btn-sm" type="button" onClick={() => void changeStatus(openProject, "completed")}>Complete project</button><button className="btn btn-sm" type="button" onClick={() => setArchiveConfirm(true)}>Archive</button><button className="btn btn-sm" type="button" onClick={() => setEditing(true)}>Edit</button></> : <button className="btn btn-sm btn-primary" type="button" onClick={() => void changeStatus(openProject, "active")}>Reopen</button>}
        </div>
      </div>
      <div className="pd-figure"><div className="pd-pct">{openProject.progress_percent}%</div><div className="pd-caption">complete</div></div>
    </div>
    <div className="pd-bar"><div className="pbar"><i style={{ width: `${openProject.progress_percent}%` }} /></div></div>
    <div className="toolbar" style={{ marginTop: 16 }}><div className="seg" role="tablist" aria-label="Project task view"><button role="tab" aria-selected={view === "board"} type="button" onClick={() => setView("board")}>Board</button><button role="tab" aria-selected={view === "list"} type="button" onClick={() => setView("list")}>List</button></div><span className="spacer" />{openProject.status === "active" && <Link className="btn btn-primary btn-sm" to="/tasks"><IconPlus width={16} height={16} /> Add task</Link>}</div>
    {projectTasks.length === 0 ? <div className="empty-state"><span className="es-ic" aria-hidden><IconKanban width={22} height={22} /></span><h1>No tasks yet</h1><p>Add a task from Tasks and select this project.</p>{openProject.status === "active" && <Link className="btn btn-primary" to="/tasks">Open Tasks</Link>}</div>
      : view === "board" ? <div className="kanban">{(["todo", "in_progress", "done"] as TaskStatus[]).map((status) => <div className="kan-col" key={status}><div className="kan-col-head"><span>{STATUS_LABEL[status]}</span><span className="count-badge">{projectTasks.filter((task) => task.status === status).length}</span></div>{projectTasks.filter((task) => task.status === status).map((task) => <div className={`kan-card${status === "done" ? " is-done" : ""}`} key={task.id}><span className="kc-title">{task.title}</span><div className="kc-meta"><span className="chip">{task.priority[0].toUpperCase() + task.priority.slice(1)}</span>{task.due_date && <span className="chip">{task.due_date}</span>}</div></div>)}</div>)}</div>
      : <div className="task-list">{projectTasks.map((task) => <div className="task-row" key={task.id}><span className={`task-row-title${task.status === "done" ? " is-done" : ""}`}>{task.title}</span><div className="task-row-meta"><span className="chip">{STATUS_LABEL[task.status]}</span><span className="chip">{task.priority}</span></div></div>)}</div>}
    {editing && <Modal title={`Edit ${openProject.name}`} onClose={() => setEditing(false)}><ProjectForm project={openProject} onCancel={() => setEditing(false)} onSave={async (value) => { replace(await patchProject(openProject.id, { version: openProject.version, ...value })); setEditing(false); }} /></Modal>}
    {archiveConfirm && <Modal title={`Archive ${openProject.name}?`} onClose={() => setArchiveConfirm(false)}><p className="detail-desc">The project will leave the active list. Its tasks and history remain intact.</p><div className="modal-foot"><button className="btn btn-quiet" type="button" onClick={() => setArchiveConfirm(false)}>Cancel</button><button className="btn" type="button" onClick={() => void changeStatus(openProject, "archived")}>Archive project</button></div></Modal>}
  </AppShell>;

  return <AppShell active="projects" title="Projects">
    <div className="page-head"><h1>Projects</h1></div>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="btn btn-sm" type="button" onClick={() => void load()}>Retry</button></div>}
    <div className="toolbar"><select className="filter-select" aria-label="Filter projects by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="active">Status: Active</option><option value="completed">Status: Completed</option><option value="archived">Status: Archived</option><option value="all">Status: All</option></select><span className="spacer" /><button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><IconPlus width={16} height={16} /> New project</button></div>
    {loading ? <div className="empty-state"><p>Loading projects…</p></div> : visibleProjects.length === 0 ? <div className="empty-state"><span className="es-ic" aria-hidden><IconKanban width={22} height={22} /></span><h1>{projects.length ? "No projects match this filter" : "No projects yet"}</h1><p>{projects.length ? "Choose another status to see more projects." : "Group related tasks and track their progress."}</p>{!projects.length && <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>Create your first project</button>}</div>
      : <div className="proj-list">{visibleProjects.map((project) => <div className="proj-row" key={project.id}><div className="proj-main"><div className="proj-name">{project.name} <span className="chip">{project.status}</span></div><div className="proj-sub">{project.done_count} of {project.task_count} tasks done</div></div><div className="proj-bar-wrap"><div className="pbar"><i style={{ width: `${project.progress_percent}%` }} /></div><div className="proj-pct">{project.progress_percent}%</div></div><button className="btn btn-sm" type="button" onClick={() => setOpenId(project.id)}>Open</button></div>)}</div>}
    {adding && <Modal title="New project" onClose={() => setAdding(false)}><ProjectForm onCancel={() => setAdding(false)} onSave={async (value) => { const created = await createProject(value); setProjects((current) => [created, ...current]); setAdding(false); setStatusFilter("active"); }} /></Modal>}
  </AppShell>;
}
