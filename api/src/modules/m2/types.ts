import type { Mutation, Page } from "../work/types.js";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PomodoroPhase = "focus" | "short_break" | "long_break";
export type PomodoroStatus = "running" | "paused" | "completed" | "cancelled";
export type TimeboxKind = "class" | "task" | "habit" | "focus";
export type TimeboxStatus = "planned" | "cancelled";

export type HabitScheduleDto = { id: string; habit_id: string; effective_from: string; weekdays: number[]; created_at: string };
export type HabitCheckInDto = { id: string; habit_id: string; date: string; checked_at: string; created_at: string };
export type HabitDto = {
  id: string; version: number; created_at: string; updated_at: string; name: string; start_date: string; timezone: string;
  archived_at: string | null; archived_on: string | null; current_schedule: HabitScheduleDto;
};

export type TimeboxDto = {
  id: string; version: number; created_at: string; updated_at: string; kind: TimeboxKind; title: string;
  starts_at: string; ends_at: string; task_id: string | null; habit_id: string | null;
  status: TimeboxStatus; cancelled_at: string | null;
};

export type PomodoroDayDto = {
  id: string; version: number; created_at: string; updated_at: string; cycle_date: string; timezone: string;
  next_phase: PomodoroPhase; completed_focus_count: number;
};
export type PomodoroStateDto = {
  cycle_day_id: string; cycle_date: string; timezone: string; next_phase: PomodoroPhase;
  completed_focus_count: number; version: number; updated_at: string;
};
export type PomodoroIntervalDto = { id: string; session_id: string; started_at: string; ended_at: string | null };
export type PomodoroSessionDto = {
  id: string; version: number; created_at: string; updated_at: string; cycle_day_id: string; cycle_date: string;
  cycle_timezone: string; phase: PomodoroPhase; status: PomodoroStatus; planned_seconds: number; task_id: string | null;
  project_id_at_start: string | null; task_title_snapshot: string | null; project_name_snapshot: string | null;
  started_at: string; due_at: string | null; ended_at: string | null; active_duration_ms: number; remaining_seconds: number;
};
export type PomodoroBundleDto = { state: PomodoroStateDto; today: PomodoroDayDto; session: PomodoroSessionDto | null };
export type PomodoroResponse = { data: PomodoroBundleDto; meta: { server_now: string }; status?: number; replayed?: boolean };

export interface M2Service {
  listHabits(userId: string, query: { archived: boolean | "all"; page: number; pageSize: number }): Promise<Page<HabitDto>>;
  getHabit(userId: string, id: string): Promise<HabitDto>;
  createHabit(userId: string, input: { name: string; start_date: string; weekdays: number[] }, key: string): Promise<Mutation<HabitDto>>;
  patchHabit(userId: string, id: string, input: { version: number; name: string }): Promise<HabitDto>;
  listHabitSchedules(userId: string, id: string): Promise<Page<HabitScheduleDto>>;
  setHabitSchedule(userId: string, id: string, input: { version: number; weekdays: number[] }, key: string): Promise<Mutation<HabitDto>>;
  archiveHabit(userId: string, id: string, version: number): Promise<HabitDto>;
  listHabitCheckIns(userId: string, id: string, query: { from?: string; to?: string; page: number; pageSize: number }): Promise<Page<HabitCheckInDto>>;
  setHabitCheckIn(userId: string, id: string, date: string): Promise<HabitCheckInDto>;
  deleteHabitCheckIn(userId: string, id: string, date: string): Promise<void>;

  listTimebox(userId: string, query: { date?: string; status: TimeboxStatus | "all"; page: number; pageSize: number }): Promise<Page<TimeboxDto> & { meta: Page<TimeboxDto>["meta"] & { date: string; timezone: string } }>;
  getTimebox(userId: string, id: string): Promise<TimeboxDto>;
  createTimebox(userId: string, input: TimeboxInput, key: string): Promise<Mutation<TimeboxDto>>;
  patchTimebox(userId: string, id: string, input: { version: number } & Partial<TimeboxInput>): Promise<TimeboxDto>;
  cancelTimebox(userId: string, id: string, version: number): Promise<TimeboxDto>;

  getPomodoroActive(userId: string): Promise<PomodoroResponse>;
  startPomodoro(userId: string, input: { state_version: number; task_id?: string | null }, key: string): Promise<PomodoroResponse>;
  pausePomodoro(userId: string, id: string, version: number): Promise<PomodoroResponse>;
  resumePomodoro(userId: string, id: string, version: number): Promise<PomodoroResponse>;
  cancelPomodoro(userId: string, id: string, version: number): Promise<PomodoroResponse>;
  listPomodoroSessions(userId: string, query: { from?: string; to?: string; phase?: PomodoroPhase; status?: PomodoroStatus; taskId?: string; projectId?: string; page: number; pageSize: number }): Promise<Page<PomodoroSessionDto>>;
  getPomodoroSession(userId: string, id: string): Promise<{ data: PomodoroSessionDto & { intervals: PomodoroIntervalDto[] }; meta: { server_now: string } }>;
  reconcileDueSessions(limit?: number): Promise<number>;
}

export type TimeboxInput = { kind: TimeboxKind; title: string; starts_at: string; ends_at: string; task_id?: string | null; habit_id?: string | null };
