import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const integerMoney = z.string().regex(/^-?\d+$/).refine((value) => {
  try { const amount = BigInt(value); return amount >= -9_223_372_036_854_775_808n && amount <= 9_223_372_036_854_775_807n; } catch { return false; }
});
const positiveMoney = z.string().regex(/^\d+$/).refine((value) => {
  try { const amount = BigInt(value); return amount > 0n && amount <= 9_223_372_036_854_775_807n; } catch { return false; }
});
const date = z.string().date();
const month = z.string().regex(/^\d{4}-\d{2}-01$/).refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()));
const note = z.string().trim().max(2000).nullable().optional();
const transactionType = z.enum(["income", "expense", "transfer"]);

export const createAccountSchema = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["cash", "bank", "ewallet"]), opening_balance: integerMoney.default("0") }).strict();
export const patchAccountSchema = z.object({ version, name: z.string().trim().min(1).max(120).optional(), type: z.enum(["cash", "bank", "ewallet"]).optional(), opening_balance: integerMoney.optional() }).strict().refine((value) => Object.keys(value).length > 1);
export const createCategorySchema = z.object({ name: z.string().trim().min(1).max(100), type: z.enum(["income", "expense"]) }).strict();
export const patchCategorySchema = z.object({ version, name: z.string().trim().min(1).max(100) }).strict();

const transactionFields = {
  type: transactionType,
  account_id: uuid,
  to_account_id: uuid.nullable().optional(),
  category_id: uuid.nullable().optional(),
  amount: positiveMoney,
  date,
  note,
};
export const createTransactionSchema = z.object({ ...transactionFields, status: z.enum(["draft", "posted"]).default("posted") }).strict();
export const patchTransactionSchema = z.object({
  version,
  type: transactionType.optional(), account_id: uuid.optional(), to_account_id: uuid.nullable().optional(), category_id: uuid.nullable().optional(),
  amount: positiveMoney.optional(), date: date.optional(), note,
}).strict().refine((value) => Object.keys(value).length > 1);
export const financeVersionSchema = z.object({ version }).strict();
export const createBudgetSchema = z.object({ category_id: uuid, month, limit_amount: positiveMoney }).strict();
export const patchBudgetSchema = z.object({ version, limit_amount: positiveMoney }).strict();
