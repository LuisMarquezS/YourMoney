import type { Account, FinanceState, Person, Transaction } from "../types";
import { monthKey, today } from "./format";

export const signedAmountForPerson = (transaction: Transaction, personId: string) => {
  if (transaction.type === "income" && transaction.personId === personId) return transaction.amount;
  if (transaction.type === "expense" && transaction.personId === personId) return -transaction.amount;
  if (transaction.type === "adjustment" && transaction.personId === personId) return transaction.amount;
  if (transaction.type === "transfer") {
    if (transaction.personId === personId) return -transaction.amount;
    if (transaction.toPersonId === personId) return transaction.amount;
  }
  return 0;
};

export const recalculatePeople = (people: Person[], transactions: Transaction[]) =>
  people.map((person) => ({
    ...person,
    currentBalance:
      person.initialBalance +
      transactions.reduce((total, transaction) => total + signedAmountForPerson(transaction, person.id), 0),
  }));

export const getTotals = (transactions: Transaction[], people: Person[]) => {
  const currentMonth = today().slice(0, 7);
  const monthTransactions = transactions.filter((transaction) => monthKey(transaction.date) === currentMonth);
  const totalIncome = sumByType(monthTransactions, "income");
  const totalExpenses = sumByType(monthTransactions, "expense");
  return {
    grandTotal: people.reduce((total, person) => total + person.currentBalance, 0),
    monthIncome: totalIncome,
    monthExpenses: totalExpenses,
    monthNet: totalIncome - totalExpenses + sumByType(monthTransactions, "adjustment"),
  };
};

export const sumByType = (transactions: Transaction[], type: Transaction["type"]) =>
  transactions.filter((transaction) => transaction.type === type).reduce((total, transaction) => total + transaction.amount, 0);

export const personStats = (person: Person, transactions: Transaction[]) => {
  const related = transactions.filter((transaction) => transaction.personId === person.id || transaction.toPersonId === person.id);
  const incomes = related.reduce((total, transaction) => {
    const signed = signedAmountForPerson(transaction, person.id);
    return signed > 0 ? total + signed : total;
  }, 0);
  const expenses = related.reduce((total, transaction) => {
    const signed = signedAmountForPerson(transaction, person.id);
    return signed < 0 ? total + Math.abs(signed) : total;
  }, 0);
  return {
    incomes,
    expenses,
    balance: person.currentBalance,
    lastMovement: related.sort((a, b) => b.date.localeCompare(a.date))[0],
    movementCount: related.length,
  };
};

export const monthlySeries = (transactions: Transaction[]) => {
  const map = new Map<string, { month: string; ingresos: number; egresos: number; balance: number }>();
  transactions.forEach((transaction) => {
    const key = monthKey(transaction.date);
    const row = map.get(key) ?? { month: key, ingresos: 0, egresos: 0, balance: 0 };
    if (transaction.type === "income") row.ingresos += transaction.amount;
    if (transaction.type === "expense") row.egresos += transaction.amount;
    if (transaction.type === "adjustment") row.balance += transaction.amount;
    if (transaction.type === "transfer") row.balance += 0;
    row.balance = row.ingresos - row.egresos + row.balance;
    map.set(key, row);
  });
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
};

export const accountDistribution = (account: Account, state: FinanceState) => {
  const people = recalculatePeople(
    state.people,
    state.transactions.filter((transaction) => transaction.account === account.name || transaction.toAccount === account.name),
  );
  const total = people.reduce((sum, person) => sum + person.currentBalance, 0);
  return { total, people };
};

export const filterTransactions = (
  transactions: Transaction[],
  filters: { personId?: string; type?: string; from?: string; to?: string; category?: string; account?: string; q?: string },
) =>
  transactions.filter((transaction) => {
    if (filters.personId && transaction.personId !== filters.personId && transaction.toPersonId !== filters.personId) return false;
    if (filters.type && transaction.type !== filters.type) return false;
    if (filters.from && transaction.date < filters.from) return false;
    if (filters.to && transaction.date > filters.to) return false;
    if (filters.category && transaction.category !== filters.category) return false;
    if (filters.account && transaction.account !== filters.account && transaction.toAccount !== filters.account) return false;
    if (filters.q) {
      const haystack = `${transaction.description} ${transaction.category ?? ""} ${transaction.notes ?? ""}`.toLowerCase();
      if (!haystack.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  });
