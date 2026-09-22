import {
  Prisma,
  type Budget,
  type FinanceAccount,
  type FinanceAccountBalanceChange,
  type FinanceCategory,
  type FinanceTransaction,
  type FinanceTransactionRevision,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import { createIdempotencyExecutor } from "../../lib/idempotency.js";
import type {
  AccountDto, BalanceChangeDto, BudgetDto, CategoryDto, CreateTransactionInput, M3Service, RevisionDto,
  RevisionSnapshot, TransactionDto, TransactionFields,
} from "./types.js";
import { FinanceError } from "./types.js";

type Db = PrismaClient | Prisma.TransactionClient;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

const iso = (value: Date | null) => value?.toISOString() ?? null;
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const money = (value: bigint) => value.toString();

function localDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseMoney(value: string, positive = false) {
  try {
    const parsed = BigInt(value);
    if (parsed < -MAX_BIGINT - 1n || parsed > MAX_BIGINT || (positive && parsed <= 0n)) throw new Error();
    return parsed;
  } catch {
    throw new FinanceError(422, "VALIDATION_ERROR", positive ? "Amount must be a positive whole rupiah value." : "Amount must be a whole rupiah value within BIGINT range.");
  }
}

function assertVersion(actual: number, expected: number) {
  if (actual !== expected) throw new FinanceError(409, "VERSION_CONFLICT", "The resource changed. Refresh and try again.");
}

function accountBase(account: FinanceAccount, balance: bigint): AccountDto {
  return {
    id: account.id, version: account.version, created_at: account.created_at.toISOString(), updated_at: account.updated_at.toISOString(),
    name: account.name, type: account.type, opening_balance: money(account.opening_balance), balance: money(balance), archived_at: iso(account.archived_at),
  };
}

const categoryDto = (category: FinanceCategory): CategoryDto => ({
  id: category.id, version: category.version, created_at: category.created_at.toISOString(), updated_at: category.updated_at.toISOString(),
  name: category.name, type: category.type, archived_at: iso(category.archived_at),
});

export const transactionDto = (transaction: FinanceTransaction): TransactionDto => ({
  id: transaction.id, version: transaction.version, created_at: transaction.created_at.toISOString(), updated_at: transaction.updated_at.toISOString(),
  type: transaction.type, status: transaction.status, account_id: transaction.account_id, to_account_id: transaction.to_account_id,
  category_id: transaction.category_id, amount: money(transaction.amount), date: dateOnly(transaction.date), note: transaction.note,
  posted_at: iso(transaction.posted_at), voided_at: iso(transaction.voided_at), recurrence_rule_id: transaction.recurrence_rule_id,
  occurrence_date: transaction.occurrence_date ? dateOnly(transaction.occurrence_date) : null, rule_version: transaction.rule_version,
});

export function transactionSnapshot(transaction: FinanceTransaction): RevisionSnapshot {
  const { created_at: _created, updated_at: _updated, ...value } = transactionDto(transaction);
  return value;
}

function revisionDto(revision: FinanceTransactionRevision): RevisionDto {
  const stored = revision.snapshot as unknown as Partial<RevisionSnapshot>;
  return {
    id: revision.id, transaction_id: revision.transaction_id, transaction_version: revision.transaction_version, action: revision.action,
    snapshot: { ...stored, recurrence_rule_id: stored.recurrence_rule_id ?? null, occurrence_date: stored.occurrence_date ?? null, rule_version: stored.rule_version ?? null } as RevisionSnapshot,
    changed_at: revision.changed_at.toISOString(),
  };
}

const balanceChangeDto = (change: FinanceAccountBalanceChange): BalanceChangeDto => ({
  id: change.id, account_id: change.account_id, account_version: change.account_version,
  previous_balance: change.previous_balance === null ? null : money(change.previous_balance), new_balance: money(change.new_balance), changed_at: change.changed_at.toISOString(),
});

async function ownedAccount(db: Db, userId: string, id: string) {
  const row = await db.financeAccount.findFirst({ where: { user_id: userId, id } });
  if (!row) throw new FinanceError(404, "NOT_FOUND", "Finance account not found.");
  return row;
}

async function ownedCategory(db: Db, userId: string, id: string) {
  const row = await db.financeCategory.findFirst({ where: { user_id: userId, id } });
  if (!row) throw new FinanceError(404, "NOT_FOUND", "Finance category not found.");
  return row;
}

async function ownedTransaction(db: Db, userId: string, id: string) {
  const row = await db.financeTransaction.findFirst({ where: { user_id: userId, id } });
  if (!row) throw new FinanceError(404, "NOT_FOUND", "Finance transaction not found.");
  return row;
}

async function ownedBudget(db: Db, userId: string, id: string) {
  const row = await db.budget.findFirst({ where: { user_id: userId, id } });
  if (!row) throw new FinanceError(404, "NOT_FOUND", "Budget not found.");
  return row;
}

async function balances(db: Db, userId: string, accounts: FinanceAccount[]) {
  const result = new Map(accounts.map((account) => [account.id, account.opening_balance]));
  if (!accounts.length) return result;
  const rows = await db.financeTransaction.findMany({
    where: { user_id: userId, status: "posted", OR: [{ account_id: { in: accounts.map((account) => account.id) } }, { to_account_id: { in: accounts.map((account) => account.id) } }] },
    select: { type: true, account_id: true, to_account_id: true, amount: true },
  });
  for (const row of rows) {
    if (result.has(row.account_id)) result.set(row.account_id, result.get(row.account_id)! + (row.type === "income" ? row.amount : -row.amount));
    if (row.type === "transfer" && row.to_account_id && result.has(row.to_account_id)) result.set(row.to_account_id, result.get(row.to_account_id)! + row.amount);
  }
  return result;
}

async function loadAccountDto(db: Db, userId: string, id: string) {
  const account = await ownedAccount(db, userId, id);
  return accountBase(account, (await balances(db, userId, [account])).get(id)!);
}

async function assertRefs(db: Db, userId: string, input: TransactionFields, requireActive = true) {
  const source = await ownedAccount(db, userId, input.account_id);
  if (requireActive && source.archived_at) throw new FinanceError(409, "RESOURCE_ARCHIVED", "The source account is archived.");
  if (input.type === "transfer") {
    if (!input.to_account_id || input.to_account_id === input.account_id || input.category_id) throw new FinanceError(422, "VALIDATION_ERROR", "Transfers require a different destination account and no category.");
    const destination = await ownedAccount(db, userId, input.to_account_id);
    if (requireActive && destination.archived_at) throw new FinanceError(409, "RESOURCE_ARCHIVED", "The destination account is archived.");
  } else {
    if (input.to_account_id || !input.category_id) throw new FinanceError(422, "VALIDATION_ERROR", "Income and expense transactions require a matching category and no destination account.");
    const category = await ownedCategory(db, userId, input.category_id);
    if (requireActive && category.archived_at) throw new FinanceError(409, "RESOURCE_ARCHIVED", "The category is archived.");
    if (category.type !== input.type) throw new FinanceError(422, "CATEGORY_TYPE_MISMATCH", "The category type must match the transaction type.");
  }
}

async function userToday(db: Db, userId: string, now: Date) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new FinanceError(404, "NOT_FOUND", "User not found.");
  return localDate(now, user.timezone);
}

