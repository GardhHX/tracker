import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date.");
const instant = z.string().datetime({ offset: true });
const weekdays = z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((values) => new Set(values).size === values.length, "Weekdays must be unique.");

export const createHabitSchema = z.object({ name: z.string().trim().min(1).max(120), start_date: date, weekdays }).strict();
export const patchHabitSchema = z.object({ version, name: z.string().trim().min(1).max(120) }).strict();
export const habitScheduleSchema = z.object({ version, weekdays }).strict();

export const timeboxInputSchema = z.object({
  kind: z.enum(["class", "task", "habit", "focus"]),
  title: z.string().trim().min(1).max(200),
  starts_at: instant,
  ends_at: instant,
  task_id: uuid.nullable().optional(),
  habit_id: uuid.nullable().optional(),
}).strict();
export const patchTimeboxSchema = timeboxInputSchema.partial().extend({ version }).strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), "At least one field must be changed.");
export const pomodoroStartSchema = z.object({ state_version: version, task_id: uuid.nullable().optional() }).strict();
export const pomodoroVersionSchema = z.object({ version }).strict();

export const dateParamSchema = date;
