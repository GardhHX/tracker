import { useState } from "react";
import { IconPlus } from "./icons";

const FAQS = [
  {
    q: "Can only I access my data?",
    a: "Yes. Tracker is designed as a personal account. Every read, write, report, and export uses only the active user's data; IDs that belong to other people are treated as not found.",
  },
  {
    q: "How do I sign in?",
    a: "With Google or with email and password. Your email is verified once before you reach the modules, and password reset and logging out of all devices are available.",
  },
  {
    q: "What is on the dashboard?",
    a: "The Today dashboard shows your Timebox plan, tasks, habits, and Pomodoro controls for the selected date. It does not show balances, transactions, or budgets; those live in Finance.",
  },
  {
    q: "How does the Pomodoro cycle work?",
    a: "Focus runs 25 minutes, short break 5 minutes, and long break 15 minutes after four focuses. The cycle is daily, and the remaining time is kept on the server so it stays consistent after a reload.",
  },
  {
    q: "Where are reports and CSV export?",
    a: "Inside each module. Tasks, Projects, Habits, Pomodoro, and Finance each offer date-range summaries and CSV that follow the filter you set. There is no separate reports menu.",
  },
  {
    q: "Which currency is supported?",
    a: "The first version uses Rupiah (IDR) with multiple accounts, manual entries, transfers between accounts, and budgets per category. Multi-currency is not included yet.",
  },
  {
    q: "Is the app fully working already?",
    a: "This is the landing page and account UI, ready to be connected. The figures shown here are synthetic and labeled Sample data, not real records.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="faq-list">
      {FAQS.map((item, i) => {
        const isOpen = open === i;
        const panelId = `faq-panel-${i}`;
        const btnId = `faq-btn-${i}`;
        return (
          <div className="faq-item" data-open={isOpen} key={item.q}>
            <button
              type="button"
              className="faq-q"
              id={btnId}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className="pm" aria-hidden>
                <IconPlus width={16} height={16} strokeWidth={2.6} />
              </span>
            </button>
            <div className="faq-a" id={panelId} role="region" aria-labelledby={btnId}>
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
