import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Activity,
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  BarChart3,
  CircleDollarSign,
  Copy,
  Download,
  Edit3,
  FileDown,
  FileUp,
  Landmark,
  LayoutDashboard,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Trash2,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { allCategories, createEmptyState, expenseCategories, incomeCategories } from "./data/seed";
import { clearState, loadState, saveState } from "./services/storage";
import type { Account, AuditEntry, FinanceState, Person, Transaction, TransactionDraft, TransactionType } from "./types";
import { accountDistribution, filterTransactions, getTotals, monthlySeries, personStats, recalculatePeople, sumByType } from "./utils/finance";
import { downloadFile, importedDate, money, numberValue, readableDate, today } from "./utils/format";
import { createId } from "./utils/id";

type View = "dashboard" | "transactions" | "people" | "accounts" | "metrics" | "import" | "settings";
type SortKey = "date" | "amount" | "person";
type ImportPreviewRow = Record<string, unknown> & {
  __legacyExcel?: boolean;
  __initialBalance?: number;
  __sheet?: string;
};

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Movimientos", icon: ArrowRightLeft },
  { id: "people", label: "Personas", icon: Users },
  { id: "accounts", label: "Cuentas", icon: Landmark },
  { id: "metrics", label: "Metricas", icon: BarChart3 },
  { id: "import", label: "Importar", icon: Upload },
  { id: "settings", label: "Config", icon: Settings },
];

const emptyDraft = (people: Person[], accounts: Account[], type: TransactionType = "income"): TransactionDraft => ({
  personId: people.find((person) => person.isActive)?.id ?? people[0]?.id ?? "",
  toPersonId: "",
  type,
  amount: 0,
  date: today(),
  description: "",
  category: type === "expense" ? expenseCategories[0] : incomeCategories[0],
  account: accounts[0]?.name ?? "Binance",
  toAccount: "",
  notes: "",
});

const normalizeType = (value: unknown): TransactionType => {
  const text = String(value ?? "").toLowerCase();
  if (["egreso", "expense", "gasto", "retiro"].includes(text)) return "expense";
  if (["transferencia", "transfer", "traspaso"].includes(text)) return "transfer";
  if (["ajuste", "adjustment"].includes(text)) return "adjustment";
  return "income";
};

