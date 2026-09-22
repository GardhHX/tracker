import { useState, type FormEvent } from "react";
import { IconDownload } from "@/components/icons";
import {
  TrackerApiError,
  downloadFinanceCsv,
  downloadHabitCsv,
  downloadPomodoroCsv,
  downloadProjectCsv,
  downloadTaskCsv,
  getFinanceReport,
  getHabitReport,
  getPomodoroReport,
  getProjectReport,
  getTaskReport,
  type BudgetReportDto,
  type FinanceReportDto,
  type HabitReportDto,
  type PomodoroReportDto,
  type ReportRangeDto,
  type TaskReportDto,
} from "@/lib/api";

type Scope = "tasks" | "projects" | "habits" | "pomodoro" | "finance";
type Report = { range: ReportRangeDto; tasks?: TaskReportDto; pomodoro?: PomodoroReportDto; habits?: HabitReportDto; finance?: FinanceReportDto; budgets?: BudgetReportDto };

function reportError(cause: unknown) {
  return cause instanceof TrackerApiError ? cause.message : "The report could not be loaded. Check your connection and try again.";
}

function saveCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatMoney(value: string) {
  try { return `Rp ${BigInt(value).toLocaleString("en-US")}`; }
  catch { return value; }
}

function formatFocus(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function Result({ report }: { report: Report }) {
  const task = report.tasks;
  const pomodoro = report.pomodoro;
  const habit = report.habits;
  const finance = report.finance;
  const budgets = report.budgets;
  return <div className="report-result" aria-live="polite">
    <p className="report-range">{report.range.from} to {report.range.to} · {report.range.timezone}</p>
    {task && <div className="report-line"><strong>{task.completed_count}</strong><span>completion event{task.completed_count === 1 ? "" : "s"}</span><strong>{task.distinct_task_count}</strong><span>unique task{task.distinct_task_count === 1 ? "" : "s"}</span></div>}
    {pomodoro && <div className="report-line"><strong>{formatFocus(pomodoro.focus_duration_seconds)}</strong><span>focus time</span><strong>{pomodoro.completed_focus_count}</strong><span>completed focus session{pomodoro.completed_focus_count === 1 ? "" : "s"}</span>{pomodoro.cancelled_focus_count > 0 && <><strong>{pomodoro.cancelled_focus_count}</strong><span>cancelled focus session{pomodoro.cancelled_focus_count === 1 ? "" : "s"}</span></>}</div>}
    {habit && <div className="report-list">{habit.length === 0 ? <p className="field-hint">No scheduled habit days fall inside this range.</p> : habit.map((item) => <div className="report-row" key={item.habit_id}><span>{item.name}</span><span>{item.completed_days} of {item.scheduled_days} days{item.ratio === null ? ", no scheduled days" : `, ${Math.round(item.ratio * 100)}% complete`}</span></div>)}</div>}
    {finance && <div className="report-line"><strong>{formatMoney(finance.income)}</strong><span>income</span><strong>{formatMoney(finance.expense)}</strong><span>expense</span><strong>{formatMoney(finance.net)}</strong><span>net</span></div>}
    {budgets && budgets.length > 0 && <div className="report-list">{budgets.map((item) => <div className="report-row" key={`${item.month}-${item.category_id}`}><span>{item.month}</span><span>{formatMoney(item.spent)} spent of {formatMoney(item.limit_amount)}</span></div>)}</div>}
  </div>;
}

export default function ReportPanel({ scope, projectId }: { scope: Scope; projectId?: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState("");
  const isProject = scope === "projects";
  const label = isProject ? "Project report" : `${scope[0].toUpperCase()}${scope.slice(1)} report`;

  async function load() {
    if ((from && !to) || (!from && to)) { setError("Set both dates, or clear both dates to use the current month."); return; }
    setLoading(true); setError("");
    try {
      let next: Report;
      if (scope === "tasks") next = await getTaskReport(from || undefined, to || undefined);
      else if (scope === "projects") {
        if (!projectId) { setError("Choose a project before loading its report."); return; }
        next = await getProjectReport(projectId, from || undefined, to || undefined);
      }
      else if (scope === "habits") next = await getHabitReport(from || undefined, to || undefined);
      else if (scope === "pomodoro") next = await getPomodoroReport(from || undefined, to || undefined);
      else next = await getFinanceReport(from || undefined, to || undefined);
      setReport(next);
      setFrom(next.range.from); setTo(next.range.to);
    } catch (cause) { setError(reportError(cause)); }
    finally { setLoading(false); }
  }

  async function download(section?: "tasks" | "pomodoro" | "finance" | "budgets") {
    if (!report) return;
    const name = `${scope}${section ? `-${section}` : ""}-${report.range.from}-${report.range.to}.csv`;
    setDownloading(section ?? "default"); setError("");
    try {
      let csv: string;
      if (scope === "tasks") csv = await downloadTaskCsv(report.range.from, report.range.to);
      else if (scope === "projects" && projectId && (section === "tasks" || section === "pomodoro")) csv = await downloadProjectCsv(projectId, section, report.range.from, report.range.to);
      else if (scope === "habits") csv = await downloadHabitCsv(report.range.from, report.range.to);
      else if (scope === "pomodoro") csv = await downloadPomodoroCsv(report.range.from, report.range.to);
      else if (section === "finance" || section === "budgets") csv = await downloadFinanceCsv(section, report.range.from, report.range.to);
      else return;
      saveCsv(csv, name);
    } catch (cause) { setError(reportError(cause)); }
    finally { setDownloading(""); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void load(); }
  return <section className="report-panel" aria-labelledby={`${scope}-report-heading`}>
    <div className="report-head"><div><h2 id={`${scope}-report-heading`}>{label}</h2><p>Use the same date range for the summary and CSV.</p></div></div>
    <form className="report-controls" onSubmit={submit} noValidate>
      <label>From<input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>To<input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>{loading ? "Loading report…" : "Show report"}</button>
    </form>
    {error && <div className="form-alert error" role="alert">{error}</div>}
    {loading ? <p className="report-state" role="status">Loading the selected report…</p> : report ? <><Result report={report} /><div className="report-export" aria-label={`${label} CSV exports`}>
      {scope === "projects" ? <><button className="btn btn-sm" type="button" disabled={Boolean(downloading)} onClick={() => void download("tasks")}><IconDownload width={15} height={15} />{downloading === "tasks" ? "Preparing…" : "Task CSV"}</button><button className="btn btn-sm" type="button" disabled={Boolean(downloading)} onClick={() => void download("pomodoro")}><IconDownload width={15} height={15} />{downloading === "pomodoro" ? "Preparing…" : "Focus CSV"}</button></> : scope === "finance" ? <><button className="btn btn-sm" type="button" disabled={Boolean(downloading)} onClick={() => void download("finance")}><IconDownload width={15} height={15} />{downloading === "finance" ? "Preparing…" : "Transaction CSV"}</button><button className="btn btn-sm" type="button" disabled={Boolean(downloading)} onClick={() => void download("budgets")}><IconDownload width={15} height={15} />{downloading === "budgets" ? "Preparing…" : "Budget CSV"}</button></> : <button className="btn btn-sm" type="button" disabled={Boolean(downloading)} onClick={() => void download()}><IconDownload width={15} height={15} />{downloading ? "Preparing…" : "Download CSV"}</button>}
    </div></> : <p className="report-state">Choose a date range, then show the report.</p>}
  </section>;
}
