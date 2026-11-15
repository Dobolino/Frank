import { ceilToFranc, sum, type Rappen } from './money';
import {
  MONTHS,
  type Account,
  type BudgetCategory,
  type BudgetItem,
  type Frequency,
  type Month,
} from './types';

/** Monate, in denen ein Posten fällig wird. */
export function dueMonths(f: Frequency): Month[] {
  switch (f.kind) {
    case 'monthly':
      return [...MONTHS];
    case 'yearly':
      return [f.month];
    case 'quarterly':
    case 'custom':
      return [...f.months];
  }
}

export const frequencyLabel = (f: Frequency): string => {
  switch (f.kind) {
    case 'monthly':
      return 'monatlich';
    case 'yearly':
      return 'jährlich';
    case 'quarterly':
      return 'quartalsweise';
    case 'custom':
      return `${f.months.length}× pro Jahr`;
  }
};

/** Effektiver Betrag pro Fälligkeit (bei Unterposten: deren Summe). */
export const itemAmount = (item: BudgetItem): Rappen =>
  item.children && item.children.length > 0 ? sum(item.children.map((c) => c.amount)) : item.amount;

export const yearlyAmount = (item: BudgetItem): Rappen => itemAmount(item) * dueMonths(item.frequency).length;

/** Umgerechnet auf einen Monat (für Monatsbudget und Daueraufträge). */
export const monthlyAmount = (item: BudgetItem): Rappen => Math.round(yearlyAmount(item) / 12);

/** Zahlungen eines Postens pro Monat (Index 0 = Januar). */
export function outflowsByMonth(item: BudgetItem): Rappen[] {
  const due = new Set(dueMonths(item.frequency));
  const amount = itemAmount(item);
  return MONTHS.map((m) => (due.has(m) ? amount : 0));
}

export interface CategoryTotal {
  category: BudgetCategory;
  monthly: Rappen;
  yearly: Rappen;
  items: BudgetItem[];
}

export function totalsByCategory(items: BudgetItem[]): CategoryTotal[] {
  const order: BudgetCategory[] = ['fixed', 'household', 'personal', 'mobility', 'savings'];
  return order.map((category) => {
    const list = items.filter((i) => i.category === category);
    const yearly = sum(list.map(yearlyAmount));
    return { category, items: list, yearly, monthly: Math.round(yearly / 12) };
  });
}

export interface AccountTransfer {
  account: Account;
  items: BudgetItem[];
  /** Exakter Monatsbedarf. */
  monthlyNeed: Rappen;
  /** Empfohlener Dauerauftrag (auf ganze Franken aufgerundet). */
  standingOrder: Rappen;
}

/**
 * Daueraufträge auf Sparkonten: Summe aller Posten, die von diesem Konto bezahlt werden,
 * umgerechnet auf einen Monat. Lohnkonto-Posten erzeugen keinen Dauerauftrag.
 */
export function standingOrders(items: BudgetItem[], accounts: Account[]): AccountTransfer[] {
  return accounts
    .filter((a) => a.type !== 'checking')
    .map((account) => {
      const list = items.filter((i) => i.accountId === account.id);
      const yearly = sum(list.map(yearlyAmount));
      return {
        account,
        items: list,
        monthlyNeed: yearly / 12,
        standingOrder: ceilToFranc(yearly / 12),
      };
    })
    .filter((t) => t.items.length > 0);
}

export interface BudgetSummary {
  /** Regulärer Netto-Monatslohn plus monatlich verteilte Nebeneinkünfte. */
  incomeMonthly: Rappen;
  incomeYearly: Rappen;
  expensesMonthly: Rappen;
  expensesYearly: Rappen;
  /** Rest pro regulärem Monat (ohne 13. Lohn und Bonus). */
  saldoMonthly: Rappen;
  /** Jahresüberschuss inkl. 13. Lohn, Bonus und Nebeneinkünften. */
  surplusYearly: Rappen;
  savingsYearly: Rappen;
  /** Anteil Sparen & Vorsorge am Jahres-Nettoeinkommen. */
  savingsRate: number;
  fixedShare: number;
  categories: CategoryTotal[];
}

export function summarizeBudget(
  items: BudgetItem[],
  income: { regularNetMonthly: Rappen; netYearly: Rappen; otherYearly: Rappen },
): BudgetSummary {
  const categories = totalsByCategory(items);
  const expensesYearly = sum(categories.map((c) => c.yearly));
  const savingsYearly = categories.find((c) => c.category === 'savings')?.yearly ?? 0;
  const fixedYearly = categories.find((c) => c.category === 'fixed')?.yearly ?? 0;
  const incomeYearly = income.netYearly + income.otherYearly;
  const incomeMonthly = income.regularNetMonthly;
  const expensesMonthly = Math.round(expensesYearly / 12);
  return {
    incomeMonthly,
    incomeYearly,
    expensesMonthly,
    expensesYearly,
    saldoMonthly: incomeMonthly - expensesMonthly,
    surplusYearly: incomeYearly - expensesYearly,
    savingsYearly,
    savingsRate: incomeYearly > 0 ? savingsYearly / incomeYearly : 0,
    fixedShare: incomeYearly > 0 ? fixedYearly / incomeYearly : 0,
    categories,
  };
}

/** Summe der Posten mit einem bestimmten Steuer-Tag pro Jahr. */
export const yearlyByTaxTag = (items: BudgetItem[], tag: BudgetItem['taxTag']): Rappen =>
  sum(items.filter((i) => i.taxTag === tag).map(yearlyAmount));
