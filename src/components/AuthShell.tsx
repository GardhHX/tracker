import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import Brand from "./Brand";
import ThemeToggle from "./ThemeToggle";

export default function AuthShell({
  children,
  quote,
  sub = "Log tasks and habits, keep your focus with Pomodoro, and track your money. It all connects in one account.",
}: {
  children: ReactNode;
  quote?: ReactNode;
  sub?: string;
}) {
  return (
    <div className="auth">
      <div className="auth-form-col">
        <div className="auth-top">
          <Link to="/" aria-label="Tracker home">
            <Brand size={30} />
          </Link>
          <ThemeToggle />
        </div>
        <div className="auth-body">{children}</div>
      </div>

      <aside className="auth-aside" aria-hidden>
        <div className="aa-brand">
          <Brand size={30} />
        </div>
        <div>
          <p className="aa-quote">
            {quote ?? (
              <>
                One ledger for your <em>life and money.</em>
              </>
            )}
          </p>
          <p className="aa-sub">{sub}</p>

          <div className="aa-card">
            <div className="aac-row">
              <span className="aac-k">Focus today</span>
              <span className="aac-v pos tnum">2h 15m</span>
            </div>
            <div className="aac-row">
              <span className="aac-k">Tasks done</span>
              <span className="aac-v tnum">7 / 10</span>
            </div>
            <div className="aac-row">
              <span className="aac-k">Habit streak</span>
              <span className="aac-v tnum">5 days</span>
            </div>
          </div>
          <p className="aa-note">Sample data, not real records.</p>
        </div>
        <p className="aa-note">Four modules · IDR ready · WCAG AA contrast</p>
      </aside>
    </div>
  );
}
