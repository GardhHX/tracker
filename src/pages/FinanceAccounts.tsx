import { useMemo, useState, type FormEvent } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { IconPlus, IconWallet } from "@/components/icons";

type AcctType = "cash" | "bank" | "ewallet";
type TxType = "income" | "expense" | "transfer";
type TxStatus = "draft" | "posted" | "void";
type CatType = "income" | "expense";
type FinTab = "accounts" | "transactions" | "budgets";

type OpeningChange = { from: number | null; to: number; date: string };
type Account = { id: string; name: string; type: AcctType; opening: number; archived: boolean; openingHistory: OpeningChange[] };
type Category = { id: string; name: string; type: CatType; archived: boolean };
type Revision = { action: "created" | "edited" | "posted" | "voided"; note?: string; at: string };
type Transaction = {
  id: string;
  type: TxType;
  status: TxStatus;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note?: string;
  fromRecurring?: boolean;
  revisions: Revision[];
};
type Budget = { id: string; categoryId: string; limit: number };

const MONTH = "2026-09"; // the sample "current" month
const ACCT_TYPE_LABEL: Record<AcctType, string> = { cash: "Cash", bank: "Bank", ewallet: "E-wallet" };

function rp(n: number) {
  return `Rp ${Math.round(n).toLocaleString("en-US")}`;
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

const SEED_ACCOUNTS: Account[] = [
  { id: "a-bca", name: "BCA", type: "bank", opening: 3500000, archived: false, openingHistory: [{ from: 3000000, to: 3500000, date: "2026-09-02" }, { from: null, to: 3000000, date: "2026-08-28" }] },
  { id: "a-dana", name: "Dana", type: "ewallet", opening: 1000000, archived: false, openingHistory: [{ from: null, to: 1000000, date: "2026-08-28" }] },
  { id: "a-cash", name: "Cash", type: "cash", opening: 500000, archived: false, openingHistory: [{ from: null, to: 500000, date: "2026-08-28" }] },
  { id: "a-jenius", name: "Jenius", type: "bank", opening: 0, archived: true, openingHistory: [{ from: null, to: 0, date: "2026-07-10" }] },
];

const SEED_CATEGORIES: Category[] = [
  { id: "c-salary", name: "Salary", type: "income", archived: false },
  { id: "c-freelance", name: "Freelance", type: "income", archived: false },
  { id: "c-bonus", name: "Bonus", type: "income", archived: true },
  { id: "c-food", name: "Food & Drink", type: "expense", archived: false },
  { id: "c-transport", name: "Transport", type: "expense", archived: false },
  { id: "c-utilities", name: "Utilities", type: "expense", archived: false },
  { id: "c-subs", name: "Subscriptions", type: "expense", archived: false },
];

function rev(action: Revision["action"], date: string, note?: string): Revision {
  return { action, at: `${date}T09:00:00`, note };
}

const SEED_TRANSACTIONS: Transaction[] = [
  { id: "x1", type: "income", status: "posted", accountId: "a-bca", categoryId: "c-salary", amount: 8000000, date: "2026-09-16", note: "September salary", revisions: [rev("created", "2026-09-16"), rev("posted", "2026-09-16")] },
  { id: "x2", type: "expense", status: "posted", accountId: "a-bca", categoryId: "c-food", amount: 150000, date: "2026-09-16", note: "Lunch with the team", revisions: [rev("created", "2026-09-16"), rev("posted", "2026-09-16"), rev("edited", "2026-09-16", "amount Rp 120,000 to Rp 150,000")] },
  { id: "x3", type: "transfer", status: "posted", accountId: "a-bca", toAccountId: "a-dana", amount: 500000, date: "2026-09-15", revisions: [rev("created", "2026-09-15"), rev("posted", "2026-09-15")] },
  { id: "x4", type: "expense", status: "posted", accountId: "a-dana", categoryId: "c-transport", amount: 45000, date: "2026-09-15", revisions: [rev("created", "2026-09-15"), rev("posted", "2026-09-15")] },
  { id: "x5", type: "expense", status: "draft", accountId: "a-bca", categoryId: "c-subs", amount: 99000, date: "2026-09-14", fromRecurring: true, note: "Streaming plan", revisions: [rev("created", "2026-09-14")] },
  { id: "x6", type: "expense", status: "void", accountId: "a-bca", categoryId: "c-utilities", amount: 320000, date: "2026-09-14", note: "Double-charged, voided", revisions: [rev("created", "2026-09-14"), rev("posted", "2026-09-14"), rev("voided", "2026-09-14")] },
  { id: "x7", type: "expense", status: "posted", accountId: "a-dana", categoryId: "c-food", amount: 640000, date: "2026-09-08", note: "Groceries", revisions: [rev("created", "2026-09-08"), rev("posted", "2026-09-08")] },
  { id: "x8", type: "expense", status: "posted", accountId: "a-bca", categoryId: "c-food", amount: 450000, date: "2026-09-10", revisions: [rev("created", "2026-09-10"), rev("posted", "2026-09-10")] },
  { id: "x9", type: "expense", status: "posted", accountId: "a-cash", categoryId: "c-transport", amount: 435000, date: "2026-09-05", revisions: [rev("created", "2026-09-05"), rev("posted", "2026-09-05")] },
  { id: "x10", type: "expense", status: "posted", accountId: "a-bca", categoryId: "c-utilities", amount: 320000, date: "2026-09-03", note: "Electricity", revisions: [rev("created", "2026-09-03"), rev("posted", "2026-09-03")] },
  { id: "x11", type: "expense", status: "posted", accountId: "a-bca", categoryId: "c-subs", amount: 110000, date: "2026-09-02", revisions: [rev("created", "2026-09-02"), rev("posted", "2026-09-02")] },
  { id: "x12", type: "expense", status: "posted", accountId: "a-bca", categoryId: "c-subs", amount: 100000, date: "2026-09-12", revisions: [rev("created", "2026-09-12"), rev("posted", "2026-09-12")] },
];

const SEED_BUDGETS: Budget[] = [
  { id: "b-food", categoryId: "c-food", limit: 1500000 },
  { id: "b-transport", categoryId: "c-transport", limit: 600000 },
  { id: "b-subs", categoryId: "c-subs", limit: 150000 },
  { id: "b-utilities", categoryId: "c-utilities", limit: 700000 },
];

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

function AccountForm({ onCancel, onSave }: { onCancel: () => void; onSave: (input: { name: string; type: AcctType; opening: number }) => void }) {
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
    onSave({ name: name.trim(), type, opening: Number(digits(opening)) || 0 });
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

function OpeningBalanceForm({ account, onCancel, onSave }: { account: Account; onCancel: () => void; onSave: (newOpening: number) => void }) {
  const [amount, setAmount] = useState(String(account.opening));
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(Number(digits(amount)) || 0);
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

function TransactionForm({ accounts, categories, onCancel, onSave }: { accounts: Account[]; categories: Category[]; onCancel: () => void; onSave: (input: { type: "income" | "expense"; accountId: string; categoryId: string; amount: number; date: string; note?: string }) => void }) {
  const active = accounts.filter((a) => !a.archived);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const cats = categories.filter((c) => c.type === type && !c.archived);
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? "");
  const [date, setDate] = useState("2026-09-16");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();

  function changeType(next: "income" | "expense") {
    setType(next);
    const first = categories.find((c) => c.type === next && !c.archived);
    setCategoryId(first?.id ?? "");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (Number(digits(amount)) <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    onSave({ type, accountId, categoryId, amount: Number(digits(amount)), date, note: note.trim() || undefined });
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
          <input id="ntx-date" type="date" className="input" value={date} max="2026-09-16" onChange={(e) => setDate(e.target.value)} />
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

function TransferForm({ accounts, balanceOf, onCancel, onSave }: { accounts: Account[]; balanceOf: (id: string) => number; onCancel: () => void; onSave: (input: { fromId: string; toId: string; amount: number }) => void }) {
  const active = accounts.filter((a) => !a.archived);
  const [fromId, setFromId] = useState(active[0]?.id ?? "");
  const [toId, setToId] = useState(active[1]?.id ?? active[0]?.id ?? "");
  const [amount, setAmount] = useState("500000");
  const [error, setError] = useState<string | undefined>();

  const amt = Number(digits(amount)) || 0;
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const same = fromId === toId;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (same) {
      setError("The source and destination must be different accounts.");
      return;
    }
    if (amt <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    onSave({ fromId, toId, amount: amt });
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

function BudgetForm({ options, onCancel, onSave }: { options: Category[]; onCancel: () => void; onSave: (input: { categoryId: string; limit: number }) => void }) {
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? "");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | undefined>();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (Number(digits(limit)) <= 0) {
      setError("Enter a limit greater than zero.");
      return;
    }
    onSave({ categoryId, limit: Number(digits(limit)) });
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

export default function FinancePage() {
  const [tab, setTab] = useState<FinTab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>(SEED_ACCOUNTS);
  const [categories, setCategories] = useState<Category[]>(SEED_CATEGORIES);
  const [transactions, setTransactions] = useState<Transaction[]>(SEED_TRANSACTIONS);
  const [budgets, setBudgets] = useState<Budget[]>(SEED_BUDGETS);

  const [addingAccount, setAddingAccount] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [addingTx, setAddingTx] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addingBudget, setAddingBudget] = useState(false);
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");

  function accountById(id?: string) {
    return accounts.find((a) => a.id === id);
  }
  function categoryById(id?: string) {
    return categories.find((c) => c.id === id);
  }

  function balanceOf(accId: string) {
    const acc = accountById(accId);
    let bal = acc?.opening ?? 0;
    for (const t of transactions) {
      if (t.status !== "posted") continue;
      if (t.type === "income" && t.accountId === accId) bal += t.amount;
      else if (t.type === "expense" && t.accountId === accId) bal -= t.amount;
      else if (t.type === "transfer") {
        if (t.accountId === accId) bal -= t.amount;
        if (t.toAccountId === accId) bal += t.amount;
      }
    }
    return bal;
  }

  const activeAccounts = accounts.filter((a) => !a.archived);
  const totalActive = activeAccounts.reduce((sum, a) => sum + balanceOf(a.id), 0);
  const monthIn = transactions.filter((t) => t.status === "posted" && t.type === "income" && t.date.startsWith(MONTH)).reduce((s, t) => s + t.amount, 0);
  const monthOut = transactions.filter((t) => t.status === "posted" && t.type === "expense" && t.date.startsWith(MONTH)).reduce((s, t) => s + t.amount, 0);

  function budgetActual(categoryId: string) {
    return transactions.filter((t) => t.status === "posted" && t.type === "expense" && t.categoryId === categoryId && t.date.startsWith(MONTH)).reduce((s, t) => s + t.amount, 0);
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

  // ---- mutations ----
  function addAccount(input: { name: string; type: AcctType; opening: number }) {
    setAccounts((prev) => [...prev, { id: `a-${Date.now()}`, name: input.name, type: input.type, opening: input.opening, archived: false, openingHistory: [{ from: null, to: input.opening, date: "2026-09-16" }] }]);
    setAddingAccount(false);
  }
  function correctOpening(accId: string, newOpening: number) {
    setAccounts((prev) => prev.map((a) => (a.id === accId ? { ...a, opening: newOpening, openingHistory: [{ from: a.opening, to: newOpening, date: "2026-09-16" }, ...a.openingHistory] } : a)));
    setCorrectingId(null);
  }
  function toggleAccountArchived(accId: string) {
    setAccounts((prev) => prev.map((a) => (a.id === accId ? { ...a, archived: !a.archived } : a)));
  }
  function toggleCategoryArchived(catId: string) {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, archived: !c.archived } : c)));
  }
  function addTransaction(input: { type: "income" | "expense"; accountId: string; categoryId: string; amount: number; date: string; note?: string }) {
    setTransactions((prev) => [
      ...prev,
      { id: `x-${Date.now()}`, type: input.type, status: "posted", accountId: input.accountId, categoryId: input.categoryId, amount: input.amount, date: input.date, note: input.note, revisions: [rev("created", input.date), rev("posted", input.date)] },
    ]);
    setAddingTx(false);
  }
  function addTransfer(input: { fromId: string; toId: string; amount: number }) {
    setTransactions((prev) => [
      ...prev,
      { id: `x-${Date.now()}`, type: "transfer", status: "posted", accountId: input.fromId, toAccountId: input.toId, amount: input.amount, date: "2026-09-16", revisions: [rev("created", "2026-09-16"), rev("posted", "2026-09-16")] },
    ]);
    setTransferring(false);
  }
  function voidTransaction(id: string) {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, status: "void", revisions: [...t.revisions, rev("voided", "2026-09-16")] } : t)));
    setVoidConfirm(false);
  }
  function confirmDraft(id: string) {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, status: "posted", revisions: [...t.revisions, rev("posted", "2026-09-16")] } : t)));
  }
  function cancelDraft(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setDetailId(null);
  }
  function addBudget(input: { categoryId: string; limit: number }) {
    setBudgets((prev) => [...prev, { id: `b-${Date.now()}`, categoryId: input.categoryId, limit: input.limit }]);
    setAddingBudget(false);
  }

  function openDetail(id: string) {
    setDetailId(id);
    setVoidConfirm(false);
  }

  const correcting = accountById(correctingId ?? undefined) ?? null;
  const budgetlessExpenseCats = categories.filter((c) => c.type === "expense" && !c.archived && !budgets.some((b) => b.categoryId === c.id));

  return (
    <AppShell active="finance" title="Finance">
      <div className="page-head">
        <h1>Finance</h1>
        <span className="sample-tag">Sample data</span>
      </div>

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
                {Math.round(totalActive).toLocaleString("en-US")}
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
                  {a.archived ? (
                    <button type="button" className="btn btn-sm" onClick={() => toggleAccountArchived(a.id)}>
                      Unarchive
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm" onClick={() => setCorrectingId(a.id)}>
                      Correct opening balance
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="fin-section-head">
            <h2>Categories</h2>
            <span className="field-hint">Income and expense are separate; a category&apos;s type can&apos;t change once created.</span>
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
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => toggleCategoryArchived(c.id)}>
                          {c.archived ? "Unarchive" : "Archive"}
                        </button>
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
              <h2>September 2026</h2>
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
                const pct = b.limit === 0 ? 0 : Math.min(100, Math.round((actual / b.limit) * 100));
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

      {transferring && (
        <Modal title="Transfer between accounts" onClose={() => setTransferring(false)}>
          <TransferForm accounts={accounts} balanceOf={balanceOf} onCancel={() => setTransferring(false)} onSave={addTransfer} />
        </Modal>
      )}

      {addingBudget && (
        <Modal title="New budget" onClose={() => setAddingBudget(false)}>
          <BudgetForm options={budgetlessExpenseCats} onCancel={() => setAddingBudget(false)} onSave={addBudget} />
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
                        {r.action === "created" ? (detailTx.status === "draft" ? "Created as draft" : "Created") : r.action === "posted" ? "Posted" : r.action === "voided" ? "Voided" : `Edited${r.note ? ` · ${r.note}` : ""}`}
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
                      Cancel draft
                    </button>
                  </div>
                )}

                {detailTx.status === "posted" && !voidConfirm && (
                  <div className="detail-actions">
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
