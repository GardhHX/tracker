import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import ModuleCarousel from "@/components/ModuleCarousel";
import Faq from "@/components/Faq";
import {
  IconShield,
  IconRepeat,
  IconDownload,
  IconCheck,
} from "@/components/icons";

const STATEMENT = [
  { cat: "Groceries", pct: 72, amt: "Rp 1,840,000" },
  { cat: "Transport", pct: 44, amt: "Rp 620,000" },
  { cat: "Eating out", pct: 62, amt: "Rp 540,000" },
  { cat: "Subscriptions", pct: 28, amt: "Rp 180,000" },
];

// Today/dashboard plan (Timebox + Pomodoro). No finance details on the dashboard (REQ-18, D-38).
const PLAN = [
  { kind: "Focus", title: "Draft proposal", time: "09:00", dot: "var(--accent-solid)" },
  { kind: "Class", title: "Design review", time: "11:00", dot: "var(--ink)" },
  { kind: "Habit", title: "Read 30 min", time: "14:00", dot: "var(--line-strong)" },
  { kind: "Task", title: "Inbox zero", time: "16:30", dot: "var(--muted)" },
];

const MINOR = [
  {
    icon: <IconShield width={22} height={22} />,
    title: "Your data only",
    desc: "Every read, report, and export uses only your own account. Records that belong to other people cannot be reached.",
  },
  {
    icon: <IconRepeat width={22} height={22} />,
    title: "Recurring, where it belongs",
    desc: "Daily, weekly, or monthly rules live inside Tasks and Finance. They create tasks and transaction drafts without duplicating records.",
  },
  {
    icon: <IconDownload width={22} height={22} />,
    title: "CSV from each module",
    desc: "Export from the source module: Tasks, Projects, Habits, Pomodoro, or Finance. The CSV follows the same filter you see on screen.",
  },
];

const STEPS = [
  {
    no: "01",
    title: "Create your account",
    desc: "Sign up with Google or email, then verify your email once to open every module. English, Rupiah, and Asia/Jakarta come as defaults.",
  },
  {
    no: "02",
    title: "Plan and capture your day",
    desc: "Block your time with Timebox on the dashboard, then log tasks, habits, and focus sessions. Every module shares one data model, so the numbers stay consistent.",
  },
  {
    no: "03",
    title: "Review and trace",
    desc: "Open a summary for any date range inside its module. Each total traces back to the event, interval, or revision it came from, and exports to CSV when you need it.",
  },
];

