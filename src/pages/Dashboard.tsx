import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconPlus, IconCheck } from "@/components/icons";
import { cancelTimebox, createTimebox, deleteHabitCheckIn, getPomodoroActive, listHabitCheckIns, listHabits, listHabitSchedules, listTasks, listTimebox, patchTimebox, setHabitCheckIn, setTaskStatus, startPomodoro, TrackerApiError, type HabitDto, type PomodoroBundleDto, type TaskDto } from "@/lib/api";

type Kind = "Class" | "Task" | "Habit" | "Focus";

type TimeboxBlock = {
  id: string;
  version: number;
  kind: Kind;
  title: string;
  start: string;
  end: string;
  linkedTo?: string;
  taskId?: string;
  habitId?: string;
};
type TimeboxDraft = Pick<TimeboxBlock, "kind" | "title" | "start" | "end" | "linkedTo">;
type DashboardHabit = {
  id: string;
  version: number;
  title: string;
  week: (boolean | null)[];
  doneToday: boolean;
  count: string;
};
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatRange(start: string, end: string) {
  return `${start}–${end}`;
}

function overlapsWith(a: TimeboxBlock, blocks: TimeboxBlock[]) {
  return blocks.some(
    (b) => b.id !== a.id && toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)
  );
}

function TimeboxForm({
  initial,
  onSave,
  onCancel,
  tasks,
  habits,
}: {
  initial?: TimeboxBlock;
  onSave: (block: TimeboxDraft) => void;
  onCancel: () => void;
  tasks: TaskDto[];
  habits: HabitDto[];
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? "Class");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [start, setStart] = useState(initial?.start ?? "");
  const [end, setEnd] = useState(initial?.end ?? "");
  const [linkedTo, setLinkedTo] = useState(initial?.linkedTo ?? "");
  const [error, setError] = useState<string | undefined>();

  const isFocus = kind === "Focus";

  useEffect(() => {
    if (!isFocus || !start) return;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + 25;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    setEnd(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
  }, [isFocus, start]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Title is required.");
    if (!start || !end) return setError("Start and end time are required.");
    if ((kind === "Task" || kind === "Habit") && !linkedTo) return setError(`Select a ${kind.toLowerCase()} to link.`);
    if (!isFocus && toMinutes(end) <= toMinutes(start)) {
      return setError("End time must be after start time.");
    }
    setError(undefined);
    onSave({ kind, title: title.trim(), start, end, linkedTo: linkedTo || undefined });
  }

  const linkOptions = kind === "Task" || kind === "Focus" ? tasks.map((item) => ({ id: item.id, label: item.title })) : kind === "Habit" ? habits.map((item) => ({ id: item.id, label: item.name })) : [];

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="tb-kind">Kind</label>
        <select id="tb-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="Class">Class</option>
          <option value="Task">Task</option>
          <option value="Habit">Habit</option>
          <option value="Focus">Focus</option>
        </select>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="tb-title">Title</label>
        <input
          id="tb-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Database Systems Lab"
          required
        />
      </div>

      {linkOptions.length > 0 && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="tb-link">
            Link to {kind === "Habit" ? "habit" : "task"} {isFocus && "(optional)"}
          </label>
          <select id="tb-link" className="input" value={linkedTo} onChange={(e) => setLinkedTo(e.target.value)}>
            <option value="">{isFocus ? "No task" : "Select one"}</option>
            {linkOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="tb-start">Start</label>
          <input
            id="tb-start"
            type="time"
            className="input"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="tb-end">End</label>
          <input
            id="tb-end"
            type="time"
            className="input"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={isFocus}
            required
          />
        </div>
      </div>
      {isFocus && (
        <p className="field-hint" style={{ marginTop: 8 }}>
          Focus is planned for 25 minutes.
        </p>
      )}

      <p className="field-hint" style={{ marginTop: 14 }}>
        Zone: Asia/Jakarta
      </p>

      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save timebox
        </button>
      </div>
    </form>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<TimeboxBlock[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [habitResources, setHabitResources] = useState<HabitDto[]>([]);
  const [habits, setHabits] = useState<DashboardHabit[]>([]);
  const [pomodoro, setPomodoro] = useState<PomodoroBundleDto>();
  const [pageError, setPageError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    setDateLabel(
      now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    );
    setNowMinutes(hour * 60 + now.getMinutes());
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    let active = true;
    Promise.all([listTimebox(today), listTasks("archived=false&page_size=100"), listHabits("false"), getPomodoroActive()]).then(async ([timebox, taskResult, habitResult, pomoResult]) => {
      const habitDetails = await Promise.all(habitResult.data.map((habit) => Promise.all([listHabitCheckIns(habit.id, weekStart, today), listHabitSchedules(habit.id)])));
      if (!active) return;
      const taskMap = new Map(taskResult.data.map((task) => [task.id, task.title]));
      const habitMap = new Map(habitResult.data.map((habit) => [habit.id, habit.name]));
      setBlocks(timebox.data.map((entry) => ({ id: entry.id, version: entry.version, kind: `${entry.kind[0].toUpperCase()}${entry.kind.slice(1)}` as Kind, title: entry.title, start: new Date(entry.starts_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }), end: new Date(entry.ends_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }), linkedTo: entry.task_id ? taskMap.get(entry.task_id) : entry.habit_id ? habitMap.get(entry.habit_id) : undefined, taskId: entry.task_id ?? undefined, habitId: entry.habit_id ?? undefined })));
      setTasks(taskResult.data.filter((task) => task.status !== "done").slice(0, 5));
      setHabitResources(habitResult.data);
      setHabits(habitResult.data.map((habit, index) => {
        const dates = Array.from({ length: 7 }, (_, day) => { const value = new Date(monday); value.setDate(monday.getDate() + day); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; });
        const checked = new Set(habitDetails[index][0].data.map((entry) => entry.date));
        const schedules = habitDetails[index][1].data;
        const week = dates.map((date, day) => {
          const schedule = [...schedules].reverse().find((item) => item.effective_from <= date) ?? habit.current_schedule;
          return schedule.weekdays.includes(day + 1) ? checked.has(date) : null;
        });
        return { id: habit.id, version: habit.version, title: habit.name, week, doneToday: checked.has(today), count: `${week.filter((value) => value === true).length}/${week.filter((value) => value !== null).length} this week` };
      }));
      setPomodoro(pomoResult.data);
    }).catch((error) => { if (active) setPageError(error instanceof TrackerApiError ? error.message : "Dashboard data could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    [blocks]
  );
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  async function addBlock(block: TimeboxDraft) {
    setSaving(true); setPageError(undefined);
    try {
      const today = new Date(); const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const startsAt = new Date(`${date}T${block.start}:00`).toISOString(); const endsAt = new Date(`${date}T${block.end}:00`).toISOString();
      const kind = block.kind.toLowerCase() as "class" | "task" | "habit" | "focus";
      const value = await createTimebox({ kind, title: block.title, starts_at: startsAt, ends_at: endsAt, task_id: kind === "task" || kind === "focus" ? block.linkedTo || null : null, habit_id: kind === "habit" ? block.linkedTo || null : null });
      const linked = tasks.find((item) => item.id === value.task_id)?.title ?? habitResources.find((item) => item.id === value.habit_id)?.name;
      setBlocks((prev) => [...prev, { ...block, id: value.id, version: value.version, linkedTo: linked, taskId: value.task_id ?? undefined, habitId: value.habit_id ?? undefined }]); setAdding(false);
    } catch (error) { setPageError(error instanceof TrackerApiError ? error.message : "The timebox could not be created."); }
    finally { setSaving(false); }
  }

  async function updateBlock(id: string, patch: TimeboxDraft) {
    const current = blocks.find((item) => item.id === id); if (!current) return;
    setSaving(true); setPageError(undefined);
    try {
      const today = new Date(); const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const kind = patch.kind.toLowerCase() as "class" | "task" | "habit" | "focus";
      const value = await patchTimebox(id, { version: current.version, kind, title: patch.title, starts_at: new Date(`${date}T${patch.start}:00`).toISOString(), ends_at: new Date(`${date}T${patch.end}:00`).toISOString(), task_id: kind === "task" || kind === "focus" ? patch.linkedTo || null : null, habit_id: kind === "habit" ? patch.linkedTo || null : null });
      const linked = tasks.find((item) => item.id === value.task_id)?.title ?? habitResources.find((item) => item.id === value.habit_id)?.name;
      setBlocks((prev) => prev.map((item) => item.id === id ? { ...patch, id, version: value.version, linkedTo: linked, taskId: value.task_id ?? undefined, habitId: value.habit_id ?? undefined } : item)); setEditing(false); setSelectedId(null);
    } catch (error) { setPageError(error instanceof TrackerApiError ? error.message : "The timebox could not be updated."); }
    finally { setSaving(false); }
  }

  async function cancelBlock(id: string) {
    const current = blocks.find((item) => item.id === id); if (!current) return;
    setSaving(true); setPageError(undefined);
    try { await cancelTimebox(id, current.version); setBlocks((prev) => prev.filter((item) => item.id !== id)); setSelectedId(null); }
    catch (error) { setPageError(error instanceof TrackerApiError ? error.message : "The timebox could not be cancelled."); }
    finally { setSaving(false); }
  }

  async function toggleTask(id: string) {
    const current = tasks.find((item) => item.id === id); if (!current) return;
    try { const value = await setTaskStatus(id, { version: current.version, status: current.status === "done" ? "todo" : "done" }); setTasks((prev) => prev.map((item) => item.id === id ? value : item)); }
    catch (error) { setPageError(error instanceof TrackerApiError ? error.message : "The task could not be updated."); }
  }

  async function checkInHabit(id: string) {
    const current = habits.find((item) => item.id === id); if (!current) return;
    const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    try { if (current.doneToday) await deleteHabitCheckIn(id, today); else await setHabitCheckIn(id, today); setHabits((prev) => prev.map((item) => item.id === id ? { ...item, doneToday: !item.doneToday } : item)); }
    catch (error) { setPageError(error instanceof TrackerApiError ? error.message : "The habit check-in could not be updated."); }
  }

  async function startDashboardPomodoro() {
    if (!pomodoro || pomodoro.session) return;
    setSaving(true); setPageError(undefined);
    try { const result = await startPomodoro(pomodoro.state.version); setPomodoro(result.data); }
    catch (error) { setPageError(error instanceof TrackerApiError ? error.message : "Pomodoro could not be started."); }
    finally { setSaving(false); }
  }

  return (
    <AppShell active="dashboard" title="Dashboard">
      <div className="page-head">
        <span className="label">{dateLabel || "Today"}</span>
        <h1>{greeting || "Hello"}</h1>
        <p className="field-hint" style={{ marginTop: 8 }}>Timebox plans do not start or complete activities automatically.</p>
      </div>

      {pageError && <div className="form-alert error" role="alert" style={{ marginBottom: 16 }}>{pageError}</div>}

      <div className="dash-grid">
        <section className="widget widget-timebox" aria-labelledby="tb-head">
          <div className="widget-head">
            <h2 id="tb-head">Today&apos;s Timebox</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <IconPlus width={16} height={16} /> Add timebox
            </button>
          </div>

          {loading ? (
            <div aria-hidden="true">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          ) : sortedBlocks.length === 0 ? (
            <div className="empty-mini">
              <p>No timebox planned for today yet.</p>
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <IconPlus width={16} height={16} /> Add timebox
              </button>
            </div>
          ) : (
            <ul className="tb-list">
              {sortedBlocks.map((b) => {
                const isNow =
                  nowMinutes !== null && toMinutes(b.start) <= nowMinutes && nowMinutes < toMinutes(b.end);
                return (
                  <li key={b.id} className={isNow ? "is-now" : undefined}>
                    <button type="button" className="tb-row" onClick={() => setSelectedId(b.id)}>
                      <span className="tb-time tnum">{formatRange(b.start, b.end)}</span>
                      <span className="tb-title-wrap">
                        <span className="tb-kind">{b.kind}</span>
                        <span className="tb-title">{b.title}</span>
                        {overlapsWith(b, sortedBlocks) && <span className="tb-flag">Schedule overlap</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="dash-side">
          <section className="widget" aria-labelledby="tasks-head">
            <div className="widget-head">
              <h2 id="tasks-head">
                Tasks <span className="count-badge">{tasks.length}</span>
              </h2>
              <Link to="/tasks" className="widget-link">
                View all
              </Link>
            </div>
            {tasks.length === 0 ? (
              <div className="empty-mini">No tasks yet today.</div>
            ) : (
              tasks.map((t) => {
                const today = new Date().toISOString().slice(0, 10);
                const overdue = !!t.due_date && t.due_date < today && t.status !== "done";
                const done = t.status === "done";
                return <div key={t.id} className={`list-row${overdue ? " is-overdue" : ""}`}>
                  <button
                    type="button"
                    className={`chk-btn${done ? " is-done" : ""}`}
                    aria-pressed={done}
                    aria-label={done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
                    onClick={() => void toggleTask(t.id)}
                  >
                    {done && <IconCheck width={13} height={13} strokeWidth={3} />}
                  </button>
                  <span className="list-row-title" style={done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>
                    {t.title}
                  </span>
                  <span className="list-row-meta">{overdue ? "Overdue" : t.due_date ?? "No due date"}</span>
                </div>
              })
            )}
          </section>

          <section className="widget" aria-labelledby="habits-head">
            <div className="widget-head">
              <h2 id="habits-head">
                Habits <span className="count-badge">{habits.length}</span>
              </h2>
              <Link to="/habits" className="widget-link">
                View all
              </Link>
            </div>
            {habits.map((h) => (
              <div key={h.id} className="list-row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: "1 1 100%", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="list-row-title">{h.title}</span>
                  <span className="list-row-meta">{h.count}</span>
                </div>
                <div className="habit-week">
                  {WEEKDAYS.map((d, i) => {
                    const val = h.week[i];
                    const cls = val === null ? "habit-dot is-off-schedule" : val ? "habit-dot is-on" : "habit-dot";
                    return (
                      <span key={i} className={cls} aria-hidden="true">
                        {d}
                      </span>
                    );
                  })}
                </div>
                <button type="button" className="btn btn-sm" onClick={() => void checkInHabit(h.id)}>
                  {h.doneToday ? "Undo check-in" : "Check in today"}
                </button>
              </div>
            ))}
          </section>

          <section className="widget" aria-labelledby="pomo-head">
            <div className="widget-head">
              <h2 id="pomo-head">Pomodoro</h2>
              <Link to="/pomodoro" className="widget-link">
                Open
              </Link>
            </div>
            <div className="pomo-mini">
              <div className="pm-status">
                <span className="pm-phase">{pomodoro?.session ? `Active: ${pomodoro.session.phase.replace("_", " ")}` : `Next phase: ${pomodoro?.state.next_phase.replace("_", " ") ?? "Focus"}`}</span>
                <span className="pm-state">{pomodoro?.session?.status ?? "Not started"}</span>
              </div>
              {pomodoro?.session ? <Link to="/pomodoro" className="btn btn-primary btn-sm">Open timer</Link> : <button type="button" className="btn btn-primary btn-sm" disabled={!pomodoro || saving} onClick={() => void startDashboardPomodoro()}>Start {pomodoro?.state.next_phase.replace("_", " ") ?? "focus"}</button>}
            </div>
          </section>
        </div>
      </div>

      {adding && (
        <Modal title="Add timebox" onClose={() => setAdding(false)}>
          <TimeboxForm
            onCancel={() => setAdding(false)}
            onSave={(block) => void addBlock(block)}
            tasks={tasks}
            habits={habitResources}
          />
        </Modal>
      )}

      {selected && !editing && (
        <Modal title={selected.title} onClose={() => setSelectedId(null)}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <span className="tb-kind">{selected.kind}</span>
            {overlapsWith(selected, blocks) && <span className="tb-flag">Schedule overlap</span>}
          </div>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem" }} className="tnum">
            {formatRange(selected.start, selected.end)} &middot; Asia/Jakarta
          </p>
          {selected.linkedTo && (
            <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginTop: 8 }}>
              Linked to: {selected.linkedTo}
            </p>
          )}
          <div className="modal-foot">
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="btn" disabled={saving} onClick={() => void cancelBlock(selected.id)}>
              Cancel timebox
            </button>
          </div>
        </Modal>
      )}

      {selected && editing && (
        <Modal title="Edit timebox" onClose={() => setEditing(false)}>
          <TimeboxForm
            initial={{ ...selected, linkedTo: selected.taskId ?? selected.habitId }}
            onCancel={() => setEditing(false)}
            onSave={(block) => void updateBlock(selected.id, block)}
            tasks={tasks}
            habits={habitResources}
          />
        </Modal>
      )}
    </AppShell>
  );
}
