export type Page<T> = { data: T[]; meta: { page: number; page_size: number; total: number } };
export type Idempotent<T> = { data: T; status: number; replayed: boolean };

export type AccountType = "cash" | "bank" | "ewallet";
export type CategoryType = "income" | "expense";
export type TransactionType = "income" | "expense" | "transfer";
export type TransactionStatus = "draft" | "posted" | "void";

export type AccountDto = {
  id: string; version: number; created_at: string; updated_at: string; name: string; type: AccountType;
  opening_balance: string; balance: string; archived_at: string | null;
};
export type BalanceChangeDto = {
  id: string; account_id: string; account_version: number; previous_balance: string | null; new_balance: string; changed_at: string;
};
export type CategoryDto = {
  id: string; version: number; created_at: string; updated_at: string; name: string; type: CategoryType; archived_at: string | null;
};
export type TransactionDto = {
  id: string; version: number; created_at: string; updated_at: string; type: TransactionType; status: TransactionStatus;
  account_id: string; to_account_id: string | null; category_id: string | null; amount: string; date: string; note: string | null;
  posted_at: string | null; voided_at: string | null; recurrence_rule_id: string | null; occurrence_date: string | null; rule_version: number | null;
};
export type RevisionSnapshot = Omit<TransactionDto, "created_at" | "updated_at">;
export type RevisionDto = {
  id: string; transaction_id: string; transaction_version: number; action: "created" | "edited" | "posted" | "voided";
  snapshot: RevisionSnapshot; changed_at: string;
};
export type BudgetDto = {
  id: string; version: number; created_at: string; updated_at: string; category_id: string; month: string;
  limit_amount: string; spent: string; remaining: string;
};

export type PageQuery = { page: number; pageSize: number };
export type AccountListQuery = PageQuery & { archived: boolean | "all" };
export type CategoryListQuery = PageQuery & { archived: boolean | "all"; type?: CategoryType };
export type TransactionListQuery = PageQuery & {
  from?: string; to?: string; accountId?: string; categoryId?: string; type?: TransactionType; status?: TransactionStatus;
};

export type CreateAccountInput = { name: string; type: AccountType; opening_balance: string };
export type PatchAccountInput = { version: number; name?: string; type?: AccountType; opening_balance?: string };
export type CreateCategoryInput = { name: string; type: CategoryType };
export type PatchCategoryInput = { version: number; name: string };
export type TransactionFields = {
  type: TransactionType; account_id: string; to_account_id?: string | null; category_id?: string | null; amount: string; date: string; note?: string | null;
};
export type CreateTransactionInput = TransactionFields & { status: "draft" | "posted" };
export type PatchTransactionInput = { version: number } & Partial<TransactionFields>;
export type CreateBudgetInput = { category_id: string; month: string; limit_amount: string };
export type PatchBudgetInput = { version: number; limit_amount: string };

export class FinanceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export interface M3Service {
  listAccounts(userId: string, query: AccountListQuery): Promise<Page<AccountDto>>;
  createAccount(userId: string, input: CreateAccountInput, key: string): Promise<Idempotent<AccountDto>>;
  getAccount(userId: string, id: string): Promise<AccountDto>;
  patchAccount(userId: string, id: string, input: PatchAccountInput): Promise<AccountDto>;
  archiveAccount(userId: string, id: string, version: number): Promise<AccountDto>;
  listBalanceChanges(userId: string, id: string, query: PageQuery): Promise<Page<BalanceChangeDto>>;
  listCategories(userId: string, query: CategoryListQuery): Promise<Page<CategoryDto>>;
  createCategory(userId: string, input: CreateCategoryInput, key: string): Promise<Idempotent<CategoryDto>>;
  getCategory(userId: string, id: string): Promise<CategoryDto>;
  patchCategory(userId: string, id: string, input: PatchCategoryInput): Promise<CategoryDto>;
  archiveCategory(userId: string, id: string, version: number): Promise<CategoryDto>;
  listTransactions(userId: string, query: TransactionListQuery): Promise<Page<TransactionDto>>;
  createTransaction(userId: string, input: CreateTransactionInput, key: string): Promise<Idempotent<TransactionDto>>;
  getTransaction(userId: string, id: string): Promise<TransactionDto>;
  patchTransaction(userId: string, id: string, input: PatchTransactionInput): Promise<TransactionDto>;
  postTransaction(userId: string, id: string, version: number, key: string): Promise<Idempotent<TransactionDto>>;
  voidTransaction(userId: string, id: string, version: number): Promise<TransactionDto>;
  listRevisions(userId: string, id: string, query: PageQuery): Promise<Page<RevisionDto>>;
  listBudgets(userId: string, month: string | undefined, query: PageQuery): Promise<Page<BudgetDto>>;
  createBudget(userId: string, input: CreateBudgetInput, key: string): Promise<Idempotent<BudgetDto>>;
  getBudget(userId: string, id: string): Promise<BudgetDto>;
  patchBudget(userId: string, id: string, input: PatchBudgetInput): Promise<BudgetDto>;
  deleteBudget(userId: string, id: string, version: number): Promise<void>;
}
