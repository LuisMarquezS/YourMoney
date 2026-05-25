import type { Account, Person } from "../types";

const now = new Date().toISOString();
const colors = ["#2F80ED", "#27AE60", "#F2994A", "#9B51E0", "#EB5757", "#00A3A3", "#6B7280", "#D946EF", "#0F766E"];

export const initialPeople: Person[] = [
  { name: "Luis", initialBalance: 127.59 },
  { name: "Melu", initialBalance: 980.74 },
  { name: "Yaya", initialBalance: 485.09 },
  { name: "Juandi", initialBalance: 10 },
  { name: "Papa", initialBalance: 0 },
  { name: "Gaby", initialBalance: 0 },
  { name: "Chicho", initialBalance: 80.15 },
  { name: "Ale M", initialBalance: 0 },
  { name: "Mario", initialBalance: 387.06 },
].map((person, index) => ({
  ...person,
  id: crypto.randomUUID(),
  currentBalance: person.initialBalance,
  color: colors[index],
  isActive: true,
  createdAt: now,
}));

export const initialAccounts: Account[] = [
  { id: crypto.randomUUID(), name: "Binance", type: "binance", currency: "USD", createdAt: now },
  { id: crypto.randomUUID(), name: "Banco", type: "bank", currency: "USD", createdAt: now },
  { id: crypto.randomUUID(), name: "Efectivo", type: "cash", currency: "USD", createdAt: now },
];

export const incomeCategories = ["Deposito", "Pago recibido", "Transferencia recibida", "Ajuste positivo", "Otro ingreso"];
export const expenseCategories = ["Retiro", "Pago enviado", "Transferencia enviada", "Compra", "Comision", "Ajuste negativo", "Otro egreso"];
export const allCategories = [...incomeCategories, ...expenseCategories];

export const createInitialState = () => ({
  people: initialPeople,
  accounts: initialAccounts,
  transactions: [],
  audit: [],
});

export const createEmptyState = () => ({
  people: [],
  accounts: [],
  transactions: [],
  audit: [],
});
