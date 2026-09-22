import { useEffect, useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import ReportPanel from "@/components/ReportPanel";
import { IconPlus, IconWallet } from "@/components/icons";
import {
  TrackerApiError, archiveFinanceAccount, archiveFinanceCategory, createFinanceAccount, createFinanceBudget, createFinanceCategory,
  createFinanceRule, createFinanceTransaction, deleteFinanceBudget, listFinanceAccounts, listFinanceBalanceChanges, listFinanceBudgets, listFinanceCategories,
  listFinanceRuleOccurrences, listFinanceRuleRevisions, listFinanceRevisions, listFinanceRules, listFinanceTransactions, patchFinanceAccount, patchFinanceBudget, patchFinanceRule, patchFinanceTransaction, postFinanceTransaction, stopFinanceRule, voidFinanceTransaction,
  type FinanceRevisionDto, type FinanceRuleDto, type RuleRevisionDto,
} from "@/lib/api";

type AcctType = "cash" | "bank" | "ewallet";
type TxType = "income" | "expense" | "transfer";
type TxStatus = "draft" | "posted" | "void";
type CatType = "income" | "expense";
type FinTab = "accounts" | "transactions" | "budgets";

type OpeningChange = { from: bigint | null; to: bigint; date: string };
type Account = { id: string; version: number; name: string; type: AcctType; opening: bigint; balance: bigint; archived: boolean; openingHistory: OpeningChange[] };
type Category = { id: string; version: number; name: string; type: CatType; archived: boolean };
type Revision = { action: "created" | "edited" | "posted" | "voided"; at: string };
type Transaction = {
  id: string;
  version: number;
  type: TxType;
  status: TxStatus;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  amount: bigint;
  date: string; // YYYY-MM-DD
  note?: string;
  fromRecurring?: boolean;
  revisions: Revision[];
};
type Budget = { id: string; version: number; categoryId: string; limit: bigint; spent: bigint; remaining: bigint };

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const MONTH = TODAY.slice(0, 7);
const MONTH_START = `${MONTH}-01`;
const ACCT_TYPE_LABEL: Record<AcctType, string> = { cash: "Cash", bank: "Bank", ewallet: "E-wallet" };

function rp(n: bigint) {
  return `Rp ${n.toLocaleString("en-US")}`;
}
function digits(v: string) {
  return v.replace(/[^0-9]/g, "");
}
function fmtDateLong(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}
function fmtRevTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

function recurrenceLabel(frequency: "daily" | "weekly" | "monthly", interval: number) {
  const singular = { daily: "day", weekly: "week", monthly: "month" }[frequency];
  return `Every ${interval === 1 ? "" : `${interval} `}${singular}${interval === 1 ? "" : "s"}`;
}


function AcctIcon({ type }: { type: AcctType }) {
  if (type === "ewallet")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    );
  if (type === "cash")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function LedIcon({ type }: { type: TxType }) {
  if (type === "income")
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 17H7V7" />
        <path d="M17 7 7 17" />
      </svg>
    );
  if (type === "transfer")
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m17 2 4 4-4 4" />
        <path d="M3 6h18" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 18H3" />
      </svg>
    );
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}

function AmountInput({ id, value, onChange, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="fin-amount-field">
      <span className="cur">Rp</span>
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input id={id} className="input" inputMode="numeric" autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
    </div>
  );
}

function AccountForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: { name: string; type: AcctType; opening: string }) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AcctType>("bank");
  const [opening, setOpening] = useState("0");
  const [error, setError] = useState<string | undefined>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("A name is required.");
      return;
    }
    onSave({ name: name.trim(), type, opening: digits(opening) || "0" });
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="na-name">
          Name <span className="req">*</span>
        </label>
        <input id="na-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. BCA" aria-invalid={!!error} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="na-type">Type</label>
          <select id="na-type" className="input" value={type} onChange={(e) => setType(e.target.value as AcctType)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="ewallet">E-wallet</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="na-open">Opening balance</label>
          <AmountInput id="na-open" value={opening} onChange={setOpening} />
        </div>
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        All accounts are in IDR. The balance is then computed from the transactions you post.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create account
        </button>
      </div>
    </form>
  );
}

function OpeningBalanceForm({ account, onCancel, onSave }: { account: Account; onCancel: () => void; onSave: (newOpening: string) => void }) {
  const [amount, setAmount] = useState(String(account.opening));
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(digits(amount) || "0");
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className="field" style={{ marginBottom: 6 }}>
        <label htmlFor="ob-amount">Opening balance</label>
        <AmountInput id="ob-amount" value={amount} onChange={setAmount} autoFocus />
      </div>
      <p className="field-hint">
        Current opening balance: {rp(account.opening)}. This is not income, so it never appears in your income or expense totals; it only shifts this account&apos;s balance.
      </p>
      <div className="detail-section">
        <label>Change history</label>
        {account.openingHistory.map((h, i) => (
          <div className="detail-hist-row" key={i}>
            <span className="dh-k">{h.from === null ? "Set at account creation" : `${rp(h.from)} to ${rp(h.to)}`}</span>
            <span className="tnum">{fmtDateLong(h.date)}</span>
          </div>
        ))}
        <p className="field-hint" style={{ marginTop: 8 }}>
          Each correction is kept as its own entry, not written over the last one.
        </p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save correction
        </button>
      </div>
    </form>
  );
}

