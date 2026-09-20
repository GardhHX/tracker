import { useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconPlus, IconRepeat } from "@/components/icons";

// weekdays: 7 booleans, index 0 = Monday … 6 = Sunday (matches ISO week start).
type Weekdays = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

type Habit = {
  id: string;
  name: string;
  startDate: string; // ISO date, immutable after creation
  timezone: string; // fixed snapshot, "Asia/Jakarta"
  weekdays: Weekdays;
  checkIns: string[]; // ISO dates
  archivedOn?: string; // ISO date; when set, habit is archived
};

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const TZ = "Asia/Jakarta";

// Fixed "today" so the sample week and calendar stay reproducible regardless of
// the real device clock. Sample data only, per the "Sample data" tag.
const DEMO_TODAY = "2026-09-19"; // a Saturday

function parse(iso: string) {
  return new Date(iso + "T00:00:00");
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number) {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
// 0 = Monday … 6 = Sunday
function weekdayIndex(iso: string) {
  return (parse(iso).getDay() + 6) % 7;
}
function startOfWeek(iso: string) {
  return addDays(iso, -weekdayIndex(iso));
}
function fmtDateLong(iso: string) {
  return parse(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function isScheduled(habit: Habit, iso: string) {
  return habit.weekdays[weekdayIndex(iso)];
}
function withinLife(habit: Habit, iso: string) {
  if (iso < habit.startDate) return false;
  if (habit.archivedOn && iso > habit.archivedOn) return false;
  return true;
}

const SEED_HABITS: Habit[] = [
  {
    id: "h1",
    name: "Read 10 pages",
    startDate: "2026-08-03",
    timezone: TZ,
    weekdays: [true, true, false, true, false, true, false], // Mon, Tue, Thu, Sat
    checkIns: [
      "2026-09-01", "2026-09-03", "2026-09-07", "2026-09-08",
      "2026-09-12", "2026-09-14", "2026-09-15", "2026-09-17",
    ],
  },
  {
    id: "h2",
    name: "Morning run",
    startDate: "2026-09-01",
    timezone: TZ,
    weekdays: [false, true, false, true, false, true, false], // Tue, Thu, Sat
    checkIns: ["2026-09-01", "2026-09-05", "2026-09-15", "2026-09-19"],
  },
  {
    id: "h3",
    name: "Meditate 5 min",
    startDate: "2026-08-15",
    timezone: TZ,
    weekdays: [true, false, true, false, true, false, false], // Mon, Wed, Fri
    checkIns: ["2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09"],
    archivedOn: "2026-09-12",
  },
];

function WeekdayPicker({ value, onChange, idBase }: { value: Weekdays; onChange: (v: Weekdays) => void; idBase: string }) {
  return (
    <div className="dow-picker" role="group" aria-label="Scheduled days">
      {WEEKDAY_LABELS.map((label, i) => (
        <button
          key={`${idBase}-${i}`}
          type="button"
          className="dow-btn"
          aria-pressed={value[i]}
          aria-label={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}
          onClick={() => {
            const next = [...value] as Weekdays;
            next[i] = !next[i];
            onChange(next);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NewHabitForm({ onCancel, onSave }: { onCancel: () => void; onSave: (h: Omit<Habit, "id" | "checkIns" | "timezone" | "archivedOn">) => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(DEMO_TODAY);
  const [weekdays, setWeekdays] = useState<Weekdays>([true, false, false, true, false, true, false]);
  const [error, setError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    if (!weekdays.some(Boolean)) return setError("Pick at least one scheduled day.");
    onSave({ name: name.trim(), startDate, weekdays });
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="nh-name">
          Name <span className="req">*</span>
        </label>
        <input id="nh-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Read 10 pages" maxLength={120} aria-invalid={!!error && !name.trim()} />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="nh-start">Start date</label>
        <input id="nh-start" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <span className="field-hint">Fixed after creation. Check-ins before this date are not allowed.</span>
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>
          Scheduled days <span className="req">*</span>
        </label>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} idBase="nh" />
      </div>
      <div className="info-note">Timezone is copied from your profile ({TZ}) and stays fixed for this habit&apos;s whole history.</div>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create habit
        </button>
      </div>
    </form>
  );
}

function EditScheduleForm({ habit, onCancel, onSave, onArchive }: { habit: Habit; onCancel: () => void; onSave: (name: string, weekdays: Weekdays) => void; onArchive: () => void }) {
  const [name, setName] = useState(habit.name);
  const [weekdays, setWeekdays] = useState<Weekdays>(habit.weekdays);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !weekdays.some(Boolean)) return;
    onSave(name.trim(), weekdays);
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="es-name">Name</label>
        <input id="es-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="es-start">Start date (fixed since creation)</label>
        <input id="es-start" className="input" value={fmtDateLong(habit.startDate)} disabled />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Scheduled days</label>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} idBase="es" />
      </div>
      <div className="info-note">
        Takes effect tomorrow in this habit&apos;s zone ({TZ}). Today still follows the current schedule, and the old
        schedule stays visible in history.
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save schedule
        </button>
      </div>
      <button type="button" className="btn btn-sm btn-quiet" style={{ width: "100%", marginTop: 10 }} onClick={onArchive}>
        Archive this habit
      </button>
    </form>
  );
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>(SEED_HABITS);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const weekStart = startOfWeek(DEMO_TODAY);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const activeHabits = habits.filter((h) => !h.archivedOn);
  const archivedHabits = habits.filter((h) => h.archivedOn);
  const editingHabit = habits.find((h) => h.id === editingId) ?? null;

  function hasCheckIn(habit: Habit, iso: string) {
    return habit.checkIns.includes(iso);
  }

  function toggleCheckIn(habitId: string, iso: string) {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const has = h.checkIns.includes(iso);
        return { ...h, checkIns: has ? h.checkIns.filter((d) => d !== iso) : [...h.checkIns, iso] };
      })
    );
  }

  function addHabit(input: Omit<Habit, "id" | "checkIns" | "timezone" | "archivedOn">) {
    setHabits((prev) => [...prev, { ...input, id: `h-${Date.now()}`, timezone: TZ, checkIns: [] }]);
    setAdding(false);
  }

  function saveSchedule(habitId: string, name: string, weekdays: Weekdays) {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, name, weekdays } : h)));
    setEditingId(null);
  }

  function toggleArchive(habitId: string) {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, archivedOn: h.archivedOn ? undefined : DEMO_TODAY } : h)));
    setEditingId(null);
  }

  // "check-ins this week" over "scheduled days this week"; no scheduled days -> honest text (PRD).
  function weekRatio(habit: Habit) {
    const scheduled = weekDates.filter((d) => isScheduled(habit, d) && withinLife(habit, d));
    const checked = scheduled.filter((d) => hasCheckIn(habit, d));
    return { scheduled: scheduled.length, checked: checked.length };
  }

  function todayState(habit: Habit) {
    const scheduledToday = isScheduled(habit, DEMO_TODAY) && withinLife(habit, DEMO_TODAY);
    const checkedToday = hasCheckIn(habit, DEMO_TODAY);
    return { scheduledToday, checkedToday };
  }

  function renderWeek(habit: Habit) {
    return (
      <div className="hp-week" role="img" aria-label={weekAriaLabel(habit)}>
        {weekDates.map((d, i) => {
          const scheduled = isScheduled(habit, d) && withinLife(habit, d);
          const checked = hasCheckIn(habit, d);
          const cls = !scheduled ? "hp-dot is-off" : checked ? "hp-dot is-on" : "hp-dot is-scheduled";
          const isToday = d === DEMO_TODAY;
          return (
            <span key={d} className={`hp-day${isToday ? " is-today" : ""}`}>
              <span className="hp-day-label">{WEEKDAY_LABELS[i]}</span>
              <span className={cls} />
            </span>
          );
        })}
      </div>
    );
  }

  function weekAriaLabel(habit: Habit) {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return (
      "This week: " +
      weekDates
        .map((d, i) => {
          const scheduled = isScheduled(habit, d) && withinLife(habit, d);
          const checked = hasCheckIn(habit, d);
          const state = !scheduled ? "not scheduled" : checked ? "checked" : "scheduled, not done";
          return `${names[i]} ${state}`;
        })
        .join("; ")
    );
  }

  // Month grid of DEMO_TODAY's month, using the same dot vocabulary.
  function renderHistory(habit: Habit) {
    const monthStart = DEMO_TODAY.slice(0, 8) + "01";
    const year = parse(monthStart).getFullYear();
    const month = parse(monthStart).getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = weekdayIndex(monthStart); // blanks before day 1
    const cells: { iso: string; day: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ iso: toISO(new Date(year, month, day)), day });
    }
    return (
      <details className="hp-history">
        <summary>Check-in history</summary>
        <div className="cal-head">{parse(monthStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
        <div className="cal-grid">
          {WEEKDAY_LABELS.map((l, i) => (
            <span key={`dow-${i}`} className="cal-dow">
              {l}
            </span>
          ))}
          {Array.from({ length: leading }, (_, i) => (
            <span key={`blank-${i}`} className="cal-cell is-blank" aria-hidden />
          ))}
          {cells.map(({ iso, day }) => {
            const inLife = withinLife(habit, iso);
            const scheduled = inLife && isScheduled(habit, iso);
            const checked = hasCheckIn(habit, iso);
            const future = iso > DEMO_TODAY;
            if (!inLife) return <span key={iso} className="cal-cell is-blank" aria-hidden />;
            if (!scheduled) return <span key={iso} className="cal-cell is-off" title="Not scheduled">{day}</span>;
            // Scheduled: past can be corrected; future cannot be checked.
            const correctable = !future;
            const cls = checked ? "cal-cell is-checked" : future ? "cal-cell" : "cal-cell is-missed";
            if (!correctable) {
              return (
                <span key={iso} className={cls} title="Upcoming scheduled day">
                  {day}
                </span>
              );
            }
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                aria-pressed={checked}
                aria-label={`${fmtDateLong(iso)}: ${checked ? "checked in, tap to undo" : "not checked, tap to correct"}`}
                onClick={() => toggleCheckIn(habit.id, iso)}
              >
                {day}
              </button>
            );
          })}
        </div>
        <p className="field-hint" style={{ marginTop: 10 }}>
          Missed scheduled days show an outline. Past scheduled days can be corrected; upcoming and off-schedule days
          cannot be checked.
        </p>
      </details>
    );
  }

  return (
    <AppShell active="habits" title="Habits">
      <div className="page-head">
        <h1>Habits</h1>
        <span className="sample-tag">Sample data</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <IconPlus width={16} height={16} /> New habit
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="empty-state">
          <span className="es-ic" aria-hidden>
            <IconRepeat width={22} height={22} />
          </span>
          <h1>No habits yet</h1>
          <p>
            Set a name and the weekdays you want to keep it, then check in once per day. Your habit&apos;s timezone is
            fixed from the day you create it.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Create your first habit
          </button>
        </div>
      ) : (
        <>
          <div className="hp-legend">
            <span className="hp-legend-item">
              <span className="hp-swatch is-on" /> Checked in
            </span>
            <span className="hp-legend-item">
              <span className="hp-swatch is-scheduled" /> Scheduled, not done
            </span>
            <span className="hp-legend-item">
              <span className="hp-swatch is-off" /> Not scheduled
            </span>
          </div>

          {activeHabits.map((habit) => {
            const { scheduled, checked } = weekRatio(habit);
            const { scheduledToday, checkedToday } = todayState(habit);
            return (
              <section className="habit-card" key={habit.id} aria-labelledby={`${habit.id}-name`}>
                <div className="habit-card-head">
                  <h2 id={`${habit.id}-name`}>{habit.name}</h2>
                  <span className="hc-zone">
                    Zone: {habit.timezone} (fixed) &middot; since {fmtDateLong(habit.startDate)}
                  </span>
                </div>
                <div className="habit-card-body">
                  {renderWeek(habit)}
                  <div className="hp-ratio">
                    {scheduled === 0 ? (
                      <span className="hp-ratio-lbl">No scheduled days this week</span>
                    ) : (
                      <>
                        <span className="hp-ratio-num tnum">
                          {checked}/{scheduled}
                        </span>
                        <span className="hp-ratio-lbl">check-ins this week</span>
                      </>
                    )}
                  </div>
                  <div className="habit-actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditingId(habit.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={checkedToday ? "btn btn-sm" : "btn btn-primary btn-sm"}
                      aria-pressed={checkedToday}
                      disabled={!scheduledToday}
                      title={!scheduledToday ? "Today is not a scheduled day for this habit" : undefined}
                      onClick={() => toggleCheckIn(habit.id, DEMO_TODAY)}
                    >
                      {checkedToday ? "Undo check-in" : scheduledToday ? "Check in today" : "Not scheduled today"}
                    </button>
                  </div>
                </div>
                {renderHistory(habit)}
              </section>
            );
          })}

          {archivedHabits.length > 0 && (
            <>
              <p className="label" style={{ margin: "26px 2px 12px" }}>
                Archived
              </p>
              {archivedHabits.map((habit) => (
                <section className="habit-card is-archived" key={habit.id} aria-labelledby={`${habit.id}-name`}>
                  <div className="habit-card-head">
                    <h2 id={`${habit.id}-name`}>{habit.name}</h2>
                    <span className="chip">Archived on {fmtDateLong(habit.archivedOn!)}</span>
                  </div>
                  <div className="habit-card-body">
                    {renderWeek(habit)}
                    <div className="habit-actions">
                      <button type="button" className="btn btn-sm" onClick={() => toggleArchive(habit.id)}>
                        Unarchive
                      </button>
                    </div>
                  </div>
                  <p className="field-hint" style={{ marginTop: 12 }}>
                    Name and schedule are locked. Past check-ins up to the archive date can still be corrected below.
                  </p>
                  {renderHistory(habit)}
                </section>
              ))}
            </>
          )}
        </>
      )}

      {adding && (
        <Modal title="New habit" onClose={() => setAdding(false)}>
          <NewHabitForm onCancel={() => setAdding(false)} onSave={addHabit} />
        </Modal>
      )}

      {editingHabit && !editingHabit.archivedOn && (
        <Modal title="Edit schedule" onClose={() => setEditingId(null)}>
          <EditScheduleForm
            habit={editingHabit}
            onCancel={() => setEditingId(null)}
            onSave={(name, weekdays) => saveSchedule(editingHabit.id, name, weekdays)}
            onArchive={() => toggleArchive(editingHabit.id)}
          />
        </Modal>
      )}
    </AppShell>
  );
}
