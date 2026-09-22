export type ReportRange = { from: string; to: string; timezone: string };

export type TaskReport = {
  completed_count: number;
  distinct_task_count: number;
  per_project: Array<{ project_id: string | null; project_name_snapshot: string | null; completed_count: number; distinct_task_count: number }>;
};

export type PomodoroReport = {
  focus_duration_ms: number;
  focus_duration_seconds: number;
  completed_focus_count: number;
  cancelled_focus_count: number;
  per_project: Array<{ project_id: string | null; project_name_snapshot: string | null; focus_duration_ms: number; focus_duration_seconds: number }>;
};

export type HabitReport = Array<{ habit_id: string; name: string; timezone: string; scheduled_days: number; completed_days: number; ratio: number | null }>;

export type FinanceReport = {
  income: string;
  expense: string;
  net: string;
  per_category: Array<{ category_id: string; type: "income" | "expense"; total: string }>;
  basis: "current_corrected_transactions";
};

export type BudgetReport = Array<{ month: string; category_id: string; limit_amount: string; spent: string; remaining: string; basis: "full_calendar_month" }>;

export type CsvExport = { filename: string; body: string };

export interface M5Service {
  taskSummary(userId: string, input: { from?: string; to?: string }): Promise<{ range: ReportRange; tasks: TaskReport }>;
  projectSummary(userId: string, projectId: string, input: { from?: string; to?: string }): Promise<{ range: ReportRange; tasks: TaskReport; pomodoro: PomodoroReport }>;
  habitSummary(userId: string, input: { from?: string; to?: string }): Promise<{ range: ReportRange; habits: HabitReport }>;
  pomodoroSummary(userId: string, input: { from?: string; to?: string }): Promise<{ range: ReportRange; pomodoro: PomodoroReport }>;
  financeSummary(userId: string, input: { from?: string; to?: string }): Promise<{ range: ReportRange; finance: FinanceReport; budgets: BudgetReport }>;
  exportTasks(userId: string, input: { from?: string; to?: string }): Promise<CsvExport>;
  exportProject(userId: string, projectId: string, section: "tasks" | "pomodoro", input: { from?: string; to?: string }): Promise<CsvExport>;
  exportHabits(userId: string, input: { from?: string; to?: string }): Promise<CsvExport>;
  exportPomodoro(userId: string, input: { from?: string; to?: string }): Promise<CsvExport>;
  exportFinance(userId: string, section: "finance" | "budgets", input: { from?: string; to?: string }): Promise<CsvExport>;
}

export class M5Error extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}
