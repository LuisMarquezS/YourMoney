import { createInitialState } from "../data/seed";
import type { FinanceState } from "../types";
import { recalculatePeople } from "../utils/finance";

const storageKey = "yourmoney.finance.v1";

export const loadState = (): FinanceState => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return createInitialState();
  try {
    const parsed = JSON.parse(raw) as FinanceState;
    return {
      people: recalculatePeople(parsed.people ?? [], parsed.transactions ?? []),
      accounts: parsed.accounts ?? [],
      transactions: parsed.transactions ?? [],
      audit: parsed.audit ?? [],
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: FinanceState) => {
  localStorage.setItem(storageKey, JSON.stringify({ ...state, people: recalculatePeople(state.people, state.transactions) }));
};

export const clearState = () => localStorage.removeItem(storageKey);
