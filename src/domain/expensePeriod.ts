import { isExcludedFromActuals } from './importAccounts';
import { outflowsByMonth, yearlyAmount } from './budgetEngine';
import type { BudgetCategory, BudgetItem, Transaction } from './types';

export interface ExpenseItem {
  name: string;
  category: BudgetCategory | 'other';
  planned: number;
  spent: number;
}

/** Bankbeträge und Budgetbeträge sind Rappen. Ein Postenname kann in älteren Plänen mehrfach vorkommen. */
export function expensePeriod(budget: BudgetItem[], transactions: Transaction[], period: string) {
  const monthly = period.length === 7;
  const monthIndex = Number(period.slice(5)) - 1;
  const entries = transactions.filter((t) => t.date.startsWith(period));
  const spending = entries.filter((t) => t.amount < 0 && !isExcludedFromActuals(t));
  const assignedNames = new Set(spending.map((t) => t.item));
  const items = new Map<string, ExpenseItem>();
  for (const b of budget) {
    if (b.taxTag === 'taxProvision' && !assignedNames.has(b.name)) continue;
    const planned = monthly ? (outflowsByMonth(b)[monthIndex] ?? 0) : yearlyAmount(b);
    const prev = items.get(b.name);
    if (prev) {
      prev.planned += planned;
      if (prev.category !== b.category) prev.category = 'other';
    } else items.set(b.name, { name: b.name, category: b.category, planned, spent: 0 });
  }
  let spent = 0,
    unassigned = 0;
  for (const t of spending) {
    spent -= t.amount;
    if (!t.item) {
      unassigned -= t.amount;
      continue;
    }
    const row = items.get(t.item) ?? { name: t.item, category: 'other', planned: 0, spent: 0 };
    row.spent -= t.amount;
    items.set(row.name, row);
  }
  const rows = [...items.values()].filter((r) => r.planned || r.spent);
  const planned = rows.reduce((sum, row) => sum + row.planned, 0);
  const income = entries.reduce((sum, t) => sum + (!isExcludedFromActuals(t) && t.amount > 0 ? t.amount : 0), 0);
  return { entries, spending, rows, spent, unassigned, planned, income };
}