function App() {
  const [state, setState] = useState<FinanceState>(() => loadState());
  const [view, setView] = useState<View>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [draft, setDraft] = useState<TransactionDraft>(() => emptyDraft(state.people, state.accounts));
  const [filters, setFilters] = useState({ personId: "", type: "", from: "", to: "", category: "", account: "", q: "" });
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [selectedPersonId, setSelectedPersonId] = useState(state.people[0]?.id ?? "");

  const people = useMemo(() => recalculatePeople(state.people, state.transactions), [state.people, state.transactions]);
  const appState = useMemo(() => ({ ...state, people }), [state, people]);
  const totals = useMemo(() => getTotals(state.transactions, people), [state.transactions, people]);
  const filteredTransactions = useMemo(() => {
    const rows = filterTransactions(state.transactions, filters);
    return [...rows].sort((a, b) => {
      if (sortKey === "amount") return b.amount - a.amount;
      if (sortKey === "person") return personName(people, a.personId).localeCompare(personName(people, b.personId));
      return b.date.localeCompare(a.date);
    });
  }, [filters, people, sortKey, state.transactions]);

  useEffect(() => saveState(appState), [appState]);

  const addAudit = (entry: Omit<AuditEntry, "id" | "at">) => {
    setState((current) => ({
      ...current,
      audit: [{ ...entry, id: createId(), at: new Date().toISOString() }, ...current.audit].slice(0, 80),
    }));
  };

  const openQuickForm = (type: TransactionType) => {
    setDraft(emptyDraft(people, state.accounts, type));
    setEditing(null);
    setShowForm(true);
  };

  const saveTransaction = () => {
    const error = validateDraft(draft);
    if (error) {
      alert(error);
      return;
    }
    const amount = Number(draft.amount);
    if (editing) {
      setState((current) => ({
        ...current,
        transactions: current.transactions.map((transaction) =>
          transaction.id === editing.id ? { ...editing, ...draft, amount, updatedAt: new Date().toISOString() } : transaction,
        ),
      }));
      addAudit({ action: "edited", entity: "transaction", entityId: editing.id, personId: draft.personId, summary: `Editado: ${draft.description}` });
    } else {
      const transaction: Transaction = { ...draft, amount, id: createId(), createdAt: new Date().toISOString() };
      setState((current) => ({ ...current, transactions: [transaction, ...current.transactions] }));
      addAudit({ action: "created", entity: "transaction", entityId: transaction.id, personId: draft.personId, summary: `Creado: ${draft.description}` });
    }
    setShowForm(false);
    setEditing(null);
  };

  const editTransaction = (transaction: Transaction) => {
    setEditing(transaction);
    setDraft({
      personId: transaction.personId,
      toPersonId: transaction.toPersonId ?? "",
      type: transaction.type,
      amount: transaction.amount,
      date: transaction.date,
      description: transaction.description,
      category: transaction.category ?? "",
      account: transaction.account ?? "",
      toAccount: transaction.toAccount ?? "",
      notes: transaction.notes ?? "",
    });
    setShowForm(true);
  };

  const deleteTransaction = (transaction: Transaction) => {
    if (!confirm("Eliminar este movimiento?")) return;
    setState((current) => ({ ...current, transactions: current.transactions.filter((item) => item.id !== transaction.id) }));
    addAudit({ action: "deleted", entity: "transaction", entityId: transaction.id, personId: transaction.personId, summary: `Eliminado: ${transaction.description}` });
  };

  const duplicateTransaction = (transaction: Transaction) => {
    const copy: Transaction = { ...transaction, id: createId(), date: today(), createdAt: new Date().toISOString(), updatedAt: undefined };
    setState((current) => ({ ...current, transactions: [copy, ...current.transactions] }));
    addAudit({ action: "created", entity: "transaction", entityId: copy.id, personId: copy.personId, summary: `Duplicado: ${copy.description}` });
  };

  const upsertPerson = (person?: Person) => {
    const name = prompt("Nombre de la persona", person?.name ?? "");
    if (!name) return;
    const initialBalance = numberValue(prompt("Saldo inicial", String(person?.initialBalance ?? 0)));
    if (person) {
      setState((current) => ({
        ...current,
        people: current.people.map((item) => (item.id === person.id ? { ...item, name, initialBalance } : item)),
      }));
      addAudit({ action: "edited", entity: "person", entityId: person.id, personId: person.id, summary: `Persona editada: ${name}` });
    } else {
      const newPerson: Person = {
        id: createId(),
        name,
        initialBalance,
        currentBalance: initialBalance,
        color: randomColor(),
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      setState((current) => ({ ...current, people: [...current.people, newPerson] }));
      addAudit({ action: "created", entity: "person", entityId: newPerson.id, personId: newPerson.id, summary: `Persona creada: ${name}` });
    }
  };

  const togglePerson = (person: Person) => {
    setState((current) => ({
      ...current,
      people: current.people.map((item) => (item.id === person.id ? { ...item, isActive: !item.isActive } : item)),
    }));
  };

  const upsertAccount = (account?: Account) => {
    const name = prompt("Nombre de la cuenta", account?.name ?? "");
    if (!name) return;
    const type = (prompt("Tipo: binance, bank, cash, other", account?.type ?? "other") ?? "other") as Account["type"];
    const currency = (prompt("Moneda: USD, VES, COP, EUR", account?.currency ?? "USD") ?? "USD") as Account["currency"];
    if (account) {
      setState((current) => ({ ...current, accounts: current.accounts.map((item) => (item.id === account.id ? { ...item, name, type, currency } : item)) }));
    } else {
      setState((current) => ({
        ...current,
        accounts: [...current.accounts, { id: createId(), name, type, currency, createdAt: new Date().toISOString() }],
      }));
    }
  };

  const exportCsv = (rows = state.transactions, filename = "movimientos.csv") => {
    downloadFile(filename, Papa.unparse(rows), "text/csv;charset=utf-8");
  };

  const exportExcel = (rows = state.transactions, filename = "movimientos.xlsx") => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Movimientos");
    XLSX.writeFile(wb, filename);
  };

  const exportBackup = () => {
    downloadFile(`yourmoney-backup-${today()}.json`, JSON.stringify(appState, null, 2), "application/json");
  };

  const importBackup = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as FinanceState;
    setState({ ...parsed, people: recalculatePeople(parsed.people ?? [], parsed.transactions ?? []) });
    addAudit({ action: "imported", entity: "backup", entityId: "backup", summary: "Backup importado" });
  };

  const resetApp = () => {
    if (!confirm("Restablecer la app y borrar todos los datos locales?")) return;
    if (!confirm("Seguro? Esto elimina personas editadas, movimientos importados, auditoria y backups cargados en este navegador.")) return;
    clearState();
    setState(createEmptyState());
    setView("dashboard");
  };

  return (
    <div className="min-h-screen bg-[#F6F7FA] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
        <div className="mb-7 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Wallet size={22} />
          </div>
          <div>
            <p className="text-lg font-semibold leading-tight">YourMoney</p>
            <p className="text-xs text-slate-500">Finanzas compartidas</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                view === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="pb-24 lg:ml-64 lg:pb-8">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta base: Binance</p>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">{titleForView(view)}</h1>
            </div>
            <div className="flex items-center gap-2">
              <IconButton title="Nuevo ingreso" onClick={() => openQuickForm("income")} tone="green">
                <ArrowUpCircle size={18} />
              </IconButton>
              <IconButton title="Nuevo egreso" onClick={() => openQuickForm("expense")} tone="red">
                <ArrowDownCircle size={18} />
              </IconButton>
              <button
                type="button"
                onClick={() => openQuickForm("income")}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                <Plus size={18} />
                Movimiento
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8">
          {view === "dashboard" && (
            <Dashboard
              state={appState}
              totals={totals}
              setFilters={setFilters}
              setView={setView}
              setSelectedPersonId={setSelectedPersonId}
              editTransaction={editTransaction}
            />
          )}
          {view === "transactions" && (
            <TransactionsView
              people={people}
              accounts={state.accounts}
              filters={filters}
              setFilters={setFilters}
              rows={filteredTransactions}
              sortKey={sortKey}
              setSortKey={setSortKey}
              editTransaction={editTransaction}
              deleteTransaction={deleteTransaction}
              duplicateTransaction={duplicateTransaction}
            />
          )}
          {view === "people" && (
            <PeopleView
              people={people}
              transactions={state.transactions}
              selectedPersonId={selectedPersonId}
              setSelectedPersonId={setSelectedPersonId}
              upsertPerson={upsertPerson}
              togglePerson={togglePerson}
            />
          )}
          {view === "accounts" && <AccountsView state={appState} upsertAccount={upsertAccount} />}
          {view === "metrics" && <MetricsView state={appState} />}
          {view === "import" && (
            <ImportExportView state={appState} setState={setState} exportCsv={exportCsv} exportExcel={exportExcel} resetApp={resetApp} />
          )}
          {view === "settings" && (
            <SettingsView state={appState} exportBackup={exportBackup} importBackup={importBackup} resetApp={resetApp} exportCsv={exportCsv} exportExcel={exportExcel} />
          )}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t border-slate-200 bg-white lg:hidden">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`flex flex-col items-center gap-1 px-1 py-2 text-[11px] ${view === item.id ? "text-slate-950" : "text-slate-500"}`}
          >
            <item.icon size={18} />
            <span className="max-w-full truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      {showForm && (
        <TransactionPanel
          draft={draft}
          setDraft={setDraft}
          people={people}
          accounts={state.accounts}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSave={saveTransaction}
        />
      )}
    </div>
  );
}

