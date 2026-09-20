import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconPlus, IconCheck } from "@/components/icons";

type Kind = "Class" | "Task" | "Habit" | "Focus";

type TimeboxBlock = {
  id: string;
  kind: Kind;
  title: string;
  start: string;
  end: string;
  linkedTo?: string;
};

// Sample data: illustrates the layout only, not real records.
const SAMPLE_BLOCKS: TimeboxBlock[] = [
  { id: "tb-1", kind: "Class", title: "Statistics Lecture", start: "07:00", end: "09:00" },
  {
    id: "tb-2",
    kind: "Focus",
    title: "Competitor research",
    start: "09:30",
    end: "09:55",
    linkedTo: "Competitor research",
  },
  { id: "tb-3", kind: "Class", title: "Database Systems Lab", start: "13:00", end: "14:30" },
  {
    id: "tb-4",
    kind: "Task",
    title: "File tax report",
    start: "15:00",
    end: "15:30",
    linkedTo: "File tax report",
  },
  {
    id: "tb-5",
    kind: "Habit",
    title: "Read 10 pages",
    start: "19:00",
    end: "19:30",
    linkedTo: "Read 10 pages",
  },
];

const SAMPLE_TASKS = [
  { id: "t-1", title: "File tax report", due: "Today", done: false, overdue: false },
  { id: "t-2", title: "Pay internet bill", due: "Overdue", done: false, overdue: true },
];

const SAMPLE_HABITS: {
  id: string;
  title: string;
  week: (boolean | null)[];
  doneToday: boolean;
  count: string;
}[] = [
  {
    id: "h-1",
    title: "Read 10 pages",
    week: [true, true, null, true, null, false, null],
    doneToday: true,
    count: "3/5 this week",
  },
  {
    id: "h-2",
    title: "Morning run",
    week: [null, true, null, false, null, true, null],
    doneToday: false,
    count: "2/3 this week",
  },
];

const LINKABLE_TASKS = ["File tax report", "Prepare investor slides", "Competitor research"];
const LINKABLE_HABITS = ["Read 10 pages", "Morning run"];
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
}: {
  initial?: TimeboxBlock;
  onSave: (block: Omit<TimeboxBlock, "id">) => void;
  onCancel: () => void;
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
    if (!isFocus && toMinutes(end) <= toMinutes(start)) {
      return setError("End time must be after start time.");
    }
    setError(undefined);
    onSave({ kind, title: title.trim(), start, end, linkedTo: linkedTo || undefined });
  }

  const linkOptions = kind === "Task" || kind === "Focus" ? LINKABLE_TASKS : kind === "Habit" ? LINKABLE_HABITS : [];

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
              <option key={o} value={o}>
                {o}
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
  const [tasks, setTasks] = useState(SAMPLE_TASKS);
  const [habits, setHabits] = useState(SAMPLE_HABITS);
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
    const t = window.setTimeout(() => {
      setBlocks(SAMPLE_BLOCKS);
      setLoading(false);
    }, 650);
    return () => window.clearTimeout(t);
  }, []);

  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    [blocks]
  );
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function addBlock(block: Omit<TimeboxBlock, "id">) {
    setBlocks((prev) => [...prev, { ...block, id: `tb-${Date.now()}` }]);
  }

  function updateBlock(id: string, patch: Omit<TimeboxBlock, "id">) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...patch, id } : b)));
  }

  function cancelBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedId(null);
  }

  function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function checkInHabit(id: string) {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, doneToday: !h.doneToday } : h)));
  }

  return (
    <AppShell active="dashboard" title="Dashboard">
      <div className="page-head">
        <span className="label">{dateLabel || "Today"}</span>
        <h1>{greeting || "Hello"}</h1>
        <p className="field-hint" style={{ marginTop: 8 }}>
          Preview build: the Timebox, Tasks, Habits, and Pomodoro below show sample data, not a
          real account, and are not yet connected to a server.
        </p>
      </div>

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
              tasks.map((t) => (
                <div key={t.id} className={`list-row${t.overdue && !t.done ? " is-overdue" : ""}`}>
                  <button
                    type="button"
                    className={`chk-btn${t.done ? " is-done" : ""}`}
                    aria-pressed={t.done}
                    aria-label={t.done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
                    onClick={() => toggleTask(t.id)}
                  >
                    {t.done && <IconCheck width={13} height={13} strokeWidth={3} />}
                  </button>
                  <span className="list-row-title" style={t.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>
                    {t.title}
                  </span>
                  <span className="list-row-meta">{t.overdue && !t.done ? "Overdue" : t.due}</span>
                </div>
              ))
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
                <button type="button" className="btn btn-sm" onClick={() => checkInHabit(h.id)}>
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
                <span className="pm-phase">Next phase: Focus</span>
                <span className="pm-state">Not started</span>
              </div>
              <Link to="/pomodoro" className="btn btn-primary btn-sm">
                Start Focus
              </Link>
            </div>
          </section>
        </div>
      </div>

      {adding && (
        <Modal title="Add timebox" onClose={() => setAdding(false)}>
          <TimeboxForm
            onCancel={() => setAdding(false)}
            onSave={(block) => {
              addBlock(block);
              setAdding(false);
            }}
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
            <button type="button" className="btn" onClick={() => cancelBlock(selected.id)}>
              Cancel timebox
            </button>
          </div>
        </Modal>
      )}

      {selected && editing && (
        <Modal title="Edit timebox" onClose={() => setEditing(false)}>
          <TimeboxForm
            initial={selected}
            onCancel={() => setEditing(false)}
            onSave={(block) => {
              updateBlock(selected.id, block);
              setEditing(false);
              setSelectedId(null);
            }}
          />
        </Modal>
      )}
    </AppShell>
  );
}