async function assertPostable(db: Db, userId: string, input: TransactionFields, now: Date) {
  await assertRefs(db, userId, input, true);
  if (input.date > await userToday(db, userId, now)) throw new FinanceError(422, "FUTURE_TRANSACTION", "Posted transactions cannot use a future date.");
}

async function appendRevision(db: Db, transaction: FinanceTransaction, action: "created" | "edited" | "posted" | "voided", changedAt: Date) {
  await db.financeTransactionRevision.create({ data: {
    user_id: transaction.user_id, transaction_id: transaction.id, transaction_version: transaction.version, action,
    snapshot: transactionSnapshot(transaction) as unknown as Prisma.InputJsonObject, changed_at: changedAt,
  } });
}

function fieldsOf(transaction: FinanceTransaction): TransactionFields {
  return { type: transaction.type, account_id: transaction.account_id, to_account_id: transaction.to_account_id, category_id: transaction.category_id, amount: money(transaction.amount), date: dateOnly(transaction.date), note: transaction.note };
}

function sameFields(a: TransactionFields, b: TransactionFields) {
  return a.type === b.type && a.account_id === b.account_id && (a.to_account_id ?? null) === (b.to_account_id ?? null)
    && (a.category_id ?? null) === (b.category_id ?? null) && a.amount === b.amount && a.date === b.date && (a.note ?? null) === (b.note ?? null);
}

