import type { TransactionDto, TransactionFields } from "../finance/types.js";
import type { Page, TaskDto, TaskPriority } from "../work/types.js";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";
export type RecurrenceStatus = "active" | "stopped" | "expired";
export type RecurrenceRevisionAction = "created" | "edited" | "stopped";

export type RuleMeta = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  frequency: RecurrenceFrequency;
  interval: number;
  start_date: string;
  end_date: string | null;
  timezone: string;
  status: RecurrenceStatus;
  next_date: string | null;
  last_generated_date: string | null;
  processing_updated_at: string | null;
  blocked_reason: string | null;
};

export type TaskRuleDto = RuleMeta & {
  title: string;
  description: string | null;
  project_id: string | null;
  priority: TaskPriority;
};

export type FinanceRuleFields = Omit<TransactionFields, "date">;

export type FinanceRuleDto = RuleMeta & FinanceRuleFields;

export type RuleRevisionDto = {
  id: string;
  rule_id: string;
  rule_version: number;
  action: RecurrenceRevisionAction;
  snapshot: Record<string, unknown>;
  effective_after: string | null;
  changed_at: string;
};

export type DependencyDto = {
  task_id: string;
  predecessor_id: string;
  predecessor_status: "todo" | "in_progress" | "done";
  predecessor_title: string;
  created_at: string;
};

export type TaskRuleInput = {
  title: string;
  description?: string | null;
  project_id?: string | null;
  priority?: TaskPriority;
  frequency: RecurrenceFrequency;
  interval?: number;
  start_date: string;
  end_date?: string | null;
};

export type TaskRulePatch = {
  version: number;
  title?: string;
  description?: string | null;
  project_id?: string | null;
  priority?: TaskPriority;
  frequency?: RecurrenceFrequency;
  interval?: number;
  end_date?: string | null;
};

export type FinanceRuleInput = FinanceRuleFields & {
  frequency: RecurrenceFrequency;
  interval?: number;
  start_date: string;
  end_date?: string | null;
};

export type FinanceRulePatch = {
  version: number;
  type?: "income" | "expense" | "transfer";
  account_id?: string;
  to_account_id?: string | null;
  category_id?: string | null;
  amount?: string;
  note?: string | null;
  frequency?: RecurrenceFrequency;
  interval?: number;
  end_date?: string | null;
};

export type Mutation<T> = { data: T; status: number; replayed: boolean };

export interface M4Service {
  listTaskRules(userId: string, status: RecurrenceStatus | "all", page: number, pageSize: number): Promise<Page<TaskRuleDto>>;
  createTaskRule(userId: string, input: TaskRuleInput, key: string): Promise<Mutation<TaskRuleDto>>;
  getTaskRule(userId: string, id: string): Promise<TaskRuleDto>;
  patchTaskRule(userId: string, id: string, input: TaskRulePatch): Promise<TaskRuleDto>;
  stopTaskRule(userId: string, id: string, version: number): Promise<TaskRuleDto>;
  listTaskOccurrences(userId: string, id: string, from: string, to: string, page: number, pageSize: number): Promise<Page<TaskDto>>;
  listTaskRuleRevisions(userId: string, id: string, page: number, pageSize: number): Promise<Page<RuleRevisionDto>>;
  listDependencies(userId: string, taskId: string, page: number, pageSize: number): Promise<Page<DependencyDto>>;
  setDependency(userId: string, taskId: string, predecessorId: string): Promise<DependencyDto>;
  deleteDependency(userId: string, taskId: string, predecessorId: string): Promise<void>;
  listFinanceRules(userId: string, status: RecurrenceStatus | "all", page: number, pageSize: number): Promise<Page<FinanceRuleDto>>;
  createFinanceRule(userId: string, input: FinanceRuleInput, key: string): Promise<Mutation<FinanceRuleDto>>;
  getFinanceRule(userId: string, id: string): Promise<FinanceRuleDto>;
  patchFinanceRule(userId: string, id: string, input: FinanceRulePatch): Promise<FinanceRuleDto>;
  stopFinanceRule(userId: string, id: string, version: number): Promise<FinanceRuleDto>;
  listFinanceOccurrences(userId: string, id: string, from: string, to: string, page: number, pageSize: number): Promise<Page<TransactionDto>>;
  listFinanceRuleRevisions(userId: string, id: string, page: number, pageSize: number): Promise<Page<RuleRevisionDto>>;
  processDueRules(limit?: number): Promise<{ taskOccurrences: number; financeOccurrences: number }>;
}

export class M4Error extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "M4Error";
  }
}