function TransactionForm({ accounts, categories, initial, onCancel, onSave }: { accounts: Account[]; categories: Category[]; initial?: Transaction; onCancel: () => void; onSave: (input: { type: "income" | "expense"; accountId: string; categoryId: string; amount: string; date: string; note?: string }) => void }) {
  const active = accounts.filter((a) => !a.archived);
  const [type, setType] = useState<"income" | "expense">(initial?.type === "income" ? "income" : "expense");
  const [accountId, setAccountId] = useState(initial?.accountId ?? active[0]?.id ?? "");
  const [amount, setAmount] = useState(initial?.amount.toString() ?? "");
  const cats = categories.filter((c) => c.type === type && !c.archived);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? cats[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? TODAY);
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | undefined>();

  function changeType(next: "income" | "expense") {
    setType(next);
    const first = categories.find((c) => c.type === next && !c.archived);
    setCategoryId(first?.id ?? "");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!digits(amount) || BigInt(digits(amount)) <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    onSave({ type, accountId, categoryId, amount: digits(amount), date, note: note.trim() || undefined });
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Type</label>
        <div className="seg" role="tablist" aria-label="Transaction type">
          <button type="button" role="tab" aria-selected={type === "expense"} onClick={() => changeType("expense")}>
            Expense
          </button>
          <button type="button" role="tab" aria-selected={type === "income"} onClick={() => changeType("income")}>
            Income
          </button>
        </div>
        <span className="field-hint">Moving money between your own accounts? Use Transfer instead.</span>
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="ntx-account">Account</label>
        <select id="ntx-account" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="ntx-amount">Amount</label>
          <AmountInput id="ntx-amount" value={amount} onChange={setAmount} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="ntx-cat">Category</label>
          <select id="ntx-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="ntx-date">Date</label>
          <input id="ntx-date" type="date" className="input" value={date} max={TODAY} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="ntx-note">Note (optional)</label>
          <input id="ntx-note" className="input" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. lunch" />
        </div>
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        The date can&apos;t be in the future. Saving posts the transaction and updates your balance.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save transaction
        </button>
      </div>
    </form>
  );
}

function FinanceRuleForm({ rule, accounts, categories, onCancel, onSave }: { rule?: FinanceRuleDto; accounts: Account[]; categories: Category[]; onCancel: () => void; onSave: (value: { type: TxType; account_id: string; to_account_id: string | null; category_id: string | null; amount: string; note: string | null; frequency: "daily" | "weekly" | "monthly"; interval: number; start_date: string; end_date: string | null }) => Promise<void> }) {
  const activeAccounts = accounts.filter((account) => !account.archived);
  const [type, setType] = useState<TxType>(rule?.type ?? "expense");
  const [accountId, setAccountId] = useState(rule?.account_id ?? activeAccounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(rule?.to_account_id ?? activeAccounts.find((account) => account.id !== rule?.account_id)?.id ?? "");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
  const [amount, setAmount] = useState(rule?.amount ?? "");
  const [note, setNote] = useState(rule?.note ?? "");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">(rule?.frequency ?? "monthly");
  const [interval, setInterval] = useState(String(rule?.interval ?? 1));
  const [startDate, setStartDate] = useState(rule?.start_date ?? TODAY);
  const [endDate, setEndDate] = useState(rule?.end_date ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const visibleCategories = categories.filter((category) => category.type === type && !category.archived);

  function changeType(next: TxType) {
    setType(next);
    if (next === "transfer") { setCategoryId(""); return; }
    setCategoryId(categories.find((category) => category.type === next && !category.archived)?.id ?? "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const every = Number(interval);
    if (!accountId) return setError("Choose an account.");
    if (!digits(amount) || BigInt(digits(amount)) <= 0n) return setError("Enter an amount greater than zero.");
    if (type === "transfer" && (!toAccountId || toAccountId === accountId)) return setError("Choose a different destination account.");
    if (type !== "transfer" && !categoryId) return setError("Choose a category.");
    if (!Number.isInteger(every) || every < 1 || every > 365) return setError("Interval must be between 1 and 365.");
    if (!startDate) return setError("Start date is required.");
    if (endDate && endDate < startDate) return setError("End date cannot be before the start date.");
    setSaving(true); setError("");
    try { await onSave({ type, account_id: accountId, to_account_id: type === "transfer" ? toAccountId : null, category_id: type === "transfer" ? null : categoryId, amount: digits(amount), note: note.trim() || null, frequency, interval: every, start_date: startDate, end_date: endDate || null }); }
    catch (cause) { setError(cause instanceof TrackerApiError ? cause.message : "Finance could not complete the request."); setSaving(false); }
  }
  return <form onSubmit={submit} noValidate>
    {error && <div className="form-alert error" role="alert">{error}</div>}
    <div className="field"><label htmlFor="finance-rule-type">Type</label><select id="finance-rule-type" className="input" value={type} onChange={(event) => changeType(event.target.value as TxType)}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select></div>
    <div className="field"><label htmlFor="finance-rule-account">{type === "transfer" ? "From account" : "Account"}</label><select id="finance-rule-account" className="input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
    {type === "transfer" ? <div className="field"><label htmlFor="finance-rule-to-account">To account</label><select id="finance-rule-to-account" className="input" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>{activeAccounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div> : <div className="field"><label htmlFor="finance-rule-category">Category</label><select id="finance-rule-category" className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{visibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>}
    <div style={{ display: "flex", gap: 12 }}><div className="field" style={{ flex: 1 }}><label htmlFor="finance-rule-amount">Amount</label><AmountInput id="finance-rule-amount" value={amount} onChange={setAmount} /></div><div className="field" style={{ flex: 1 }}><label htmlFor="finance-rule-note">Note</label><input id="finance-rule-note" className="input" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></div></div>
    <div style={{ display: "flex", gap: 12 }}><div className="field" style={{ flex: 1 }}><label htmlFor="finance-rule-frequency">Repeats</label><select id="finance-rule-frequency" className="input" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><div className="field" style={{ flex: 1 }}><label htmlFor="finance-rule-interval">Every</label><input id="finance-rule-interval" className="input" type="number" min="1" max="365" value={interval} onChange={(event) => setInterval(event.target.value)} /></div></div>
    <div style={{ display: "flex", gap: 12 }}><div className="field" style={{ flex: 1 }}><label htmlFor="finance-rule-start">Start date</label><input id="finance-rule-start" className="input" type="date" value={startDate} disabled={Boolean(rule)} onChange={(event) => setStartDate(event.target.value)} /></div><div className="field" style={{ flex: 1 }}><label htmlFor="finance-rule-end">End date</label><input id="finance-rule-end" className="input" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></div>
    <p className="field-hint">Each due occurrence is created as a draft so you can check it before it changes a balance.</p>
    <div className="modal-foot"><button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : rule ? "Save rule" : "Create rule"}</button></div>
  </form>;
}

function TransferForm({ accounts, balanceOf, initial, onCancel, onSave }: { accounts: Account[]; balanceOf: (id: string) => bigint; initial?: Transaction; onCancel: () => void; onSave: (input: { fromId: string; toId: string; amount: string }) => void }) {
  const active = accounts.filter((a) => !a.archived);
  const [fromId, setFromId] = useState(initial?.accountId ?? active[0]?.id ?? "");
  const [toId, setToId] = useState(initial?.toAccountId ?? active[1]?.id ?? active[0]?.id ?? "");
  const [amount, setAmount] = useState(initial?.amount.toString() ?? "500000");
  const [error, setError] = useState<string | undefined>();

  const amt = BigInt(digits(amount) || "0");
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const same = fromId === toId;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (same) {
      setError("The source and destination must be different accounts.");
      return;
    }
    if (amt <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    onSave({ fromId, toId, amount: amt.toString() });
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="tr-from">From</label>
          <select id="tr-from" className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="tr-to">To</label>
          <select id="tr-to" className="input" value={toId} onChange={(e) => setToId(e.target.value)} aria-invalid={same}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="tr-amount">Amount</label>
        <AmountInput id="tr-amount" value={amount} onChange={setAmount} />
      </div>
      {from && to && !same && (
        <div className="fin-effect">
          <div className="fin-effect-label">Effect on both accounts, before you confirm</div>
          <div className="fin-effect-row">
            <span className="er-name">{from.name}</span>
            <span className="er-val">
              {rp(balanceOf(from.id))} to <b>{rp(balanceOf(from.id) - amt)}</b>
            </span>
          </div>
          <div className="fin-effect-row">
            <span className="er-name">{to.name}</span>
            <span className="er-val">
              {rp(balanceOf(to.id))} to <b>{rp(balanceOf(to.id) + amt)}</b>
            </span>
          </div>
        </div>
      )}
      <p className="field-hint" style={{ marginTop: 10 }}>
        A transfer is one record with two balance effects. It never appears in income or expense reports.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Confirm transfer
        </button>
      </div>
    </form>
  );
}

function BudgetForm({ options, onCancel, onSave }: { options: Category[]; onCancel: () => void; onSave: (input: { categoryId: string; limit: string }) => void }) {
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? "");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | undefined>();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!digits(limit) || BigInt(digits(limit)) <= 0n) {
      setError("Enter a limit greater than zero.");
      return;
    }
    onSave({ categoryId, limit: digits(limit) });
  }
  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="form-alert error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="nb-cat">Expense category</label>
        <select id="nb-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 4 }}>
        <label htmlFor="nb-limit">Monthly limit</label>
        <AmountInput id="nb-limit" value={limit} onChange={setLimit} />
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        One budget per expense category per month. Actuals come from your posted expenses in that month.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save budget
        </button>
      </div>
    </form>
  );
}

