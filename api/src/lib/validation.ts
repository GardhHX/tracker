import { z } from "zod";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validatePassword(value: string) {
  if (value.length < 12 || value.length > 128) {
    return { valid: false as const, message: "Password must be 12 to 128 characters." };
  }
  return { valid: true as const };
}

export function parseCorsOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().refine((value) => validatePassword(value).valid, "Password must be 12 to 128 characters."),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

export const tokenSchema = z.object({ token: z.string().min(32).max(256) }).strict();

export const emailSchema = z.object({ email: z.string().trim().email().max(254) }).strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().refine((value) => validatePassword(value).valid, "Password must be 12 to 128 characters."),
}).strict();

export const updateProfileSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().min(1).max(64).optional(),
}).strict().refine((value) => value.name !== undefined || value.timezone !== undefined, "Provide name and/or timezone.");

export const passwordSetupConfirmSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().refine((value) => validatePassword(value).valid, "Password must be 12 to 128 characters."),
}).strict();
