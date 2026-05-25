export type TransactionType = "income" | "expense" | "transfer" | "adjustment";
export type AccountType = "binance" | "bank" | "cash" | "other";
export type Currency = "USD" | "VES" | "COP" | "EUR";

export type Person = {
  id: string;
  name: string;
  initialBalance: number;
  currentBalance: number;
  color?: string;
  isActive: boolean;
  createdAt: string;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  createdAt: string;
};

export type Transaction = {
  id: string;
  personId: string;
  toPersonId?: string;
  type: TransactionType;
  amount: number;
  date: string;
  description: string;
  category?: string;
  account?: string;
  toAccount?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type AuditEntry = {
  id: string;
  action: "created" | "edited" | "deleted" | "imported" | "reset";
  entity: "transaction" | "person" | "account" | "backup";
  entityId: string;
  personId?: string;
  at: string;
  summary: string;
};

export type FinanceState = {
  people: Person[];
  accounts: Account[];
  transactions: Transaction[];
  audit: AuditEntry[];
};

export type TransactionDraft = Omit<Transaction, "id" | "createdAt" | "updatedAt">;
