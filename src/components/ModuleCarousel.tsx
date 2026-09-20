import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconTasks,
  IconKanban,
  IconWallet,
  IconCalendar,
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
} from "./icons";

type Module = {
  no: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  points: string[];
};

const MODULES: Module[] = [
  {
    no: "01",
    title: "Activities",
    desc: "Tasks, habits, and Pomodoro focus in one daily rhythm.",
    icon: <IconTasks width={22} height={22} />,
    points: [
      "Tasks with priority and due dates",
      "Habits on a weekly schedule",
      "Pomodoro 25/5 with a daily cycle",
      "Recurring tasks, set inside Tasks",
    ],
  },
  {
    no: "02",
    title: "Timebox",
    desc: "Plan your day on the dashboard: Class, Task, Habit, and Focus blocks.",
    icon: <IconCalendar width={22} height={22} />,
    points: [
      "Start and end times per block",
      "Focus blocks planned for 25 minutes",
      "Overlaps allowed, flagged as conflicts",
      "Plans never auto-run your activities",
    ],
  },
  {
    no: "03",
    title: "Projects",
    desc: "Manage shared tasks on a Kanban board and track progress.",
    icon: <IconKanban width={22} height={22} />,
    points: [
      "List and Kanban from one source",
      "Progress from unarchived tasks",
      "Dependencies between tasks",
      "Active, done, and archived states",
    ],
  },
  {
    no: "04",
    title: "Finance",
    desc: "Record income, expenses, and transfers across Rupiah accounts.",
    icon: <IconWallet width={22} height={22} />,
    points: [
      "Multiple IDR accounts, balance computed",
      "Consistent transfers between accounts",
      "Budgets per category and month",
      "Recurring transaction drafts",
    ],
  },
];

export default function ModuleCarousel() {
  const [index, setIndex] = useState(0);
  const [perView, setPerView] = useState(3);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w <= 680) setPerView(1);
      else if (w <= 940) setPerView(2);
      else setPerView(3);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const maxIndex = Math.max(0, MODULES.length - perView);

  useEffect(() => {
    setIndex((i) => Math.min(i, maxIndex));
  }, [maxIndex]);

  const go = useCallback(
    (dir: number) => setIndex((i) => Math.min(Math.max(i + dir, 0), maxIndex)),
    [maxIndex]
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  };

  const cardBasis = 100 / perView;
  const translate = `translateX(calc(-${index * cardBasis}% - ${index * (20 / perView)}px))`;

  // progress bar: proporsi kartu terlihat, bergeser saat navigasi
  const shown = Math.min(perView, MODULES.length);
  const fillWidth = (shown / MODULES.length) * 100;
  const fillShift = maxIndex === 0 ? 0 : (index / maxIndex) * (100 - fillWidth);

  return (
    <div
      className="carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label="Tracker modules"
      tabIndex={0}
      onKeyDown={onKey}
    >
      <div className="mod-head">
        <div className="section-head">
          <span className="label">Four modules, one data model</span>
          <h2>Everything you track, in one place</h2>
        </div>
        <div className="carousel-arrows">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous module"
            onClick={() => go(-1)}
            disabled={index === 0}
          >
            <IconArrowLeft />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next module"
            onClick={() => go(1)}
            disabled={index === maxIndex}
          >
            <IconArrowRight />
          </button>
        </div>
      </div>

      <div className="carousel-viewport">
        <div className="carousel-track" ref={trackRef} style={{ transform: translate }}>
          {MODULES.map((m) => (
            <article className="mod-card" key={m.no} aria-label={m.title}>
              <div className="mod-index">
                <span className="mi-num">{m.no}</span>
                <span className="mi-ic">{m.icon}</span>
              </div>
              <h3>{m.title}</h3>
              <p className="mod-desc">{m.desc}</p>
              <ul>
                {m.points.map((p) => (
                  <li key={p}>
                    <span className="tick">
                      <IconCheck width={15} height={15} strokeWidth={2.4} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div
        className="carousel-progress"
        role="presentation"
        aria-hidden
      >
        <span style={{ width: `${fillWidth}%`, left: `${fillShift}%` }} />
      </div>
    </div>
  );
}
