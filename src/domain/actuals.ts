import { sum, type Rappen } from './money';
import { outflowsByMonth } from './budgetEngine';
import type { BudgetCategory, BudgetItem, CategoryRule, Transaction } from './types';
import type { ParsedTransaction } from './bankCsv';

/** Stichwort aus dem Buchungstext: ohne Ziffern und Satzzeichen, die ersten zwei Wörter. */
export function merchantKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['zahlung', 'einkauf', 'kauf', 'twint', 'debitkarte', 'karte', 'lastschrift', 'belastung', 'gutschrift', 'ebanking', 'auftrag'].includes(w))
    .slice(0, 2)
    .join(' ');
}

/** Stabile ID, damit derselbe Export nicht doppelt importiert wird. */
export function transactionId(t: ParsedTransaction): string {
  let h = 0;
  for (const ch of `${t.date}|${t.amount}|${t.text}`) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return `t-${t.date}-${(h >>> 0).toString(36)}`;
}

export function applyRules(text: string, rules: CategoryRule[]): string | undefined {
  const t = text.toLowerCase();
  return rules.find((r) => r.match && t.includes(r.match))?.item;
}

/** Neue Buchungen übernehmen: Duplikate weglassen, Regeln anwenden. Gibt Liste und Anzahl neu übernommener zurück. */
export function mergeTransactions(existing: Transaction[], parsed: ParsedTransaction[], rules: CategoryRule[]): { list: Transaction[]; added: number } {
  const ids = new Set(existing.map((t) => t.id));
  const added: Transaction[] = [];
  for (const p of parsed) {
    const id = transactionId(p);
    if (ids.has(id)) continue;
    ids.add(id);
    added.push({ id, ...p, item: p.amount < 0 ? applyRules(p.text, rules) : undefined });
  }
  return { list: [...existing, ...added].sort((a, b) => a.date.localeCompare(b.date)), added: added.length };
}

export interface ActualRow {
  name: string;
  category: BudgetCategory;
  plan: Rappen;
  actual: Rappen;
}

export interface MonthComparison {
  rows: ActualRow[];
  planTotal: Rappen;
  actualTotal: Rappen;
  /** Ausgaben ohne Zuordnung. */
  unassigned: Rappen;
  unassignedCount: number;
  income: Rappen;
}

/** Soll/Ist für einen Monat (YYYY-MM). Ausgaben sind positiv. */
export function compareMonth(budget: BudgetItem[], transactions: Transaction[], ym: string): MonthComparison {
  const m = Number(ym.slice(5, 7)) - 1;
  const inMonth = transactions.filter((t) => t.date.startsWith(ym));
  const spentBy = new Map<string, Rappen>();
  let unassigned = 0;
  let unassignedCount = 0;
  let income = 0;
  for (const t of inMonth) {
    if (t.amount > 0) {
      income += t.amount;
      continue;
    }
    if (t.item) spentBy.set(t.item, (spentBy.get(t.item) ?? 0) - t.amount);
    else {
      unassigned -= t.amount;
      unassignedCount++;
    }
  }
  const rows: ActualRow[] = budget
    .filter((b) => !b.taxTag || b.taxTag !== 'taxProvision' || spentBy.has(b.name))
    .map((b) => ({ name: b.name, category: b.category, plan: outflowsByMonth(b)[m] ?? 0, actual: spentBy.get(b.name) ?? 0 }))
    .filter((r) => r.plan > 0 || r.actual > 0);
  // Zuordnungen zu Posten, die es im Budget nicht (mehr) gibt
  for (const [name, actual] of spentBy) {
    if (!rows.some((r) => r.name === name)) rows.push({ name, category: 'personal', plan: 0, actual });
  }
  return {
    rows,
    planTotal: sum(rows.map((r) => r.plan)),
    actualTotal: sum(rows.map((r) => r.actual)) + unassigned,
    unassigned,
    unassignedCount,
    income,
  };
}