export default function Home() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar />

      <main id="main">
        {/* HERO: text left, Today plan right */}
        <section className="hero">
          <div className="container">
            <div>
              <Reveal>
                <span className="hero-kicker">
                  <span className="rule" aria-hidden />
                  Personal activities, projects, and money
                </span>
              </Reveal>
              <Reveal delay={60}>
                <h1>
                  One ledger for your <em>life and money.</em>
                </h1>
              </Reveal>
              <Reveal delay={120}>
                <p className="lede">
                  Tracker keeps your tasks, habits, focus, projects, and finances in one
                  account. Tidy, connected, and every number traces back to where it
                  came from.
                </p>
              </Reveal>
              <Reveal delay={180}>
                <div className="hero-cta">
                  <Link to="/register" className="btn btn-primary btn-lg">
                    Create free account
                  </Link>
                  <a href="#modules" className="btn btn-quiet btn-lg">
                    See the modules
                  </a>
                </div>
                <p className="hero-foot">
                  No credit card. Already have an account?{" "}
                  <Link to="/login" className="textlink">
                    Log in
                  </Link>
                  .
                </p>
              </Reveal>
            </div>

            <Reveal delay={140}>
              <div className="ledger" role="img" aria-label="Sample Today dashboard in Tracker">
                <div className="ledger-top">
                  <span className="lt-title">Today</span>
                  <span className="lt-tag">Sample data</span>
                </div>
                <div className="ledger-body">
                  <div className="ledger-figure">
                    <div>
                      <div className="lf-k">Focus today</div>
                      <div className="lf-v tnum">2h 15m</div>
                    </div>
                    <div className="lf-delta">Tasks 7 / 10</div>
                  </div>
                  <div className="ledger-rows" aria-hidden={false}>
                    {PLAN.map((b) => (
                      <div className="ledger-row" key={b.title}>
                        <span className="lr-name">
                          <span className="lr-dot" style={{ background: b.dot }} />
                          {b.kind}
                          <span style={{ color: "var(--muted)" }}>· {b.title}</span>
                        </span>
                        <span className="lr-amt tnum">{b.time}</span>
                      </div>
                    ))}
                  </div>
                  <p className="ledger-note">Sample data, not real activity.</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* MODULES: editorial carousel */}
        <section className="section" id="modules">
          <div className="container">
            <Reveal>
              <ModuleCarousel />
            </Reveal>
          </div>
        </section>

        {/* FEATURES: one lead capability + three supporting */}
        <section className="section" id="features">
          <div className="container">
            <div className="feature-lead">
              <Reveal>
                <div className="fl-copy">
                  <span className="label">Reports you can trace</span>
                  <h3 style={{ marginTop: 12 }}>
                    Every number traces back to its source.
                  </h3>
                  <p>
                    Reports are not numbers that appear from nowhere. Open a total and
                    Tracker shows the event, interval, or revision behind it, along with
                    how it was calculated. Reports and CSV live inside each module, not a
                    separate menu.
                  </p>
                  <a href="#how-it-works" className="textlink">
                    See how it works
                  </a>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div className="statement" role="img" aria-label="Sample expense breakdown by category">
                  <div className="st-head">
                    <span>Expenses by category</span>
                    <span>September</span>
                  </div>
                  {STATEMENT.map((s) => (
                    <div className="st-row" key={s.cat}>
                      <span className="st-cat">{s.cat}</span>
                      <span className="st-bar" aria-hidden>
                        <span style={{ width: `${s.pct}%` }} />
                      </span>
                      <span className="st-amt tnum">{s.amt}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            <div className="feature-minor">
              {MINOR.map((m, i) => (
                <Reveal key={m.title} delay={i * 70}>
                  <div className="fmin">
                    <span className="fm-ic">{m.icon}</span>
                    <h4>{m.title}</h4>
                    <p>{m.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS: editorial ruled list */}
        <section className="section" id="how-it-works">
          <div className="container">
            <div className="section-head">
              <Reveal>
                <span className="label">How it works</span>
              </Reveal>
              <Reveal delay={60}>
                <h2>From the first note to a report</h2>
              </Reveal>
            </div>
            <div className="steps" style={{ marginTop: 34 }}>
              {STEPS.map((s, i) => (
                <Reveal key={s.no} delay={i * 70}>
                  <div className="step">
                    <span className="s-num">{s.no}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section" id="faq">
          <div className="container">
            <div className="section-head">
              <Reveal>
                <span className="label">Frequently asked</span>
              </Reveal>
              <Reveal delay={60}>
                <h2>Questions people ask</h2>
              </Reveal>
            </div>
            <Reveal delay={100}>
              <div style={{ marginTop: 28 }}>
                <Faq />
              </div>
            </Reveal>
          </div>
        </section>

        {/* CLOSING */}
        <section className="section plain" style={{ borderTop: "none" }}>
          <div className="container">
            <Reveal>
              <div className="closing">
                <div>
                  <h2>Start tracking your days and money today.</h2>
                  <p>
                    Create a free account, then log in any time with Google or email.
                    Your data is stored on the server and stays yours.
                  </p>
                </div>
                <div className="closing-actions">
                  <Link to="/register" className="btn btn-primary btn-lg btn-block">
                    Create free account
                  </Link>
                  <Link to="/login" className="btn btn-quiet btn-lg btn-block">
                    Log in
                  </Link>
                  <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.84rem", opacity: 0.9 }}>
                    <IconCheck width={15} height={15} strokeWidth={2.4} /> English UI · IDR · Asia/Jakarta
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