function Dashboard({
  state,
  totals,
  setFilters,
  setView,
  setSelectedPersonId,
  editTransaction,
}: {
  state: FinanceState;
  totals: ReturnType<typeof getTotals>;
  setFilters: (filters: { personId: string; type: string; from: string; to: string; category: string; account: string; q: string }) => void;
  setView: (view: View) => void;
  setSelectedPersonId: (id: string) => void;
  editTransaction: (transaction: Transaction) => void;
}) {
  const series = monthlySeries(state.transactions);
  const recent = state.transactions.slice(0, 8);
  const distribution = state.people.map((person) => ({ name: person.name, value: person.currentBalance, color: person.color }));

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total general" value={money(totals.grandTotal)} icon={CircleDollarSign} />
        <MetricCard label="Ingresos del mes" value={money(totals.monthIncome)} icon={ArrowUpCircle} tone="green" />
        <MetricCard label="Egresos del mes" value={money(totals.monthExpenses)} icon={ArrowDownCircle} tone="red" />
        <MetricCard label="Balance neto" value={money(totals.monthNet)} icon={Activity} tone={totals.monthNet >= 0 ? "green" : "red"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Panel title="Ingresos vs egresos por mes" action="Ver metricas" onAction={() => setView("metrics")}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} width={64} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="ingresos" fill="#16A34A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="egresos" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Distribucion por persona">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr] xl:grid-cols-1">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78}>
                    {distribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color ?? "#64748B"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {state.people.map((person) => (
                <PersonBalanceRow key={person.id} person={person} total={totals.grandTotal} />
              ))}
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.2fr]">
        <Panel title="Saldos por persona" action="Gestionar" onAction={() => setView("people")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {state.people.map((person) => (
              <article
                key={person.id}
                className="rounded-lg border border-slate-200 bg-white p-3 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{person.name}</span>
                  <span className="h-3 w-3 rounded-full" style={{ background: person.color }} />
                </div>
                <p className="mt-2 text-xl font-semibold">{money(person.currentBalance)}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPersonId(person.id);
                      setView("people");
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    Detalle
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({ personId: person.id, type: "", from: "", to: "", category: "", account: "", q: "" });
                      setView("transactions");
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    Movimientos
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="Movimientos recientes" action="Ver todos" onAction={() => setView("transactions")}>
          <TransactionList rows={recent} people={state.people} onEdit={editTransaction} />
        </Panel>
      </section>
    </div>
  );
}

function TransactionsView({
  people,
  accounts,
  filters,
  setFilters,
  rows,
  sortKey,
  setSortKey,
  editTransaction,
  deleteTransaction,
  duplicateTransaction,
}: {
  people: Person[];
  accounts: Account[];
  filters: { personId: string; type: string; from: string; to: string; category: string; account: string; q: string };
  setFilters: (filters: { personId: string; type: string; from: string; to: string; category: string; account: string; q: string }) => void;
  rows: Transaction[];
  sortKey: SortKey;
  setSortKey: (key: SortKey) => void;
  editTransaction: (transaction: Transaction) => void;
  deleteTransaction: (transaction: Transaction) => void;
  duplicateTransaction: (transaction: Transaction) => void;
}) {
  return (
    <div className="space-y-4">
      <Panel title="Filtros">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Select value={filters.personId} onChange={(value) => setFilters({ ...filters, personId: value })}>
            <option value="">Todas las personas</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
          <Select value={filters.type} onChange={(value) => setFilters({ ...filters, type: value })}>
            <option value="">Todos los tipos</option>
            <option value="income">Ingreso</option>
            <option value="expense">Egreso</option>
            <option value="transfer">Transferencia</option>
            <option value="adjustment">Ajuste</option>
          </Select>
          <Input type="date" value={filters.from} onChange={(value) => setFilters({ ...filters, from: value })} />
          <Input type="date" value={filters.to} onChange={(value) => setFilters({ ...filters, to: value })} />
          <Select value={filters.account} onChange={(value) => setFilters({ ...filters, account: value })}>
            <option value="">Todas las cuentas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.name}>
                {account.name}
              </option>
            ))}
          </Select>
          <Select value={sortKey} onChange={(value) => setSortKey(value as SortKey)}>
            <option value="date">Orden: fecha</option>
            <option value="amount">Orden: monto</option>
            <option value="person">Orden: persona</option>
          </Select>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
            <input
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              placeholder="Buscar por descripcion, categoria o nota"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-slate-500"
            />
          </div>
          <Select value={filters.category} onChange={(value) => setFilters({ ...filters, category: value })}>
            <option value="">Todas las categorias</option>
            {allCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </div>
      </Panel>

      <Panel title={`Historial (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3 pr-3">Fecha</th>
                <th className="py-3 pr-3">Persona</th>
                <th className="py-3 pr-3">Tipo</th>
                <th className="py-3 pr-3">Descripcion</th>
                <th className="py-3 pr-3">Categoria</th>
                <th className="py-3 pr-3">Cuenta</th>
                <th className="py-3 pr-3 text-right">Monto</th>
                <th className="py-3 pl-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((transaction) => (
                <tr key={transaction.id} className="align-top">
                  <td className="py-3 pr-3 text-slate-600">{readableDate(transaction.date)}</td>
                  <td className="py-3 pr-3 font-medium">{personName(people, transaction.personId)}</td>
                  <td className="py-3 pr-3"><TypeBadge type={transaction.type} /></td>
                  <td className="py-3 pr-3">
                    <p className="font-medium">{transaction.description}</p>
                    {transaction.notes && <p className="text-xs text-slate-500">{transaction.notes}</p>}
                  </td>
                  <td className="py-3 pr-3 text-slate-600">{transaction.category || "-"}</td>
                  <td className="py-3 pr-3 text-slate-600">{transaction.account || "-"}</td>
                  <td className={`py-3 pr-3 text-right font-semibold ${transaction.type === "expense" ? "text-red-600" : "text-emerald-700"}`}>
                    {transaction.type === "expense" || transaction.type === "transfer" ? "-" : ""}
                    {money(transaction.amount)}
                  </td>
                  <td className="py-3 pl-3">
                    <div className="flex justify-end gap-1">
                      <IconButton title="Editar" onClick={() => editTransaction(transaction)}><Edit3 size={16} /></IconButton>
                      <IconButton title="Duplicar" onClick={() => duplicateTransaction(transaction)}><Copy size={16} /></IconButton>
                      <IconButton title="Eliminar" onClick={() => deleteTransaction(transaction)} tone="red"><Trash2 size={16} /></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty text="No hay movimientos con estos filtros." />}
        </div>
      </Panel>
    </div>
  );
}

function PeopleView({
  people,
  transactions,
  selectedPersonId,
  setSelectedPersonId,
  upsertPerson,
  togglePerson,
}: {
  people: Person[];
  transactions: Transaction[];
  selectedPersonId: string;
  setSelectedPersonId: (id: string) => void;
  upsertPerson: (person?: Person) => void;
  togglePerson: (person: Person) => void;
}) {
  const selected = people.find((person) => person.id === selectedPersonId) ?? people[0];
  const selectedRows = transactions.filter((transaction) => transaction.personId === selected?.id || transaction.toPersonId === selected?.id);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => upsertPerson()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          <Plus size={18} /> Nueva persona
        </button>
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {people.map((person) => {
          const stats = personStats(person, transactions);
          return (
            <article key={person.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: person.color }} />
                    <h2 className="text-lg font-semibold">{person.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{person.isActive ? "Activa" : "Desactivada"}</p>
                </div>
                <button type="button" onClick={() => setSelectedPersonId(person.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
                  Detalle
                </button>
              </div>
              <p className="mt-4 text-2xl font-semibold">{money(stats.balance)}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <MiniStat label="Ingresos" value={money(stats.incomes)} />
                <MiniStat label="Egresos" value={money(stats.expenses)} />
              </div>
              <p className="mt-3 text-xs text-slate-500">Ultimo: {stats.lastMovement ? readableDate(stats.lastMovement.date) : "Sin movimientos"}</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => upsertPerson(person)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">Editar</button>
                <button type="button" onClick={() => togglePerson(person)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  {person.isActive ? "Desactivar" : "Activar"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
      {selected && (
        <Panel title={`Detalle de ${selected.name}`}>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <MetricCard label="Saldo" value={money(selected.currentBalance)} icon={Wallet} />
            <MetricCard label="Saldo inicial" value={money(selected.initialBalance)} icon={RefreshCcw} />
            <MetricCard label="Movimientos" value={String(selectedRows.length)} icon={Activity} />
            <MetricCard label="Estado" value={selected.isActive ? "Activa" : "Inactiva"} icon={Users} />
          </div>
          <TransactionList rows={selectedRows.slice(0, 12)} people={people} />
        </Panel>
      )}
    </div>
  );
}

function AccountsView({ state, upsertAccount }: { state: FinanceState; upsertAccount: (account?: Account) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => upsertAccount()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          <Plus size={18} /> Nueva cuenta
        </button>
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        {state.accounts.map((account) => {
          const distribution = accountDistribution(account, state);
          return (
            <Panel key={account.id} title={account.name} action="Editar" onAction={() => upsertAccount(account)}>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">{account.type} / {account.currency}</p>
                  <p className="text-3xl font-semibold">{money(distribution.total, account.currency)}</p>
                </div>
              </div>
              <div className="space-y-2">
                {distribution.people.map((person) => (
                  <PersonBalanceRow key={person.id} person={person} total={distribution.total} />
                ))}
              </div>
            </Panel>
          );
        })}
      </section>
    </div>
  );
}

function MetricsView({ state }: { state: FinanceState }) {
  const [filters, setFilters] = useState({ personId: "", account: "", category: "", from: "", to: "" });
  const [metricDay, setMetricDay] = useState("");
  const [metricMonth, setMetricMonth] = useState("");
  const [chartView, setChartView] = useState<"monthly" | "annual">("annual");
  const rows = filterTransactions(state.transactions, { ...filters, type: "", q: "" });
  const effectiveDay = metricDay || latestTransactionDate(rows) || today();
  const effectiveMonth = metricMonth || latestTransactionMonth(rows) || today().slice(0, 7);
  const dayRows = rows.filter((transaction) => transaction.date === effectiveDay);
  const monthRows = rows.filter((transaction) => transaction.date.startsWith(effectiveMonth));
  const years = yearlyRows(rows);
  const series = monthlySeries(rows);
  const monthTable = monthlyTableRows(rows);
  const chartRows =
    chartView === "monthly"
      ? series.map((row) => ({ period: row.month, ingresos: row.ingresos, egresos: row.egresos, balance: row.balance }))
      : years.map((row) => ({ period: row.year, ingresos: row.ingresos, egresos: row.egresos, balance: row.balance }));
  const dataStart = rows.length > 0 ? [...rows].sort((a, b) => a.date.localeCompare(b.date))[0].date : "";
  const dataEnd = rows.length > 0 ? [...rows].sort((a, b) => b.date.localeCompare(a.date))[0].date : "";
  const highestIncomeMonth = [...series].sort((a, b) => b.ingresos - a.ingresos)[0];
  const highestExpenseMonth = [...series].sort((a, b) => b.egresos - a.egresos)[0];
  const biggestPerson = [...state.people].sort((a, b) => b.currentBalance - a.currentBalance)[0];
  const biggestMover = [...state.people].sort((a, b) => personStats(b, rows).incomes + personStats(b, rows).expenses - (personStats(a, rows).incomes + personStats(a, rows).expenses))[0];

  return (
    <div className="space-y-4">
      <Panel title="Filtros de metricas">
        <div className="grid gap-3 md:grid-cols-5">
          <Select value={filters.personId} onChange={(value) => setFilters({ ...filters, personId: value })}>
            <option value="">Todas las personas</option>
            {state.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </Select>
          <Select value={filters.account} onChange={(value) => setFilters({ ...filters, account: value })}>
            <option value="">Todas las cuentas</option>
            {state.accounts.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}
          </Select>
          <Select value={filters.category} onChange={(value) => setFilters({ ...filters, category: value })}>
            <option value="">Todas las categorias</option>
            {allCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </Select>
          <Input type="date" value={filters.from} onChange={(value) => setFilters({ ...filters, from: value })} />
          <Input type="date" value={filters.to} onChange={(value) => setFilters({ ...filters, to: value })} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[180px_180px_auto_1fr]">
          <Field label="Dia">
            <Input type="date" value={effectiveDay} onChange={setMetricDay} />
          </Field>
          <Field label="Mes">
            <Input type="month" value={effectiveMonth} onChange={setMetricMonth} />
          </Field>
          <button
            type="button"
            onClick={() => {
              setMetricDay("");
              setMetricMonth("");
            }}
            className="self-end rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Auto
          </button>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Periodo cargado: {dataStart && dataEnd ? `${readableDate(dataStart)} a ${readableDate(dataEnd)}` : "sin movimientos"}.
            Las metricas combinan el XLS importado y los movimientos nuevos que registres.
          </div>
        </div>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Diarias">
          <MetricGrid rows={[
            ["Ingresos del dia", money(sumByType(dayRows, "income"))],
            ["Egresos del dia", money(sumByType(dayRows, "expense"))],
            ["Balance del dia", money(sumByType(dayRows, "income") - sumByType(dayRows, "expense") + sumByType(dayRows, "adjustment"))],
            ["Movimientos", String(dayRows.length)],
          ]} />
        </Panel>
        <Panel title="Mensuales">
          <MetricGrid rows={[
            ["Ingresos del mes", money(sumByType(monthRows, "income"))],
            ["Egresos del mes", money(sumByType(monthRows, "expense"))],
            ["Balance del mes", money(sumByType(monthRows, "income") - sumByType(monthRows, "expense") + sumByType(monthRows, "adjustment"))],
            ["Promedio gasto diario", money(sumByType(monthRows, "expense") / Math.max(1, uniqueDays(monthRows)))],
            ["Mes mayor ingreso", highestIncomeMonth ? `${highestIncomeMonth.month} ${money(highestIncomeMonth.ingresos)}` : "-"],
            ["Mes mayor egreso", highestExpenseMonth ? `${highestExpenseMonth.month} ${money(highestExpenseMonth.egresos)}` : "-"],
          ]} />
        </Panel>
        <Panel title="Comparativa">
          <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setChartView("monthly")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                chartView === "monthly" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setChartView("annual")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                chartView === "annual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"
              }`}
            >
              Anual
            </button>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(value) => `$${value}`} width={64} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Area dataKey="ingresos" fill="#DCFCE7" stroke="#16A34A" />
                <Area dataKey="egresos" fill="#FEE2E2" stroke="#DC2626" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="De por vida">
          <MetricGrid rows={[
            ["Total ingresos", money(sumByType(rows, "income"))],
            ["Total egresos", money(sumByType(rows, "expense"))],
            ["Balance neto historico", money(sumByType(rows, "income") - sumByType(rows, "expense") + sumByType(rows, "adjustment"))],
            ["Total acumulado", money(state.people.reduce((sum, person) => sum + person.currentBalance, 0))],
            ["Mayor saldo", biggestPerson ? `${biggestPerson.name} ${money(biggestPerson.currentBalance)}` : "-"],
            ["Mayor movimiento historico", biggestMover ? biggestMover.name : "-"],
          ]} />
        </Panel>
      </section>

      <Panel title="Tabla mensual">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3 pr-3">Mes</th>
                <th className="py-3 pr-3 text-right">Ingresos</th>
                <th className="py-3 pr-3 text-right">Egresos</th>
                <th className="py-3 pr-3 text-right">Ajustes</th>
                <th className="py-3 pr-3 text-right">Balance</th>
                <th className="py-3 pr-3 text-right">Movimientos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthTable.map((row) => (
                <tr key={row.month}>
                  <td className="py-3 pr-3 font-medium">{row.month}</td>
                  <td className="py-3 pr-3 text-right font-semibold text-emerald-700">{money(row.income)}</td>
                  <td className="py-3 pr-3 text-right font-semibold text-red-600">{money(row.expense)}</td>
                  <td className={`py-3 pr-3 text-right font-semibold ${row.adjustment >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {money(row.adjustment)}
                  </td>
                  <td className={`py-3 pr-3 text-right font-semibold ${row.balance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {money(row.balance)}
                  </td>
                  <td className="py-3 pr-3 text-right text-slate-600">{row.movements}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {monthTable.length === 0 && <Empty text="No hay datos mensuales con estos filtros." />}
        </div>
      </Panel>
    </div>
  );
}

function ImportExportView({
  state,
  setState,
  exportCsv,
  exportExcel,
  resetApp,
}: {
  state: FinanceState;
  setState: React.Dispatch<React.SetStateAction<FinanceState>>;
  exportCsv: () => void;
  exportExcel: () => void;
  resetApp: () => void;
}) {
  const [text, setText] = useState("Persona,Saldo\nLuis,127.59\nMelu,980.74\nYaya,485.09");
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseText = () => {
    const parsed = Papa.parse<ImportPreviewRow>(text.trim(), { header: true, skipEmptyLines: true });
    setPreview(parsed.data);
  };

  const parseFile = async (file: File) => {
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      const legacyRows = workbookToLegacyRows(workbook);
      if (legacyRows.length > 0) {
        setPreview(legacyRows);
        return;
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      setPreview(XLSX.utils.sheet_to_json<ImportPreviewRow>(sheet));
      return;
    }
    const content = await file.text();
    const parsed = Papa.parse<ImportPreviewRow>(content, { header: true, skipEmptyLines: true });
    setPreview(parsed.data);
  };

  const confirmImport = () => {
    if (preview.length === 0) return;
    const first = preview[0];
    const isLegacyExcelImport = preview.some((row) => row.__legacyExcel);
    const isBalanceImport = "Persona" in first && ("Saldo" in first || "Saldo actual" in first) && !("Tipo" in first);
    const kind = isLegacyExcelImport ? "Excel original multi-hoja" : isBalanceImport ? "saldos iniciales" : "movimientos";
    if (
      !confirm(
        `Vas a importar ${preview.length} filas de ${kind}. Esto se agregara a la base actual y puede duplicar datos si ya lo importaste antes. Continuar?`,
      )
    ) {
      return;
    }
    if (isLegacyExcelImport) {
      const importedNames = [...new Set(preview.map((row) => String(row.Persona ?? "")).filter(Boolean))];
      const peopleByName = new Map<string, Person>();
      const importedPeople = importedNames.map((name) => {
        const existing = state.people.find((person) => person.name.toLowerCase() === name.toLowerCase());
        const firstRow = preview.find((row) => String(row.Persona ?? "").toLowerCase() === name.toLowerCase());
        const initialBalance = numberValue(firstRow?.__initialBalance ?? existing?.initialBalance ?? 0);
        const person = {
          id: existing?.id ?? createId(),
          name,
          initialBalance,
          currentBalance: initialBalance,
          color: existing?.color ?? randomColor(),
          isActive: true,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        peopleByName.set(name.toLowerCase(), person);
        return person;
      });
      const untouchedPeople = state.people.filter(
        (person) => !importedNames.some((name) => name.toLowerCase() === person.name.toLowerCase()),
      );
      const transactions: Transaction[] = preview.map((row) => {
        const person = peopleByName.get(String(row.Persona ?? "").toLowerCase());
        return {
          id: createId(),
          personId: person?.id ?? "",
          type: normalizeType(row.Tipo),
          amount: Math.abs(numberValue(row.Monto)),
          date: importedDate(row.Fecha),
          description: String(row.Descripcion ?? "Importado"),
          category: String(row.Categoria ?? ""),
          account: String(row.Cuenta ?? "Binance"),
          notes: String(row.Notas ?? ""),
          createdAt: new Date().toISOString(),
        };
      });
      setState((current) => ({
        ...current,
        accounts: ensureAccount(current.accounts, "Binance"),
        people: [...untouchedPeople, ...importedPeople],
        transactions: [...transactions, ...current.transactions],
        audit: auditImport(current.audit, `Importadas ${importedNames.length} hojas y ${transactions.length} movimientos del Excel original`),
      }));
      setPreview([]);
      return;
    }
    if (isBalanceImport) {
      const importedPeople = preview.map((row) => {
        const existing = state.people.find((person) => person.name.toLowerCase() === String(row.Persona ?? "").toLowerCase());
        const initialBalance = numberValue(row.Saldo ?? row["Saldo actual"]);
        return {
          id: existing?.id ?? createId(),
          name: String(row.Persona ?? "Sin nombre"),
          initialBalance,
          currentBalance: initialBalance,
          color: existing?.color ?? randomColor(),
          isActive: true,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
      });
      setState((current) => ({ ...current, people: importedPeople, audit: auditImport(current.audit, `Importados ${importedPeople.length} saldos iniciales`) }));
      setPreview([]);
      return;
    }
    const transactions: Transaction[] = preview.map((row) => {
      const personNameValue = String(row.Persona ?? row.persona ?? "");
      const person = state.people.find((item) => item.name.toLowerCase() === personNameValue.toLowerCase()) ?? state.people[0];
      return {
        id: createId(),
        personId: person?.id ?? "",
        type: normalizeType(row.Tipo ?? row.tipo),
        amount: Math.abs(numberValue(row.Monto ?? row.monto)),
        date: importedDate(row.Fecha ?? row.fecha ?? today()),
        description: String(row.Descripcion ?? row.description ?? row.Concepto ?? "Importado"),
        category: String(row.Categoria ?? row.category ?? ""),
        account: String(row.Cuenta ?? row.account ?? "Binance"),
        notes: String(row.Notas ?? row.notes ?? ""),
        createdAt: new Date().toISOString(),
      };
    });
    setState((current) => ({
      ...current,
      accounts: ensureAccount(current.accounts, "Binance"),
      transactions: [...transactions, ...current.transactions],
      audit: auditImport(current.audit, `Importados ${transactions.length} movimientos`),
    }));
    setPreview([]);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <Panel title="Importar datos">
        <div className="space-y-3">
          <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-48 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-slate-500" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={parseText} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><FileUp size={18} /> Previsualizar tabla</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Upload size={18} /> Subir CSV/Excel</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(event) => event.target.files?.[0] && parseFile(event.target.files[0])} />
          </div>
          <p className="text-sm text-slate-500">
            Tambien acepta tu Excel original: una hoja RESUMEN y una hoja por persona con Fecha, Razon, Entra, Sale y Hay.
            La app convierte Entra en ingresos, Sale en egresos y calcula el saldo inicial desde la primera fila.
          </p>
        </div>
      </Panel>
      <Panel title={`Vista previa (${preview.length})`} action="Confirmar" onAction={confirmImport}>
        <PreviewTable rows={preview} />
      </Panel>
      <Panel title="Exportar reportes">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Download size={18} /> Movimientos CSV</button>
          <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><FileDown size={18} /> Movimientos Excel</button>
          <button type="button" onClick={() => exportSummary(state)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Users size={18} /> Resumen personas</button>
          <button type="button" onClick={() => exportMonthly(state)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><BarChart3 size={18} /> Reporte mensual</button>
        </div>
      </Panel>
      <Panel title="Base local">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Los datos estan guardados en LocalStorage de este navegador. Si importaste el XLS varias veces, borra la base local y vuelve a importar una sola vez.
          </p>
          <button
            type="button"
            onClick={resetApp}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            <Trash2 size={18} />
            Borrar toda la base local
          </button>
        </div>
      </Panel>
    </div>
  );
}

function SettingsView({
  state,
  exportBackup,
  importBackup,
  resetApp,
  exportCsv,
  exportExcel,
}: {
  state: FinanceState;
  exportBackup: () => void;
  importBackup: (file: File) => void;
  resetApp: () => void;
  exportCsv: () => void;
  exportExcel: () => void;
}) {
  const backupRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr]">
      <Panel title="Respaldo y datos locales">
        <div className="space-y-3">
          <button type="button" onClick={exportBackup} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><Download size={18} /> Exportar backup JSON</button>
          <button type="button" onClick={() => backupRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Upload size={18} /> Importar backup JSON</button>
          <input ref={backupRef} type="file" accept=".json" hidden onChange={(event) => event.target.files?.[0] && importBackup(event.target.files[0])} />
          <button type="button" onClick={resetApp} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={18} /> Restablecer app</button>
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            <button type="button" onClick={exportCsv} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Exportar CSV</button>
            <button type="button" onClick={exportExcel} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Exportar Excel</button>
          </div>
        </div>
      </Panel>
      <Panel title="Auditoria / actividad reciente">
        <div className="space-y-2">
          {state.audit.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{entry.summary}</p>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{entry.action}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{new Date(entry.at).toLocaleString("es-VE")} / {entry.entity}</p>
            </div>
          ))}
          {state.audit.length === 0 && <Empty text="Aun no hay actividad registrada." />}
        </div>
      </Panel>
    </div>
  );
}

function TransactionPanel({
  draft,
  setDraft,
  people,
  accounts,
  editing,
  onClose,
  onSave,
}: {
  draft: TransactionDraft;
  setDraft: (draft: TransactionDraft) => void;
  people: Person[];
  accounts: Account[];
  editing: Transaction | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const categories = draft.type === "expense" ? expenseCategories : incomeCategories;
  return (
    <div className="fixed inset-0 z-30 bg-slate-950/30">
      <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="border-b border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{editing ? "Editar movimiento" : "Nuevo movimiento"}</p>
          <h2 className="text-2xl font-semibold">Registro rapido</h2>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="Persona">
            <Select value={draft.personId} onChange={(value) => setDraft({ ...draft, personId: value })}>
              {people.filter((person) => person.isActive).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </Select>
          </Field>
          <Field label="Tipo">
            <div className="grid grid-cols-4 gap-2">
              {(["income", "expense", "transfer", "adjustment"] as TransactionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDraft({ ...draft, type, category: type === "expense" ? expenseCategories[0] : incomeCategories[0] })}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold ${draft.type === type ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  {typeLabel(type)}
                </button>
              ))}
            </div>
          </Field>
          {draft.type === "transfer" && (
            <Field label="Destino">
              <Select value={draft.toPersonId ?? ""} onChange={(value) => setDraft({ ...draft, toPersonId: value })}>
                <option value="">Seleccionar persona destino</option>
                {people.filter((person) => person.id !== draft.personId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monto">
              <Input type="number" value={String(draft.amount || "")} onChange={(value) => setDraft({ ...draft, amount: numberValue(value) })} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cuenta">
              <Select value={draft.account ?? ""} onChange={(value) => setDraft({ ...draft, account: value })}>
                {accounts.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}
              </Select>
            </Field>
            <Field label="Categoria">
              <Select value={draft.category ?? ""} onChange={(value) => setDraft({ ...draft, category: value })}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                {draft.type === "transfer" && <option value="Transferencia enviada">Transferencia enviada</option>}
              </Select>
            </Field>
          </div>
          <Field label="Descripcion">
            <Input value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} placeholder="Concepto del movimiento" />
          </Field>
          <Field label="Notas">
            <textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-slate-500" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={onSave} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children, action, onAction }: { title: string; children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action && <button type="button" onClick={onAction} className="text-sm font-semibold text-slate-600 hover:text-slate-950">{action}</button>}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, icon: Icon, tone = "slate" }: { label: string; value: string; icon: typeof Wallet; tone?: "slate" | "green" | "red" }) {
  const color = tone === "green" ? "text-emerald-700 bg-emerald-50" : tone === "red" ? "text-red-700 bg-red-50" : "text-slate-700 bg-slate-100";
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`rounded-lg p-2 ${color}`}><Icon size={18} /></div>
      </div>
      <p className="mt-3 break-words text-2xl font-semibold">{value}</p>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{value}</p></div>;
}

function MetricGrid({ rows }: { rows: [string, string][] }) {
  return <div className="grid gap-2 sm:grid-cols-2">{rows.map(([label, value]) => <MiniStat key={label} label={label} value={value} />)}</div>;
}

function IconButton({ title, onClick, children, tone = "slate" }: { title: string; onClick: () => void; children: React.ReactNode; tone?: "slate" | "green" | "red" }) {
  const color = tone === "green" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : tone === "red" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-slate-200 text-slate-600 hover:bg-slate-50";
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${color}`}>{children}</button>;
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500">{children}</select>;
}

function Input({ value, onChange, type = "text", placeholder }: { value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500" />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function TypeBadge({ type }: { type: TransactionType }) {
  const style = type === "income" ? "bg-emerald-50 text-emerald-700" : type === "expense" ? "bg-red-50 text-red-700" : type === "transfer" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${style}`}>{typeLabel(type)}</span>;
}

function PersonBalanceRow({ person, total }: { person: Person; total: number }) {
  const percent = total > 0 ? (person.currentBalance / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{person.name}</span>
        <span className="text-slate-600">{money(person.currentBalance)} / {percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: person.color }} /></div>
    </div>
  );
}

function TransactionList({ rows, people, onEdit }: { rows: Transaction[]; people: Person[]; onEdit?: (transaction: Transaction) => void }) {
  if (rows.length === 0) return <Empty text="Sin movimientos registrados." />;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((transaction) => (
        <button key={transaction.id} type="button" onClick={() => onEdit?.(transaction)} className="grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left">
          <div>
            <p className="font-medium">{transaction.description}</p>
            <p className="text-sm text-slate-500">{readableDate(transaction.date)} / {personName(people, transaction.personId)} / {transaction.account}</p>
          </div>
          <div className="text-right">
            <TypeBadge type={transaction.type} />
            <p className={`mt-1 font-semibold ${transaction.type === "expense" ? "text-red-600" : "text-emerald-700"}`}>{money(transaction.amount)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function PreviewTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <Empty text="Carga o pega datos para ver la previsualizacion." />;
  const columns = Object.keys(rows[0]).slice(0, 8);
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{columns.map((column) => <th key={column} className="py-2 pr-3">{column}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.slice(0, 12).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column} className="py-2 pr-3">{String(row[column] ?? "")}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{text}</div>;
}

function validateDraft(draft: TransactionDraft) {
  if (!draft.personId) return "Selecciona una persona.";
  if (!draft.date) return "La fecha es obligatoria.";
  if (!draft.description.trim()) return "La descripcion es obligatoria.";
  if (draft.type !== "adjustment" && Number(draft.amount) <= 0) return "El monto debe ser mayor a 0.";
  if (draft.type === "transfer" && !draft.toPersonId && !draft.toAccount) return "Selecciona un destino para la transferencia.";
  return "";
}

function personName(people: Person[], id: string) {
  return people.find((person) => person.id === id)?.name ?? "Sin persona";
}

function typeLabel(type: TransactionType) {
  return { income: "Ingreso", expense: "Egreso", transfer: "Transfer", adjustment: "Ajuste" }[type];
}

function titleForView(view: View) {
  return {
    dashboard: "Dashboard general",
    transactions: "Historial de movimientos",
    people: "Personas",
    accounts: "Cuentas compartidas",
    metrics: "Metricas",
    import: "Importar / Exportar",
    settings: "Configuracion",
  }[view];
}

function randomColor() {
  const palette = ["#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626", "#0891B2", "#475569"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function yearlyRows(transactions: Transaction[]) {
  const map = new Map<string, { year: string; ingresos: number; egresos: number; balance: number }>();
  transactions.forEach((transaction) => {
    const year = transaction.date.slice(0, 4);
    const row = map.get(year) ?? { year, ingresos: 0, egresos: 0, balance: 0 };
    if (transaction.type === "income") row.ingresos += transaction.amount;
    if (transaction.type === "expense") row.egresos += transaction.amount;
    row.balance = row.ingresos - row.egresos;
    map.set(year, row);
  });
  return [...map.values()].sort((a, b) => a.year.localeCompare(b.year));
}

function monthlyTableRows(transactions: Transaction[]) {
  const map = new Map<
    string,
    { month: string; income: number; expense: number; adjustment: number; balance: number; movements: number }
  >();
  transactions.forEach((transaction) => {
    const month = transaction.date.slice(0, 7);
    const row = map.get(month) ?? { month, income: 0, expense: 0, adjustment: 0, balance: 0, movements: 0 };
    if (transaction.type === "income") row.income += transaction.amount;
    if (transaction.type === "expense") row.expense += transaction.amount;
    if (transaction.type === "adjustment") row.adjustment += transaction.amount;
    row.movements += 1;
    row.balance = row.income - row.expense + row.adjustment;
    map.set(month, row);
  });
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}

function latestTransactionDate(transactions: Transaction[]) {
  return transactions.map((transaction) => transaction.date).filter(Boolean).sort((a, b) => b.localeCompare(a))[0];
}

function latestTransactionMonth(transactions: Transaction[]) {
  const latest = latestTransactionDate(transactions);
  return latest ? latest.slice(0, 7) : undefined;
}

function uniqueDays(transactions: Transaction[]) {
  return new Set(transactions.map((transaction) => transaction.date)).size;
}

function auditImport(audit: AuditEntry[], summary: string): AuditEntry[] {
  return [{ id: createId(), action: "imported", entity: "backup", entityId: "import", at: new Date().toISOString(), summary }, ...audit];
}

function workbookToLegacyRows(workbook: XLSX.WorkBook): ImportPreviewRow[] {
  const rows: ImportPreviewRow[] = [];
  workbook.SheetNames.forEach((sheetName) => {
    if (normalizeHeader(sheetName).includes("resumen")) return;
    const sheet = workbook.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const columns = findLegacyColumns(table);
    if (!columns) return;

    const personName = sheetName.trim();
    const dataRows = table.slice(columns.startRow);
    const firstValidDate = dataRows.map((row) => importedDateOrEmpty(row[columns.dateIndex])).find(Boolean) || today();
    let lastDate = "";

    const ledgerRows = dataRows.flatMap((row) => {
      const rawDate = importedDateOrEmpty(row[columns.dateIndex]);
      const date = rawDate || lastDate || firstValidDate;
      if (rawDate) lastDate = rawDate;
      const description = String(row[columns.reasonIndex] ?? "").trim() || "Sin descripcion";
      const income = numberValue(row[columns.incomeIndex]);
      const expense = numberValue(row[columns.expenseIndex]);
      const balance = columns.balanceIndex >= 0 ? numberValue(row[columns.balanceIndex]) : 0;
      if (income === 0 && expense === 0) return [];
      return [{ date, description, income, expense, balance }];
    });

    const sheetTotal = findSheetTotal(table);
    const finalBalance = sheetTotal ?? [...ledgerRows].reverse().find((row) => row.balance !== 0)?.balance ?? 0;
    const totalIncome = ledgerRows.reduce((sum, row) => sum + row.income, 0);
    const totalExpense = ledgerRows.reduce((sum, row) => sum + row.expense, 0);
    const rawInitialBalance = roundMoney(finalBalance - totalIncome + totalExpense);
    const initialBalance = Math.abs(rawInitialBalance) < 0.02 ? 0 : rawInitialBalance;

    ledgerRows.forEach((row) => {
      if (row.income > 0) {
        rows.push({
          Persona: personName,
          Fecha: importedDate(row.date),
          Tipo: "income",
          Monto: row.income,
          Descripcion: row.description,
          Categoria: "Deposito",
          Cuenta: "Binance",
          Notas: row.balance ? `Saldo Hay: ${money(row.balance)} / Hoja: ${sheetName}` : `Hoja: ${sheetName}`,
          __legacyExcel: true,
          __initialBalance: initialBalance,
          __sheet: sheetName,
        });
      }
      if (row.expense > 0) {
        rows.push({
          Persona: personName,
          Fecha: importedDate(row.date),
          Tipo: "expense",
          Monto: row.expense,
          Descripcion: row.description,
          Categoria: "Retiro",
          Cuenta: "Binance",
          Notas: row.balance ? `Saldo Hay: ${money(row.balance)} / Hoja: ${sheetName}` : `Hoja: ${sheetName}`,
          __legacyExcel: true,
          __initialBalance: initialBalance,
          __sheet: sheetName,
        });
      }
    });
  });
  return rows;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findLegacyColumns(table: unknown[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(table.length, 12); rowIndex += 1) {
    const rowsToInspect = [table[rowIndex], table[rowIndex + 1] ?? []];
    const dateIndex = findHeaderColumn(rowsToInspect, "fecha");
    const reasonIndex = findHeaderColumn(rowsToInspect, "razon");
    const incomeIndex = findHeaderColumn(rowsToInspect, "entra");
    const expenseIndex = findHeaderColumn(rowsToInspect, "sale");
    const balanceIndex = findHeaderColumn(rowsToInspect, "hay");
    if (dateIndex >= 0 && reasonIndex >= 0 && incomeIndex >= 0 && expenseIndex >= 0) {
      const secondRowHasHeaders = [dateIndex, reasonIndex, incomeIndex, expenseIndex, balanceIndex].some((index) =>
        index >= 0 ? ["fecha", "razon", "entra", "sale", "hay"].includes(normalizeHeader(rowsToInspect[1]?.[index])) : false,
      );
      return {
        dateIndex,
        reasonIndex,
        incomeIndex,
        expenseIndex,
        balanceIndex,
        startRow: rowIndex + (secondRowHasHeaders ? 2 : 1),
      };
    }
  }
  return null;
}

function findHeaderColumn(rows: unknown[][], header: string) {
  for (const row of rows) {
    const index = row.findIndex((cell) => normalizeHeader(cell) === header);
    if (index >= 0) return index;
  }
  return -1;
}

function findSheetTotal(table: unknown[][]) {
  for (const row of table.slice(0, 5)) {
    const totalIndex = row.findIndex((cell) => normalizeHeader(cell) === "total");
    if (totalIndex >= 0) return numberValue(row[totalIndex + 1]);
  }
  return undefined;
}

function importedDateOrEmpty(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return importedDate(value);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function ensureAccount(accounts: Account[], name: string) {
  if (accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) return accounts;
  return [
    ...accounts,
    {
      id: createId(),
      name,
      type: name.toLowerCase() === "binance" ? "binance" : "other",
      currency: "USD",
      createdAt: new Date().toISOString(),
    } satisfies Account,
  ];
}

function exportSummary(state: FinanceState) {
  const rows = state.people.map((person) => ({ Persona: person.name, Saldo: person.currentBalance, "Saldo inicial": person.initialBalance, Activa: person.isActive }));
  downloadFile("resumen-personas.csv", Papa.unparse(rows), "text/csv;charset=utf-8");
}

function exportMonthly(state: FinanceState) {
  downloadFile("reporte-mensual.csv", Papa.unparse(monthlySeries(state.transactions)), "text/csv;charset=utf-8");
}

export default App;