async function budgetDto(db: Db, budget: Budget): Promise<BudgetDto> {
  const nextMonth = new Date(budget.month);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const rows = await db.financeTransaction.findMany({ where: {
    user_id: budget.user_id, category_id: budget.category_id, type: "expense", status: "posted", date: { gte: budget.month, lt: nextMonth },
  }, select: { amount: true } });
  const spent = rows.reduce((sum, row) => sum + row.amount, 0n);
  return {
    id: budget.id, version: budget.version, created_at: budget.created_at.toISOString(), updated_at: budget.updated_at.toISOString(), category_id: budget.category_id,
    month: dateOnly(budget.month), limit_amount: money(budget.limit_amount), spent: money(spent), remaining: money(budget.limit_amount - spent),
  };
}

function uniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function createPrismaM3Service(db: PrismaClient, options: { now?: () => Date } = {}): M3Service {
  const now = options.now ?? (() => new Date());
  const executeIdempotent = createIdempotencyExecutor(db, { now });
  const result = <T>(value: { status: number; body: Prisma.InputJsonValue; replayed: boolean }) => ({ data: (value.body as unknown as { data: T }).data, status: value.status, replayed: value.replayed });

  return {
    async listAccounts(userId, query) {
      const where: Prisma.FinanceAccountWhereInput = { user_id: userId, ...(query.archived === "all" ? {} : query.archived ? { archived_at: { not: null } } : { archived_at: null }) };
      const [rows, total] = await Promise.all([
        db.financeAccount.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.financeAccount.count({ where }),
      ]);
      const current = await balances(db, userId, rows);
      return { data: rows.map((row) => accountBase(row, current.get(row.id)!)), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    createAccount: async (userId, input, key) => result<AccountDto>(await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/finance/accounts", requestBody: input }, async (tx) => {
      const timestamp = now();
      const account = await tx.financeAccount.create({ data: { user_id: userId, name: input.name, type: input.type, opening_balance: parseMoney(input.opening_balance), created_at: timestamp, updated_at: timestamp } });
      await tx.financeAccountBalanceChange.create({ data: { user_id: userId, account_id: account.id, account_version: 1, previous_balance: null, new_balance: account.opening_balance, changed_at: timestamp } });
      return { status: 201, body: { data: accountBase(account, account.opening_balance) } as unknown as Prisma.InputJsonObject };
    })),

    getAccount: loadAccountDto.bind(null, db),

    async patchAccount(userId, id, input) {
      return db.$transaction(async (tx) => {
        const current = await ownedAccount(tx, userId, id);
        assertVersion(current.version, input.version);
        if (current.archived_at) throw new FinanceError(409, "RESOURCE_ARCHIVED", "Archived accounts are read-only.");
        const opening = input.opening_balance === undefined ? current.opening_balance : parseMoney(input.opening_balance);
        const next = { name: input.name ?? current.name, type: input.type ?? current.type, opening_balance: opening };
        if (next.name === current.name && next.type === current.type && next.opening_balance === current.opening_balance) return loadAccountDto(tx, userId, id);
        const timestamp = now();
        const changed = await tx.financeAccount.updateMany({ where: { user_id: userId, id, version: input.version }, data: { ...next, version: { increment: 1 }, updated_at: timestamp } });
        if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The account changed. Refresh and try again.");
        if (opening !== current.opening_balance) await tx.financeAccountBalanceChange.create({ data: { user_id: userId, account_id: id, account_version: current.version + 1, previous_balance: current.opening_balance, new_balance: opening, changed_at: timestamp } });
        return loadAccountDto(tx, userId, id);
      });
    },

    async archiveAccount(userId, id, version) {
      return db.$transaction(async (tx) => {
        const current = await ownedAccount(tx, userId, id); assertVersion(current.version, version);
        if (current.archived_at) return loadAccountDto(tx, userId, id);
        const activeRule = await tx.financeRecurrenceRule.findFirst({ where: { user_id: userId, status: "active", OR: [{ account_id: id }, { to_account_id: id }] } });
        if (activeRule) throw new FinanceError(409, "RESOURCE_IN_USE", "Stop active recurrence rules before archiving this account.");
        const changed = await tx.financeAccount.updateMany({ where: { user_id: userId, id, version }, data: { archived_at: now(), version: { increment: 1 } } });
        if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The account changed. Refresh and try again.");
        return loadAccountDto(tx, userId, id);
      });
    },

    async listBalanceChanges(userId, id, query) {
      await ownedAccount(db, userId, id);
      const where = { user_id: userId, account_id: id };
      const [rows, total] = await Promise.all([
        db.financeAccountBalanceChange.findMany({ where, orderBy: [{ account_version: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
        db.financeAccountBalanceChange.count({ where }),
      ]);
      return { data: rows.map(balanceChangeDto), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async listCategories(userId, query) {
      const where: Prisma.FinanceCategoryWhereInput = { user_id: userId, ...(query.type ? { type: query.type } : {}), ...(query.archived === "all" ? {} : query.archived ? { archived_at: { not: null } } : { archived_at: null }) };
      const [rows, total] = await Promise.all([db.financeCategory.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), db.financeCategory.count({ where })]);
      return { data: rows.map(categoryDto), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async createCategory(userId, input, key) {
      try {
        return result<CategoryDto>(await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/finance/categories", requestBody: input }, async (tx) => {
          const category = await tx.financeCategory.create({ data: { user_id: userId, name: input.name, type: input.type } });
          return { status: 201, body: { data: categoryDto(category) } as unknown as Prisma.InputJsonObject };
        }));
      } catch (error) { if (uniqueConflict(error)) throw new FinanceError(409, "CATEGORY_EXISTS", "A category with this name and type already exists."); throw error; }
    },

    getCategory: async (userId, id) => categoryDto(await ownedCategory(db, userId, id)),

    async patchCategory(userId, id, input) {
      try {
        return await db.$transaction(async (tx) => {
          const current = await ownedCategory(tx, userId, id); assertVersion(current.version, input.version);
          if (current.archived_at) throw new FinanceError(409, "RESOURCE_ARCHIVED", "Archived categories are read-only.");
          if (current.name === input.name) return categoryDto(current);
          const changed = await tx.financeCategory.updateMany({ where: { user_id: userId, id, version: input.version }, data: { name: input.name, version: { increment: 1 } } });
          if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The category changed. Refresh and try again.");
          return categoryDto(await ownedCategory(tx, userId, id));
        });
      } catch (error) { if (uniqueConflict(error)) throw new FinanceError(409, "CATEGORY_EXISTS", "A category with this name and type already exists."); throw error; }
    },

    async archiveCategory(userId, id, version) {
      return db.$transaction(async (tx) => {
        const current = await ownedCategory(tx, userId, id); assertVersion(current.version, version);
        if (current.archived_at) return categoryDto(current);
        const activeRule = await tx.financeRecurrenceRule.findFirst({ where: { user_id: userId, category_id: id, status: "active" } });
        if (activeRule) throw new FinanceError(409, "RESOURCE_IN_USE", "Stop active recurrence rules before archiving this category.");
        const changed = await tx.financeCategory.updateMany({ where: { user_id: userId, id, version }, data: { archived_at: now(), version: { increment: 1 } } });
        if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The category changed. Refresh and try again.");
        return categoryDto(await ownedCategory(tx, userId, id));
      });
    },

    async listTransactions(userId, query) {
      const today = await userToday(db, userId, now());
      const from = query.from ?? `${today.slice(0, 8)}01`;
      const to = query.to ?? today;
      const where: Prisma.FinanceTransactionWhereInput = {
        user_id: userId, date: { gte: asDate(from), lte: asDate(to) }, ...(query.type ? { type: query.type } : {}), ...(query.status ? { status: query.status } : {}),
        ...(query.categoryId ? { category_id: query.categoryId } : {}), ...(query.accountId ? { OR: [{ account_id: query.accountId }, { to_account_id: query.accountId }] } : {}),
      };
      const [rows, total] = await Promise.all([db.financeTransaction.findMany({ where, orderBy: [{ date: "desc" }, { created_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), db.financeTransaction.count({ where })]);
      return { data: rows.map(transactionDto), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    createTransaction: async (userId, input, key) => result<TransactionDto>(await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/finance/transactions", requestBody: input }, async (tx) => {
      if (input.status === "posted") await assertPostable(tx, userId, input, now()); else await assertRefs(tx, userId, input, true);
      const timestamp = now();
      const transaction = await tx.financeTransaction.create({ data: {
        user_id: userId, type: input.type, status: input.status, account_id: input.account_id, to_account_id: input.to_account_id ?? null,
        category_id: input.category_id ?? null, amount: parseMoney(input.amount, true), date: asDate(input.date), note: input.note ?? null,
        posted_at: input.status === "posted" ? timestamp : null, created_at: timestamp, updated_at: timestamp,
      } });
      await appendRevision(tx, transaction, "created", timestamp);
      return { status: 201, body: { data: transactionDto(transaction) } as unknown as Prisma.InputJsonObject };
    })),

    getTransaction: async (userId, id) => transactionDto(await ownedTransaction(db, userId, id)),

    async patchTransaction(userId, id, input) {
      return db.$transaction(async (tx) => {
        const current = await ownedTransaction(tx, userId, id); assertVersion(current.version, input.version);
        if (current.status === "void") throw new FinanceError(409, "INVALID_STATE", "Voided transactions are read-only.");
        const currentFields = fieldsOf(current);
        const next: TransactionFields = {
          type: input.type ?? currentFields.type, account_id: input.account_id ?? currentFields.account_id,
          to_account_id: input.to_account_id === undefined ? currentFields.to_account_id : input.to_account_id,
          category_id: input.category_id === undefined ? currentFields.category_id : input.category_id,
          amount: input.amount ?? currentFields.amount, date: input.date ?? currentFields.date, note: input.note === undefined ? currentFields.note : input.note,
        };
        parseMoney(next.amount, true);
        if (current.status === "posted") await assertPostable(tx, userId, next, now()); else await assertRefs(tx, userId, next, true);
        if (sameFields(currentFields, next)) return transactionDto(current);
        const timestamp = now();
        const changed = await tx.financeTransaction.updateMany({ where: { user_id: userId, id, version: input.version }, data: {
          type: next.type, account_id: next.account_id, to_account_id: next.to_account_id ?? null, category_id: next.category_id ?? null,
          amount: parseMoney(next.amount, true), date: asDate(next.date), note: next.note ?? null, version: { increment: 1 }, updated_at: timestamp,
        } });
        if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The transaction changed. Refresh and try again.");
        const updated = await ownedTransaction(tx, userId, id); await appendRevision(tx, updated, "edited", timestamp); return transactionDto(updated);
      });
    },

    postTransaction: async (userId, id, version, key) => result<TransactionDto>(await executeIdempotent({ userId, key, method: "POST", route: `/api/v1/finance/transactions/${id}/post`, requestBody: { version } }, async (tx) => {
      const current = await ownedTransaction(tx, userId, id); assertVersion(current.version, version);
      if (current.status === "void") throw new FinanceError(409, "INVALID_STATE", "Voided transactions cannot be posted.");
      if (current.status === "posted") return { status: 200, body: { data: transactionDto(current) } as unknown as Prisma.InputJsonObject };
      await assertPostable(tx, userId, fieldsOf(current), now());
      const timestamp = now();
      const changed = await tx.financeTransaction.updateMany({ where: { user_id: userId, id, version }, data: { status: "posted", posted_at: timestamp, version: { increment: 1 }, updated_at: timestamp } });
      if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The transaction changed. Refresh and try again.");
      const updated = await ownedTransaction(tx, userId, id); await appendRevision(tx, updated, "posted", timestamp);
      return { status: 200, body: { data: transactionDto(updated) } as unknown as Prisma.InputJsonObject };
    })),

    async voidTransaction(userId, id, version) {
      return db.$transaction(async (tx) => {
        const current = await ownedTransaction(tx, userId, id); assertVersion(current.version, version);
        if (current.status === "void") return transactionDto(current);
        const timestamp = now();
        const changed = await tx.financeTransaction.updateMany({ where: { user_id: userId, id, version }, data: { status: "void", voided_at: timestamp, version: { increment: 1 }, updated_at: timestamp } });
        if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The transaction changed. Refresh and try again.");
        const updated = await ownedTransaction(tx, userId, id); await appendRevision(tx, updated, "voided", timestamp); return transactionDto(updated);
      });
    },

    async listRevisions(userId, id, query) {
      await ownedTransaction(db, userId, id);
      const where = { user_id: userId, transaction_id: id };
      const [rows, total] = await Promise.all([db.financeTransactionRevision.findMany({ where, orderBy: [{ transaction_version: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), db.financeTransactionRevision.count({ where })]);
      return { data: rows.map(revisionDto), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async listBudgets(userId, month, query) {
      const selectedMonth = month ?? `${(await userToday(db, userId, now())).slice(0, 7)}-01`;
      const where = { user_id: userId, month: asDate(selectedMonth) };
      const [rows, total] = await Promise.all([db.budget.findMany({ where, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), db.budget.count({ where })]);
      return { data: await Promise.all(rows.map((row) => budgetDto(db, row))), meta: { page: query.page, page_size: query.pageSize, total } };
    },

    async createBudget(userId, input, key) {
      try {
        return result<BudgetDto>(await executeIdempotent({ userId, key, method: "POST", route: "/api/v1/finance/budgets", requestBody: input }, async (tx) => {
          const category = await ownedCategory(tx, userId, input.category_id);
          if (category.type !== "expense" || category.archived_at) throw new FinanceError(409, "INVALID_CATEGORY", "Budgets require an active expense category.");
          const budget = await tx.budget.create({ data: { user_id: userId, category_id: input.category_id, month: asDate(input.month), limit_amount: parseMoney(input.limit_amount, true) } });
          return { status: 201, body: { data: await budgetDto(tx, budget) } as unknown as Prisma.InputJsonObject };
        }));
      } catch (error) { if (uniqueConflict(error)) throw new FinanceError(409, "BUDGET_EXISTS", "A budget already exists for this category and month."); throw error; }
    },

    getBudget: async (userId, id) => budgetDto(db, await ownedBudget(db, userId, id)),

    async patchBudget(userId, id, input) {
      return db.$transaction(async (tx) => {
        const current = await ownedBudget(tx, userId, id); assertVersion(current.version, input.version);
        await ownedCategory(tx, userId, current.category_id).then((category) => { if (category.archived_at) throw new FinanceError(409, "RESOURCE_ARCHIVED", "The budget category is archived."); });
        const limit = parseMoney(input.limit_amount, true);
        if (limit === current.limit_amount) return budgetDto(tx, current);
        const changed = await tx.budget.updateMany({ where: { user_id: userId, id, version: input.version }, data: { limit_amount: limit, version: { increment: 1 } } });
        if (changed.count !== 1) throw new FinanceError(409, "VERSION_CONFLICT", "The budget changed. Refresh and try again.");
        return budgetDto(tx, await ownedBudget(tx, userId, id));
      });
    },

    async deleteBudget(userId, id, version) {
      await db.$transaction(async (tx) => { const current = await ownedBudget(tx, userId, id); assertVersion(current.version, version); await tx.budget.delete({ where: { id } }); });
    },
  };
}
