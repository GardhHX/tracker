import { z } from "zod";

const nullableDescription = z.string().max(5000).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date.");
const uuid = z.string().uuid();
const version = z.number().int().positive();

export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(120), description: nullableDescription.optional() }).strict();
export const patchProjectSchema = z.object({ version, name: z.string().trim().min(1).max(120).optional(), description: nullableDescription.optional() }).strict()
  .refine((value) => value.name !== undefined || value.description !== undefined, "At least one field must be changed.");
export const projectStatusSchema = z.object({ version, status: z.enum(["active", "completed", "archived"]) }).strict();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: nullableDescription.optional(),
  project_id: uuid.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  due_date: date.nullable().optional(),
}).strict();
export const patchTaskSchema = z.object({
  version,
  title: z.string().trim().min(1).max(200).optional(),
  description: nullableDescription.optional(),
  project_id: uuid.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  due_date: date.nullable().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "version"), "At least one field must be changed.");
export const taskStatusSchema = z.object({ version, status: z.enum(["todo", "in_progress", "done"]) }).strict();
export const versionSchema = z.object({ version }).strict();
