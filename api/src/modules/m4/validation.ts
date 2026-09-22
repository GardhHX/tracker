import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date.");
const interval = z.number().int().min(1).max(365);
const frequency = z.enum(["daily", "weekly", "monthly"]);
const description = z.string().max(5000).nullable();
const note = z.string().trim().max(2000).nullable();
const positiveMoney = z.string().regex(/^\d+$/).refine((value) => {
  try { const parsed = BigInt(value); return parsed > 0n && parsed <= 9_223_372_036_854_775_807n; } catch { return false; }
});
const transactionFields = {
  type: z.enum(["income", "expense", "transfer"]),
  account_id: uuid,
  to_account_id: uuid.nullable().optional(),
  category_id: uuid.nullable().optional(),
  amount: positiveMoney,
  note: note.optional(),
};

const endAfterStart = (value: { start_date?: string; end_date?: string | null }) => value.end_date === undefined || value.end_date === null || !value.start_date || value.end_date >= value.start_date;

export const createTaskRuleSchema = z.object({
  title: z.string().trim().min(1).max(200), description: description.optional(), project_id: uuid.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(), frequency, interval: interval.optional(), start_date: date, end_date: date.nullable().optional(),
}).strict().refine(endAfterStart, "end_date must be on or after start_date.");

export const patchTaskRuleSchema = z.object({
  version, title: z.string().trim().min(1).max(200).optional(), description: description.optional(), project_id: uuid.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(), frequency: frequency.optional(), interval: interval.optional(), end_date: date.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 1, "At least one field must be changed.");

export const createFinanceRuleSchema = z.object({
  ...transactionFields, frequency, interval: interval.optional(), start_date: date, end_date: date.nullable().optional(),
}).strict().refine(endAfterStart, "end_date must be on or after start_date.");

export const patchFinanceRuleSchema = z.object({
  version, type: z.enum(["income", "expense", "transfer"]).optional(), account_id: uuid.optional(), to_account_id: uuid.nullable().optional(),
  category_id: uuid.nullable().optional(), amount: positiveMoney.optional(), note: note.optional(), frequency: frequency.optional(), interval: interval.optional(), end_date: date.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 1, "At least one field must be changed.");

export const m4VersionSchema = z.object({ version }).strict();