function BudgetLimitForm({ budget, category, onCancel, onSave }: { budget: Budget; category?: Category; onCancel: () => void; onSave: (limit: string) => void }) {
  const [limit, setLimit] = useState(budget.limit.toString());
  const [error, setError] = useState<string>();
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = digits(limit);
    if (!value || BigInt(value) <= 0n) return setError("Enter a limit greater than zero.");
    onSave(value);
  }
  return <form onSubmit={submit} noValidate>
    {error && <div className="form-alert error" role="alert">{error}</div>}
    <p className="field-hint">{category?.name ?? "Expense category"}, {new Date(`${MONTH_START}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
    <div className="field"><label htmlFor="edit-budget-limit">Monthly limit</label><AmountInput id="edit-budget-limit" value={limit} onChange={setLimit} /></div>
    <div className="modal-foot"><button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary">Save limit</button></div>
  </form>;
}

function CategoryForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: { name: string; type: CatType }) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CatType>("expense");
  const [error, setError] = useState<string>();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("A name is required.");
    onSave({ name: name.trim(), type });
  }
  return (
    <form onSubmit={submit} noValidate>
      {error && <div className="form-alert error" role="alert">{error}</div>}
      <div className="field" style={{ marginBottom: 14 }}>
        <label htmlFor="category-name">Name</label>
        <input id="category-name" className="input" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="category-type">Type</label>
        <select id="category-type" className="input" value={type} onChange={(event) => setType(event.target.value as CatType)}>
          <option value="expense">Expense</option><option value="income">Income</option>
        </select>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Create category</button>
      </div>
    </form>
  );
}

export default function FinancePage() {
  const [tab, setTab] = useState<FinTab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>();

  const [addingAccount, setAddingAccount] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [addingTx, setAddingTx] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [ruleMode, setRuleMode] = useState<"list" | "create" | "edit" | "detail" | null>(null);
  const [rules, setRules] = useState<FinanceRuleDto[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [ruleOccurrences, setRuleOccurrences] = useState<Array<{ id: string; date: string; status: TxStatus; amount: string }>>([]);
  const [ruleRevisions, setRuleRevisions] = useState<RuleRevisionDto[]>([]);
  const [ruleDetailLoading, setRuleDetailLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingBudget, setAddingBudget] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");

  function messageOf(error: unknown) {
    return error instanceof TrackerApiError ? error.message : "Finance could not complete the request.";
  }

  async function refresh() {
    const [accountPage, categoryPage, transactionPage, budgetPage] = await Promise.all([
      listFinanceAccounts(), listFinanceCategories(), listFinanceTransactions(MONTH_START, TODAY), listFinanceBudgets(MONTH_START),
    ]);
    const mappedAccounts = await Promise.all(accountPage.data.map(async (account) => {
      const history = await listFinanceBalanceChanges(account.id);
      return {
        id: account.id, version: account.version, name: account.name, type: account.type, opening: BigInt(account.opening_balance), balance: BigInt(account.balance), archived: account.archived_at !== null,
        openingHistory: history.data.map((change) => ({ from: change.previous_balance === null ? null : BigInt(change.previous_balance), to: BigInt(change.new_balance), date: change.changed_at.slice(0, 10) })),
      } satisfies Account;
    }));
    setAccounts(mappedAccounts);
    setCategories(categoryPage.data.map((category) => ({ id: category.id, version: category.version, name: category.name, type: category.type, archived: category.archived_at !== null })));
    setTransactions(transactionPage.data.map((transaction) => ({
      id: transaction.id, version: transaction.version, type: transaction.type, status: transaction.status, accountId: transaction.account_id,
      toAccountId: transaction.to_account_id ?? undefined, categoryId: transaction.category_id ?? undefined, amount: BigInt(transaction.amount),
      date: transaction.date, note: transaction.note ?? undefined, fromRecurring: transaction.recurrence_rule_id !== null, revisions: [],
    })));
    setBudgets(budgetPage.data.map((budget) => ({ id: budget.id, version: budget.version, categoryId: budget.category_id, limit: BigInt(budget.limit_amount), spent: BigInt(budget.spent), remaining: BigInt(budget.remaining) })));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().catch((error) => active && setErrorMessage(messageOf(error))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  function accountById(id?: string) {
    return accounts.find((a) => a.id === id);
  }
  function categoryById(id?: string) {
    return categories.find((c) => c.id === id);
  }

  function balanceOf(accId: string) {
    return accountById(accId)?.balance ?? 0n;
  }

  const activeAccounts = accounts.filter((a) => !a.archived);
  const totalActive = activeAccounts.reduce((sum, a) => sum + balanceOf(a.id), 0n);
  const monthIn = transactions.filter((t) => t.status === "posted" && t.type === "income" && t.date.startsWith(MONTH)).reduce((s, t) => s + t.amount, 0n);
  const monthOut = transactions.filter((t) => t.status === "posted" && t.type === "expense" && t.date.startsWith(MONTH)).reduce((s, t) => s + t.amount, 0n);

  function budgetActual(categoryId: string) {
    return budgets.find((budget) => budget.categoryId === categoryId)?.spent ?? 0n;
  }

  const filteredTx = useMemo(() => {
    return transactions
      .filter((t) => (accountFilter === "all" ? true : t.accountId === accountFilter || t.toAccountId === accountFilter))
      .filter((t) => (typeFilter === "all" ? true : t.type === typeFilter))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, accountFilter, typeFilter]);

  const txByDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of filteredTx) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date)!.push(t);
    }
    return Array.from(groups.entries());
  }, [filteredTx]);

  const detailTx = transactions.find((t) => t.id === detailId) ?? null;

  async function complete(action: () => Promise<void>) {
    setErrorMessage(undefined);
    try { await action(); await refresh(); } catch (error) { setErrorMessage(messageOf(error)); }
  }

  async function addAccount(input: { name: string; type: AcctType; opening: string }) {
    await complete(async () => { await createFinanceAccount({ name: input.name, type: input.type, opening_balance: input.opening }); setAddingAccount(false); });
  }
  async function correctOpening(accId: string, newOpening: string) {
    const account = accountById(accId); if (!account) return;
    await complete(async () => { await patchFinanceAccount(accId, { version: account.version, opening_balance: newOpening }); setCorrectingId(null); });
  }
  async function toggleAccountArchived(accId: string) {
    const account = accountById(accId); if (!account || account.archived) return;
    await complete(async () => { await archiveFinanceAccount(accId, account.version); });
  }
  async function toggleCategoryArchived(catId: string) {
    const category = categoryById(catId); if (!category || category.archived) return;
    await complete(async () => { await archiveFinanceCategory(catId, category.version); });
  }
  async function addCategory(input: { name: string; type: CatType }) {
    await complete(async () => { await createFinanceCategory(input); setAddingCategory(false); });
  }
  async function addTransaction(input: { type: "income" | "expense"; accountId: string; categoryId: string; amount: string; date: string; note?: string }) {
    await complete(async () => { await createFinanceTransaction({ type: input.type, status: "posted", account_id: input.accountId, category_id: input.categoryId, amount: input.amount, date: input.date, note: input.note }); setAddingTx(false); });
  }
  async function addTransfer(input: { fromId: string; toId: string; amount: string }) {
    await complete(async () => { await createFinanceTransaction({ type: "transfer", status: "posted", account_id: input.fromId, to_account_id: input.toId, category_id: null, amount: input.amount, date: TODAY }); setTransferring(false); });
  }
  async function correctTransaction(input: { type: "income" | "expense"; accountId: string; categoryId: string; amount: string; date: string; note?: string }) {
    const transaction = transactions.find((item) => item.id === editingId); if (!transaction) return;
    await complete(async () => {
      await patchFinanceTransaction(transaction.id, { version: transaction.version, type: input.type, account_id: input.accountId, to_account_id: null, category_id: input.categoryId, amount: input.amount, date: input.date, note: input.note ?? null });
      setEditingId(null); setDetailId(null);
    });
  }
  async function correctTransfer(input: { fromId: string; toId: string; amount: string }) {
    const transaction = transactions.find((item) => item.id === editingId && item.type === "transfer"); if (!transaction) return;
    await complete(async () => {
      await patchFinanceTransaction(transaction.id, { version: transaction.version, type: "transfer", account_id: input.fromId, to_account_id: input.toId, category_id: null, amount: input.amount, date: transaction.date, note: transaction.note ?? null });
      setEditingId(null); setDetailId(null);
    });
  }
  async function voidTransaction(id: string) {
    const transaction = transactions.find((item) => item.id === id); if (!transaction) return;
    await complete(async () => { await voidFinanceTransaction(id, transaction.version); setVoidConfirm(false); setDetailId(null); });
  }
  async function confirmDraft(id: string) {
    const transaction = transactions.find((item) => item.id === id); if (!transaction) return;
    await complete(async () => { await postFinanceTransaction(id, transaction.version); });
  }
  async function cancelDraft(id: string) { await voidTransaction(id); }
  async function addBudget(input: { categoryId: string; limit: string }) {
    await complete(async () => { await createFinanceBudget({ category_id: input.categoryId, month: MONTH_START, limit_amount: input.limit }); setAddingBudget(false); });
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setVoidConfirm(false);
    try {
      const revisions = await listFinanceRevisions(id);
      setTransactions((current) => current.map((transaction) => transaction.id === id ? { ...transaction, revisions: revisions.data.map((revision: FinanceRevisionDto) => ({ action: revision.action, at: revision.changed_at })) } : transaction));
    } catch (error) { setErrorMessage(messageOf(error)); }
  }
  async function correctBudget(limit: string) {
    const budget = budgets.find((item) => item.id === editingBudgetId); if (!budget) return;
    await complete(async () => { await patchFinanceBudget(budget.id, budget.version, limit); setEditingBudgetId(null); });
  }

  async function openRules() {
    setRuleMode("list"); setRulesLoading(true); setRulesError("");
    try { setRules((await listFinanceRules("all")).data); } catch (error) { setRulesError(messageOf(error)); }
    finally { setRulesLoading(false); }
  }
  async function openRuleDetail(id: string) {
    setActiveRuleId(id); setRuleMode("detail"); setRuleDetailLoading(true); setRulesError("");
    const monthEnd = new Date(Date.UTC(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)), 0)).toISOString().slice(0, 10);
    try {
      const [occurrences, revisions] = await Promise.all([listFinanceRuleOccurrences(id, MONTH_START, monthEnd), listFinanceRuleRevisions(id)]);
      setRuleOccurrences(occurrences.data.map((occurrence) => ({ id: occurrence.id, date: occurrence.date, status: occurrence.status, amount: occurrence.amount })));
      setRuleRevisions(revisions.data);
    } catch (error) { setRulesError(messageOf(error)); }
    finally { setRuleDetailLoading(false); }
  }
  async function saveRule(value: Parameters<typeof createFinanceRule>[0]) {
    if (ruleMode === "edit" && activeRuleId) {
      const current = rules.find((rule) => rule.id === activeRuleId);
      if (!current) return;
      const { start_date: _startDate, ...patch } = value;
      const updated = await patchFinanceRule(current.id, { ...patch, version: current.version });
      setRules((currentRules) => currentRules.map((rule) => rule.id === updated.id ? updated : rule));
    } else {
      const created = await createFinanceRule(value);
      setRules((currentRules) => [created, ...currentRules]);
    }
    setRuleMode("list");
  }
  async function stopRule(rule: FinanceRuleDto) {
    setRulesError("");
    try {
      const updated = await stopFinanceRule(rule.id, rule.version);
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (activeRuleId === updated.id) await openRuleDetail(updated.id);
    } catch (error) { setRulesError(messageOf(error)); }
  }

  const correcting = accountById(correctingId ?? undefined) ?? null;
  const editing = transactions.find((transaction) => transaction.id === editingId && transaction.type !== "transfer") ?? null;
  const editingTransfer = transactions.find((transaction) => transaction.id === editingId && transaction.type === "transfer") ?? null;
  const editingBudget = budgets.find((budget) => budget.id === editingBudgetId) ?? null;
  const budgetlessExpenseCats = categories.filter((c) => c.type === "expense" && !c.archived && !budgets.some((b) => b.categoryId === c.id));
  const activeRule = rules.find((rule) => rule.id === activeRuleId) ?? null;

  return (
    <AppShell active="finance" title="Finance">
      <div className="page-head">
        <h1>Finance</h1>
      </div>
      <ReportPanel scope="finance" />

      {errorMessage && <div className="error-banner" role="alert"><span>{errorMessage}</span><button type="button" className="btn btn-sm" onClick={() => { setErrorMessage(undefined); setLoading(true); refresh().catch((error) => setErrorMessage(messageOf(error))).finally(() => setLoading(false)); }}>Retry</button></div>}
      {loading && <div className="empty-state" aria-live="polite"><h1>Loading finance data</h1><p>Reading accounts, transactions, categories, and budgets from Tracker.</p></div>}

      <div className="toolbar" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="seg" role="tablist" aria-label="Finance section">
          <button role="tab" aria-selected={tab === "accounts"} type="button" onClick={() => setTab("accounts")}>
            Accounts
          </button>
          <button role="tab" aria-selected={tab === "transactions"} type="button" onClick={() => setTab("transactions")}>
            Transactions
          </button>
          <button role="tab" aria-selected={tab === "budgets"} type="button" onClick={() => setTab("budgets")}>
            Budgets
          </button>
        </div>
      </div>

      {/* ---------------- ACCOUNTS ---------------- */}
      {tab === "accounts" && (
        <>
          <div className="fin-summary">
            <div>
              <div className="fin-total-label">Total across {activeAccounts.length} active account{activeAccounts.length === 1 ? "" : "s"}</div>
              <div className="fin-total">
                <span className="cur">Rp</span>
                {totalActive.toLocaleString("en-US")}
              </div>
              <p className="fin-note">Computed from posted transactions. Excludes drafts and transfers between your own accounts, which never change your total.</p>
            </div>
            <div className="fin-summary-side">
              <div className="fin-mini">This month, posted</div>
              <div className="fin-mini" style={{ marginTop: 6 }}>
                In <b>{rp(monthIn)}</b>
              </div>
              <div className="fin-mini">
                Out <b>{rp(monthOut)}</b>
              </div>
            </div>
          </div>

          <div className="fin-section-head">
            <h2>Accounts</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddingAccount(true)}>
              <IconPlus width={16} height={16} /> New account
            </button>
          </div>
          <div className="fin-acct-list">
            {accounts.map((a) => (
              <div className={`fin-acct-row${a.archived ? " is-archived" : ""}`} key={a.id}>
                <span className="fin-acct-ic">
                  <AcctIcon type={a.type} />
                </span>
                <div className="fin-acct-main">
                  <div className="fin-acct-name">
                    {a.name} <span className="chip">{ACCT_TYPE_LABEL[a.type]}</span>
                    {a.archived && <span className="chip">Archived</span>}
                  </div>
                  <div className="fin-acct-open">{a.archived ? "Kept for its transaction history; not offered for new transactions." : `Opening balance ${rp(a.opening)}`}</div>
                </div>
                <div className="fin-acct-bal">{rp(balanceOf(a.id))}</div>
                <div>
                  {!a.archived && <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn btn-sm" onClick={() => setCorrectingId(a.id)}>Correct opening balance</button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => toggleAccountArchived(a.id)}>Archive</button>
                  </div>}
                </div>
              </div>
            ))}
          </div>

          <div className="fin-section-head">
            <h2>Categories</h2>
            <button type="button" className="btn btn-sm" onClick={() => setAddingCategory(true)}><IconPlus width={16} height={16} /> New category</button>
          </div>
          <div className="fin-cat-cols">
            {(["income", "expense"] as CatType[]).map((ct) => (
              <div key={ct}>
                <h3>{ct === "income" ? "Income" : "Expense"}</h3>
                <div className="fin-cat-list">
                  {categories
                    .filter((c) => c.type === ct)
                    .map((c) => (
                      <div className="fin-cat-row" key={c.id} style={c.archived ? { opacity: 0.62 } : undefined}>
                        <span>
                          {c.name} {c.archived && <span className="chip">Archived</span>}
                        </span>
                        {!c.archived && <button type="button" className="btn btn-sm btn-quiet" onClick={() => toggleCategoryArchived(c.id)}>Archive</button>}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------------- TRANSACTIONS ---------------- */}
      {tab === "transactions" && (
        <>
          <div className="toolbar">
            <select className="filter-select" aria-label="Filter by account" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="all">Account: All</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  Account: {a.name}
                </option>
              ))}
            </select>
            <select className="filter-select" aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | TxType)}>
              <option value="all">Type: All</option>
              <option value="income">Type: Income</option>
              <option value="expense">Type: Expense</option>
              <option value="transfer">Type: Transfer</option>
            </select>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" onClick={() => void openRules()}>Recurring rules</button>
            <button type="button" className="btn btn-sm" onClick={() => setTransferring(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m17 2 4 4-4 4" />
                <path d="M3 6h18" />
                <path d="m7 22-4-4 4-4" />
                <path d="M21 18H3" />
              </svg>{" "}
              Transfer
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddingTx(true)}>
              <IconPlus width={16} height={16} /> New transaction
            </button>
          </div>
          <p className="fin-led-note">Balances and reports read your current, corrected transactions, so a later correction or void changes past periods on purpose.</p>

          {filteredTx.length === 0 ? (
            <div className="empty-state">
              <span className="es-ic" aria-hidden>
                <IconWallet width={22} height={22} />
              </span>
              <h1>No transactions match these filters</h1>
              <p>Clear a filter, or record a new transaction to see it here.</p>
            </div>
          ) : (
            txByDate.map(([date, rows]) => (
              <div key={date}>
                <div className="fin-led-date">{fmtDateLong(date)}</div>
                <div className="fin-ledger">
                  {rows.map((t) => {
                    const from = accountById(t.accountId);
                    const to = accountById(t.toAccountId);
                    const cat = categoryById(t.categoryId);
                    const title = t.type === "transfer" ? `Transfer: ${from?.name} to ${to?.name}` : cat?.name ?? "Uncategorised";
                    let amtClass = "fin-amt-neutral";
                    let amtText = rp(t.amount);
                    if (t.status === "posted" && t.type === "income") {
                      amtClass = "fin-amt-in";
                      amtText = `+ ${rp(t.amount)}`;
                    } else if (t.status === "posted" && t.type === "expense") {
                      amtClass = "fin-amt-out";
                      amtText = `− ${rp(t.amount)}`;
                    }
                    return (
                      <button type="button" className={`fin-led-row${t.status === "void" ? " is-void" : ""}${t.status === "draft" ? " is-draft" : ""}`} key={t.id} onClick={() => openDetail(t.id)}>
                        <span className="fin-led-ic">
                          <LedIcon type={t.type} />
                        </span>
                        <span className="fin-led-body">
                          <span className="fin-led-title">{title}</span>
                          <span className="fin-led-sub">
                            {t.type === "transfer" ? (
                              <>Moves between your accounts &middot; not income or expense</>
                            ) : (
                              <>
                                {from?.name} &middot; {t.type === "income" ? "Income" : "Expense"}
                              </>
                            )}
                            {t.status === "draft" && <span className="chip">Draft, not in balance yet</span>}
                            {t.status === "draft" && t.fromRecurring && <span className="chip">From recurring rule</span>}
                            {t.status === "void" && <span className="chip-danger chip">Void</span>}
                          </span>
                        </span>
                        <span className={`fin-led-amt ${amtClass}`}>{amtText}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ---------------- BUDGETS ---------------- */}
      {tab === "budgets" && (
        <>
          <div className="fin-section-head" style={{ marginTop: 8 }}>
            <div className="fin-budget-month">
              <h2>{new Date(`${MONTH_START}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={budgetlessExpenseCats.length === 0} onClick={() => setAddingBudget(true)}>
              <IconPlus width={16} height={16} /> Add budget
            </button>
          </div>
          {budgets.length === 0 ? (
            <div className="empty-state">
              <span className="es-ic" aria-hidden>
                <IconWallet width={22} height={22} />
              </span>
              <h1>No budgets yet</h1>
              <p>Set a monthly limit on an expense category to track how much of it you have spent.</p>
              <button type="button" className="btn btn-primary" disabled={budgetlessExpenseCats.length === 0} onClick={() => setAddingBudget(true)}>
                Add a budget
              </button>
            </div>
          ) : (
            <div className="fin-budget-list">
              {budgets.map((b) => {
                const cat = categoryById(b.categoryId);
                const actual = budgetActual(b.categoryId);
                const over = actual > b.limit;
                const pct = b.limit === 0n ? 0 : Number((actual * 100n) / b.limit > 100n ? 100n : (actual * 100n) / b.limit);
                return (
                  <div className={`fin-budget-row${over ? " is-over" : ""}`} key={b.id}>
                    <div className="fin-budget-head">
                      <span className="fin-budget-name">
                        {cat?.name ?? "Category"} {over && <span className="chip-flag">Over budget</span>}
                      </span>
                      <span className="fin-budget-nums">
                        <span className="spent">{rp(actual)}</span> of {rp(b.limit)}
                        {over && <span className="fin-budget-over-text"> &middot; over by {rp(actual - b.limit)}</span>}
                      </span>
                    </div>
                    <div className="fin-budget-bar">
                      <i className={`fin-budget-fill${over ? " is-over" : ""}`} style={{ width: `${over ? 100 : pct}%` }} />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button type="button" className="btn btn-sm" onClick={() => setEditingBudgetId(b.id)}>Correct limit</button>
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => { if (window.confirm("Remove this monthly budget? Transactions will be kept.")) void complete(async () => { await deleteFinanceBudget(b.id, b.version); }); }}>Remove budget</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="field-hint" style={{ marginTop: 14 }}>
            Actuals come from posted expenses in the selected month. Drafts and voids are excluded.
          </p>
        </>
      )}

      {/* ---------------- MODALS ---------------- */}
      {addingAccount && (
        <Modal title="New account" onClose={() => setAddingAccount(false)}>
          <AccountForm onCancel={() => setAddingAccount(false)} onSave={addAccount} />
        </Modal>
      )}

      {addingCategory && (
        <Modal title="New category" onClose={() => setAddingCategory(false)}>
          <CategoryForm onCancel={() => setAddingCategory(false)} onSave={addCategory} />
        </Modal>
      )}

      {correcting && (
        <Modal title={`Correct opening balance: ${correcting.name}`} onClose={() => setCorrectingId(null)}>
          <OpeningBalanceForm account={correcting} onCancel={() => setCorrectingId(null)} onSave={(v) => correctOpening(correcting.id, v)} />
        </Modal>
      )}

      {addingTx && (
        <Modal title="New transaction" onClose={() => setAddingTx(false)}>
          <TransactionForm accounts={accounts} categories={categories} onCancel={() => setAddingTx(false)} onSave={addTransaction} />
        </Modal>
      )}

      {editing && (
        <Modal title="Correct transaction" onClose={() => setEditingId(null)}>
          <TransactionForm initial={editing} accounts={accounts} categories={categories} onCancel={() => setEditingId(null)} onSave={correctTransaction} />
        </Modal>
      )}

      {editingTransfer && (
        <Modal title="Correct transfer" onClose={() => setEditingId(null)}>
          <TransferForm initial={editingTransfer} accounts={accounts} balanceOf={balanceOf} onCancel={() => setEditingId(null)} onSave={correctTransfer} />
        </Modal>
      )}

      {transferring && (
        <Modal title="Transfer between accounts" onClose={() => setTransferring(false)}>
          <TransferForm accounts={accounts} balanceOf={balanceOf} onCancel={() => setTransferring(false)} onSave={addTransfer} />
        </Modal>
      )}

      {ruleMode && (
        <Modal title={ruleMode === "create" ? "New recurring transaction" : ruleMode === "edit" ? "Edit recurring transaction" : ruleMode === "detail" ? "Recurring transaction" : "Recurring transactions"} onClose={() => { setRuleMode(null); setActiveRuleId(null); setRulesError(""); }}>
          {rulesError && <div className="form-alert error" role="alert">{rulesError}</div>}
          {(ruleMode === "create" || ruleMode === "edit") && <FinanceRuleForm rule={ruleMode === "edit" ? activeRule ?? undefined : undefined} accounts={accounts} categories={categories} onCancel={() => setRuleMode("list")} onSave={saveRule} />}
          {ruleMode === "detail" && (ruleDetailLoading ? <div className="empty-state"><p>Loading rule history…</p></div> : activeRule ? <>
            <div className="detail-chips"><span className="chip">{recurrenceLabel(activeRule.frequency, activeRule.interval)}</span><span className="chip">{activeRule.status}</span>{activeRule.next_date && <span className="chip">Next {activeRule.next_date}</span>}</div>
            <div className="detail-section"><label>This month</label>{ruleOccurrences.length === 0 ? <p className="field-hint">No occurrences in this month.</p> : ruleOccurrences.map((occurrence) => <div className="detail-hist-row" key={occurrence.id}><span className="dh-k">{rp(BigInt(occurrence.amount))} <span className="chip">{occurrence.status}</span></span><span className="tnum">{occurrence.date}</span></div>)}</div>
            <div className="detail-section"><label>Rule history</label>{ruleRevisions.map((revision) => <div className="detail-hist-row" key={revision.id}><span className="dh-k">{revision.action} · version {revision.rule_version}</span><span className="tnum">{new Date(revision.changed_at).toLocaleDateString()}</span></div>)}</div>
            <div className="modal-foot"><button type="button" className="btn btn-quiet" onClick={() => setRuleMode("list")}>Back</button>{activeRule.status === "active" && <><button type="button" className="btn" onClick={() => setRuleMode("edit")}>Edit</button><button type="button" className="btn btn-primary" onClick={() => void stopRule(activeRule)}>Stop rule</button></>}</div>
          </> : null)}
          {ruleMode === "list" && (rulesLoading ? <div className="empty-state"><p>Loading recurring transactions…</p></div> : <>
            <div className="detail-actions"><button type="button" className="btn btn-primary" onClick={() => { setActiveRuleId(null); setRuleMode("create"); }}><IconPlus width={16} height={16} /> New recurring transaction</button></div>
            {rules.length === 0 ? <div className="empty-state"><p>No recurring transactions yet.</p></div> : <div className="task-list">{rules.map((rule) => <div className="task-row" key={rule.id}><button type="button" className="task-row-title" onClick={() => void openRuleDetail(rule.id)}>{rule.type === "transfer" ? `Transfer: ${accountById(rule.account_id)?.name ?? "Account"} to ${accountById(rule.to_account_id ?? undefined)?.name ?? "Account"}` : categoryById(rule.category_id ?? undefined)?.name ?? "Uncategorised"}</button><div className="task-row-meta"><span className="chip">{recurrenceLabel(rule.frequency, rule.interval)}</span><span className="chip">{rule.status}</span><span className="task-row-due">{rp(BigInt(rule.amount))}</span>{rule.next_date && <span className="task-row-due">Next {rule.next_date}</span>}{rule.status === "active" && <button type="button" className="btn btn-sm btn-quiet" onClick={() => void stopRule(rule)}>Stop</button>}</div></div>)}</div>}
          </>)}
        </Modal>
      )}

      {addingBudget && (
        <Modal title="New budget" onClose={() => setAddingBudget(false)}>
          <BudgetForm options={budgetlessExpenseCats} onCancel={() => setAddingBudget(false)} onSave={addBudget} />
        </Modal>
      )}

      {editingBudget && (
        <Modal title="Correct budget" onClose={() => setEditingBudgetId(null)}>
          <BudgetLimitForm budget={editingBudget} category={categoryById(editingBudget.categoryId)} onCancel={() => setEditingBudgetId(null)} onSave={correctBudget} />
        </Modal>
      )}

      {detailTx && (
        <Modal title="Transaction" onClose={() => setDetailId(null)}>
          {(() => {
            const from = accountById(detailTx.accountId);
            const to = accountById(detailTx.toAccountId);
            const cat = categoryById(detailTx.categoryId);
            const isExpense = detailTx.type === "expense";
            const isIncome = detailTx.type === "income";
            const amtClass = detailTx.status === "void" ? "" : isIncome ? "fin-amt-in" : isExpense ? "fin-amt-out" : "fin-amt-neutral";
            const sign = detailTx.status === "posted" && isIncome ? "+ " : detailTx.status === "posted" && isExpense ? "− " : "";
            return (
              <>
                <div className={`detail-amt ${amtClass}`} style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 550, marginBottom: 6, textDecoration: detailTx.status === "void" ? "line-through" : undefined, color: detailTx.status === "void" ? "var(--muted)" : undefined }}>
                  {sign}
                  {rp(detailTx.amount)}
                </div>
                <div className="detail-chips">
                  {detailTx.type === "transfer" ? <span className="chip">Transfer</span> : <span className="chip">{isIncome ? "Income" : "Expense"}</span>}
                  {detailTx.status === "posted" && <span className="chip">Posted</span>}
                  {detailTx.status === "draft" && <span className="chip">Draft, not in balance yet</span>}
                  {detailTx.status === "void" && <span className="chip-danger chip">Void</span>}
                  {detailTx.type === "transfer" ? (
                    <span className="chip">
                      {from?.name} to {to?.name}
                    </span>
                  ) : (
                    <>
                      <span className="chip">{from?.name}</span>
                      {cat && <span className="chip">{cat.name}</span>}
                    </>
                  )}
                  {detailTx.fromRecurring && <span className="chip">From recurring rule</span>}
                </div>

                {detailTx.note && <p className="detail-desc">{detailTx.note}. Dated {fmtDateLong(detailTx.date)}.</p>}
                {!detailTx.note && <p className="detail-desc">Dated {fmtDateLong(detailTx.date)}.</p>}

                <div className="detail-section">
                  <label>Revision history</label>
                  {[...detailTx.revisions].reverse().map((r, i) => (
                    <div className="detail-hist-row" key={i}>
                      <span className="dh-k" style={{ color: "var(--ink-soft)", fontWeight: 600 }}>
                        {r.action === "created" ? (detailTx.status === "draft" ? "Created as draft" : "Created") : r.action === "posted" ? "Posted" : r.action === "voided" ? "Voided" : "Edited"}
                      </span>
                      <span className="tnum">{fmtRevTime(r.at)}</span>
                    </div>
                  ))}
                </div>

                {detailTx.status === "draft" && (
                  <div className="detail-actions">
                    <button type="button" className="btn btn-primary" onClick={() => confirmDraft(detailTx.id)}>
                      Confirm &amp; post
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => cancelDraft(detailTx.id)}>
                      Void draft
                    </button>
                  </div>
                )}

                {detailTx.status === "posted" && !voidConfirm && (
                  <div className="detail-actions">
                    <button type="button" className="btn" onClick={() => { setDetailId(null); setEditingId(detailTx.id); }}>Correct</button>
                    <button type="button" className="btn btn-danger" onClick={() => setVoidConfirm(true)}>
                      Void
                    </button>
                  </div>
                )}

                {detailTx.status === "posted" && voidConfirm && (
                  <div className="error-banner" role="alert" style={{ marginTop: 14, display: "block" }}>
                    <p style={{ marginBottom: 12 }}>
                      <strong>Void this transaction?</strong> The record is kept for history but removed from your balance, and past reports recompute. A voided transaction can&apos;t be edited or posted again.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => setVoidConfirm(false)}>
                        Keep it
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => voidTransaction(detailTx.id)}>
                        Confirm void
                      </button>
                    </div>
                  </div>
                )}

                {detailTx.status === "void" && <p className="field-hint" style={{ marginTop: 14 }}>This transaction is voided. It is kept for history but no longer affects your balance.</p>}
              </>
            );
          })()}
        </Modal>
      )}
    </AppShell>
  );
}
