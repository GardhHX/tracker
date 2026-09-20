import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";

type Phase = "focus" | "short_break" | "long_break";
type Status = "idle" | "running" | "paused";
type Outcome = "Completed" | "Cancelled";

type HistoryEntry = {
  id: string;
  phase: Phase;
  task?: string;
  outcome: Outcome;
  start: string; // HH:MM
  end: string; // HH:MM
  elapsedLabel?: string; // for cancelled
};

// Fixed MVP durations (seconds), per REQ-05 / D-25. Not user-configurable.
const DURATION: Record<Phase, number> = { focus: 1500, short_break: 300, long_break: 900 };
const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };
const PHASE_MIN: Record<Phase, string> = { focus: "25 min", short_break: "5 min", long_break: "15 min" };

const RING_CIRC = 2 * Math.PI * 108;

const LINKABLE_TASKS = ["Competitor research", "Prepare investor slides", "Design finance module wireframe"];

function fmt(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function clockNow() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const SEED_HISTORY: HistoryEntry[] = [
  { id: "s1", phase: "focus", task: "Competitor research", outcome: "Completed", start: "09:05", end: "09:30" },
  { id: "s2", phase: "short_break", outcome: "Cancelled", start: "09:30", end: "09:31", elapsedLabel: "Elapsed 01:12" },
  { id: "s3", phase: "focus", outcome: "Completed", start: "09:40", end: "10:05" },
];

export default function PomodoroPage() {
  const [phase, setPhase] = useState<Phase>("focus");
  const [status, setStatus] = useState<Status>("idle");
  const [remaining, setRemaining] = useState(DURATION.focus);
  const [total, setTotal] = useState(DURATION.focus);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [task, setTask] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>(SEED_HISTORY);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const startedAtRef = useRef<string>("");

  // Tick once per second while running. Cleared on pause/idle/unmount.
  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  // The phase ends only when the timer reaches zero. In the real app the server
  // closes the phase at its deadline; here it completes client-side.
  useEffect(() => {
    if (status === "running" && remaining === 0) completePhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, status]);

  function goIdle(nextPhase: Phase) {
    setPhase(nextPhase);
    setStatus("idle");
    setRemaining(DURATION[nextPhase]);
    setTotal(DURATION[nextPhase]);
    if (nextPhase !== "focus") setTask("");
  }

  function addHistory(entry: Omit<HistoryEntry, "id" | "end">) {
    setHistory((prev) => [{ ...entry, id: `s-${Date.now()}`, end: clockNow() }, ...prev]);
  }

  function completePhase() {
    if (phase === "focus") {
      const newCount = completedFocus + 1;
      setCompletedFocus(newCount);
      addHistory({ phase, task: task || undefined, outcome: "Completed", start: startedAtRef.current });
      // Every 4th completed focus schedules a long break, otherwise a short break.
      goIdle(newCount % 4 === 0 ? "long_break" : "short_break");
    } else {
      addHistory({ phase, outcome: "Completed", start: startedAtRef.current });
      goIdle("focus");
    }
  }

  function start() {
    startedAtRef.current = clockNow();
    setStatus("running");
  }
  function pause() {
    setStatus("paused");
  }
  function resume() {
    setStatus("running");
  }
  function confirmCancel() {
    const elapsed = total - remaining;
    addHistory({
      phase,
      task: phase === "focus" ? task || undefined : undefined,
      outcome: "Cancelled",
      start: startedAtRef.current || clockNow(),
      elapsedLabel: `Elapsed ${fmt(elapsed)}`,
    });
    setConfirmingCancel(false);
    // Cancel never increments the count; always return to a fresh focus.
    goIdle("focus");
  }

  const ringOffset = RING_CIRC * (1 - remaining / total);
  const pipsFilled = completedFocus === 0 ? 0 : completedFocus % 4 === 0 ? 4 : completedFocus % 4;
  const isBreak = phase !== "focus";

  return (
    <AppShell active="pomodoro" title="Pomodoro">
      <div className="page-head">
        <h1>Pomodoro</h1>
        <span className="sample-tag">Sample data</span>
      </div>

      <div className="pomo-layout">
        <section className="pomo-card" aria-labelledby="pomo-timer-heading">
          <h2 id="pomo-timer-heading" className="sr-only">
            Timer
          </h2>
          <div className="timer-wrap">
            <span className="chip">
              {status === "idle"
                ? `Next phase: ${PHASE_LABEL[phase]}`
                : status === "paused"
                ? `Paused · ${PHASE_LABEL[phase]}`
                : `Phase: ${PHASE_LABEL[phase]}`}
            </span>

            <div className={`timer-ring${status === "paused" ? " is-paused" : ""}`}>
              <svg width="240" height="240" viewBox="0 0 240 240" aria-hidden="true">
                <circle className="ring-track" cx="120" cy="120" r="108" fill="none" strokeWidth="12" />
                <circle
                  className="ring-prog"
                  cx="120"
                  cy="120"
                  r="108"
                  fill="none"
                  strokeWidth="12"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div className="timer-center">
                <span className="timer-num tnum" aria-live="polite">
                  {fmt(remaining)}
                </span>
                <span className="timer-sub">
                  {PHASE_LABEL[phase]} · {PHASE_MIN[phase]}
                </span>
              </div>
            </div>

            {status === "idle" ? (
              <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12 }}>
                {!isBreak && (
                  <div className="field">
                    <label htmlFor="pomo-task">Focus on a task (optional)</label>
                    <select id="pomo-task" className="input" value={task} onChange={(e) => setTask(e.target.value)}>
                      <option value="">No task</option>
                      {LINKABLE_TASKS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button className="btn btn-primary btn-lg" type="button" onClick={start}>
                  Start {PHASE_LABEL[phase].toLowerCase()}
                </button>
                <p className="field-hint">
                  {isBreak
                    ? "A break never carries a task. The next phase is decided by the daily cycle."
                    : "The next phase is decided by the daily cycle. A break can never carry a task."}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", width: "100%" }}>
                <div className="timer-controls">
                  {status === "running" ? (
                    <button className="btn" type="button" onClick={pause}>
                      Pause
                    </button>
                  ) : (
                    <button className="btn btn-primary" type="button" onClick={resume}>
                      Resume
                    </button>
                  )}
                  <button className="btn" type="button" onClick={() => setConfirmingCancel(true)}>
                    Cancel
                  </button>
                </div>
                <p className="timer-sub">Task: {phase === "focus" && task ? task : "None"}</p>
              </div>
            )}

            <div className="pip-row">
              <div
                className="pomo-pips"
                role="img"
                aria-label={`${pipsFilled} of 4 focus sessions completed toward a long break`}
              >
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`pomo-pip${i < pipsFilled ? " is-filled" : ""}`} />
                ))}
              </div>
              <span className="pomo-pip-label">{pipsFilled} of 4 focus sessions today</span>
            </div>
          </div>
        </section>

        <aside className="pomo-card pomo-side" aria-labelledby="pomo-hist-heading">
          <h2 id="pomo-hist-heading">Today&apos;s sessions</h2>
          {history.length === 0 ? (
            <p className="field-hint">No sessions yet today. Start a focus session to see it here.</p>
          ) : (
            history.map((h) => (
              <div className="pomo-hist-row" key={h.id}>
                <span className="pomo-hist-title">
                  {PHASE_LABEL[h.phase]}
                  {h.phase === "focus" ? ` · ${h.task ?? "No task"}` : ""}
                </span>
                <span className={`pomo-hist-outcome${h.outcome === "Cancelled" ? " is-cancelled" : ""}`}>{h.outcome}</span>
                <span className="pomo-hist-time tnum">
                  {h.elapsedLabel ? h.elapsedLabel : `${h.start}–${h.end}`}
                </span>
              </div>
            ))
          )}
          <p className="field-hint" style={{ marginTop: 14 }}>
            Cancelled sessions stay on record with their elapsed time, but do not count as a completed Pomodoro.
          </p>
        </aside>
      </div>

      {confirmingCancel && (
        <Modal title="Cancel this session?" onClose={() => setConfirmingCancel(false)}>
          <p className="modal-body">
            The time you have already focused stays on record, but this session will not count as a completed Pomodoro.
            You will return to a fresh Focus.
          </p>
          <div className="modal-foot">
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmingCancel(false)}>
              Keep going
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmCancel}>
              Cancel session
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
