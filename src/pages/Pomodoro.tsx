import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { cancelPomodoro, getPomodoroActive, listPomodoroSessions, listTasks, pausePomodoro, resumePomodoro, startPomodoro, TrackerApiError, type PomodoroBundleDto, type PomodoroPhase, type PomodoroSessionDto, type TaskDto } from "@/lib/api";

const DURATION: Record<PomodoroPhase, number> = { focus: 1500, short_break: 300, long_break: 900 };
const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };
const PHASE_MIN: Record<PomodoroPhase, string> = { focus: "25 min", short_break: "5 min", long_break: "15 min" };
const RING_CIRC = 2 * Math.PI * 108;

function fmt(total: number) {
  const value = Math.max(0, Math.ceil(total));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function clock(value: string | null) {
  return value ? new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "Now";
}

export default function PomodoroPage() {
  const [bundle, setBundle] = useState<PomodoroBundleDto>();
  const [history, setHistory] = useState<PomodoroSessionDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [taskId, setTaskId] = useState("");
  const [remaining, setRemaining] = useState(1500);
  const [serverOffset, setServerOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string>();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const refreshingDeadline = useRef(false);

  const refresh = useCallback(async () => {
    const active = await getPomodoroActive();
    const day = active.data.today.cycle_date;
    const [sessions, openTasks] = await Promise.all([listPomodoroSessions(day, day), listTasks("archived=false&page_size=100")]);
    setBundle(active.data);
    setHistory(sessions.data);
    setTasks(openTasks.data.filter((task) => task.status !== "done"));
    setServerOffset(new Date(active.meta.server_now).getTime() - Date.now());
    setRemaining(active.data.session?.remaining_seconds ?? DURATION[active.data.state.next_phase]);
  }, []);

  useEffect(() => {
    let mounted = true;
    refresh().catch((error) => { if (mounted) setPageError(error instanceof TrackerApiError ? error.message : "Pomodoro could not be loaded."); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [refresh]);

  const session = bundle?.session ?? null;
  const phase = session?.phase ?? bundle?.state.next_phase ?? "focus";
  const status = session?.status ?? "idle";
  const total = session?.planned_seconds ?? DURATION[phase];
  const completedFocus = bundle?.today.completed_focus_count ?? 0;

  useEffect(() => {
    if (!session || session.status !== "running" || !session.due_at) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((new Date(session.due_at!).getTime() - (Date.now() + serverOffset)) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session, serverOffset]);

  useEffect(() => {
    if (status !== "running" || remaining > 0 || refreshingDeadline.current) return;
    refreshingDeadline.current = true;
    refresh().catch((error) => setPageError(error instanceof TrackerApiError ? error.message : "The completed phase could not be refreshed.")).finally(() => { refreshingDeadline.current = false; });
  }, [remaining, refresh, status]);

  async function mutate(action: () => Promise<{ data: PomodoroBundleDto; meta: { server_now: string } }>) {
    if (saving) return;
    setSaving(true);
    setPageError(undefined);
    try {
      const result = await action();
      setBundle(result.data);
      setServerOffset(new Date(result.meta.server_now).getTime() - Date.now());
      setRemaining(result.data.session?.remaining_seconds ?? DURATION[result.data.state.next_phase]);
      await refresh();
    } catch (error) {
      setPageError(error instanceof TrackerApiError ? error.message : "The Pomodoro action could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  const ringOffset = RING_CIRC * (1 - remaining / total);
  const pipsFilled = completedFocus === 0 ? 0 : completedFocus % 4 === 0 ? 4 : completedFocus % 4;
  const isBreak = phase !== "focus";
  const selectedTask = tasks.find((task) => task.id === (session?.task_id ?? taskId));
  const historyRows = useMemo(() => history.filter((item) => item.status === "completed" || item.status === "cancelled"), [history]);

  return (
    <AppShell active="pomodoro" title="Pomodoro">
      <div className="page-head"><h1>Pomodoro</h1><span className="sample-tag">Server timer</span></div>
      {pageError && <div className="form-alert error" role="alert" style={{ marginBottom: 16 }}>{pageError}</div>}
      {loading ? <div className="empty-state"><p>Loading Pomodoro…</p></div> : !bundle ? <div className="empty-state"><p>Pomodoro is unavailable.</p></div> : (
        <div className="pomo-layout">
          <section className="pomo-card" aria-labelledby="pomo-timer-heading">
            <h2 id="pomo-timer-heading" className="sr-only">Timer</h2>
            <div className="timer-wrap">
              <span className="chip">{status === "idle" ? `Next phase: ${PHASE_LABEL[phase]}` : status === "paused" ? `Paused · ${PHASE_LABEL[phase]}` : `Phase: ${PHASE_LABEL[phase]}`}</span>
              <div className={`timer-ring${status === "paused" ? " is-paused" : ""}`}>
                <svg width="240" height="240" viewBox="0 0 240 240" aria-hidden="true"><circle className="ring-track" cx="120" cy="120" r="108" fill="none" strokeWidth="12" /><circle className="ring-prog" cx="120" cy="120" r="108" fill="none" strokeWidth="12" strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset} /></svg>
                <div className="timer-center"><span className="timer-num tnum" aria-live="polite">{fmt(remaining)}</span><span className="timer-sub">{PHASE_LABEL[phase]} · {PHASE_MIN[phase]}</span></div>
              </div>
              {status === "idle" ? (
                <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12 }}>
                  {!isBreak && <div className="field"><label htmlFor="pomo-task">Focus on a task (optional)</label><select id="pomo-task" className="input" value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">No task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></div>}
                  <button className="btn btn-primary btn-lg" type="button" disabled={saving} onClick={() => void mutate(() => startPomodoro(bundle.state.version, isBreak ? null : taskId || null))}>Start {PHASE_LABEL[phase].toLowerCase()}</button>
                  <p className="field-hint">{isBreak ? "A break never carries a task. Start it manually when you are ready." : "The server keeps the deadline authoritative, including after reload or disconnect."}</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", width: "100%" }}>
                  <div className="timer-controls">{status === "running" ? <button className="btn" type="button" disabled={saving} onClick={() => void mutate(() => pausePomodoro(session!.id, session!.version))}>Pause</button> : <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void mutate(() => resumePomodoro(session!.id, session!.version))}>Resume</button>}<button className="btn" type="button" disabled={saving} onClick={() => setConfirmingCancel(true)}>Cancel</button></div>
                  <p className="timer-sub">Task: {phase === "focus" ? selectedTask?.title ?? session?.task_title_snapshot ?? "None" : "None"}</p>
                </div>
              )}
              <div className="pip-row"><div className="pomo-pips" role="img" aria-label={`${pipsFilled} of 4 focus sessions completed toward a long break`}>{[0, 1, 2, 3].map((index) => <span key={index} className={`pomo-pip${index < pipsFilled ? " is-filled" : ""}`} />)}</div><span className="pomo-pip-label">{completedFocus} focus sessions completed today</span></div>
            </div>
          </section>
          <aside className="pomo-card pomo-side" aria-labelledby="pomo-hist-heading">
            <h2 id="pomo-hist-heading">Today&apos;s sessions</h2>
            {historyRows.length === 0 ? <p className="field-hint">No completed or cancelled sessions today.</p> : historyRows.map((item) => <div className="pomo-hist-row" key={item.id}><span className="pomo-hist-title">{PHASE_LABEL[item.phase]}{item.phase === "focus" ? ` · ${item.task_title_snapshot ?? "No task"}` : ""}</span><span className={`pomo-hist-outcome${item.status === "cancelled" ? " is-cancelled" : ""}`}>{item.status === "cancelled" ? "Cancelled" : "Completed"}</span><span className="pomo-hist-time tnum">{clock(item.started_at)}–{clock(item.ended_at)}{item.status === "cancelled" ? ` · ${fmt(item.active_duration_ms / 1000)}` : ""}</span></div>)}
            <p className="field-hint" style={{ marginTop: 14 }}>Cancelled sessions keep elapsed focus time but do not increment the completed count.</p>
          </aside>
        </div>
      )}
      {confirmingCancel && session && <Modal title="Cancel this session?" onClose={() => setConfirmingCancel(false)}><p className="modal-body">Elapsed time remains in history, but a cancelled focus does not count as completed. The next phase returns to Focus.</p><div className="modal-foot"><button type="button" className="btn btn-quiet" onClick={() => setConfirmingCancel(false)}>Keep going</button><button type="button" className="btn btn-primary" disabled={saving} onClick={() => { setConfirmingCancel(false); void mutate(() => cancelPomodoro(session.id, session.version)); }}>Cancel session</button></div></Modal>}
    </AppShell>
  );
}
