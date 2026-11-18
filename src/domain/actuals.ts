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

/** Zuerst Händler-Regeln auf dem Text, dann Regeln auf der Bank-Kategorie. */
export function applyRules(text: string, rules: CategoryRule[], category?: string): string | undefined {
  const t = text.toLowerCase();
  const byText = rules.find((r) => r.field !== 'category' && r.match && t.includes(r.match))?.item;
  if (byText) return byText;
  const c = category?.trim().toLowerCase();
  return c ? rules.find((r) => r.field === 'category' && r.match === c)?.item : undefined;
}

/** Neue Buchungen übernehmen: Duplikate weglassen, Regeln anwenden. Gibt Liste und Anzahl neu übernommener zurück. */
export function mergeTransactions(existing: Transaction[], parsed: ParsedTransaction[], rules: CategoryRule[]): { list: Transaction[]; added: number } {
  const identity = (t: ParsedTransaction) => JSON.stringify([t.date, t.amount, t.text]);
  const key = (t: ParsedTransaction) => JSON.stringify([t.accountId ?? '', identity(t)]);
  const storedCounts = new Map<string, number>();
  const legacyRows = new Map<string, number[]>();
  const ids = new Set(existing.map(t => t.id));
  const list = [...existing];
  for (const [index, t] of existing.entries()) {
    storedCounts.set(key(t), (storedCounts.get(key(t)) ?? 0) + 1);
    if (!t.accountId) {
      const same = legacyRows.get(identity(t)) ?? [];
      same.push(index);
      legacyRows.set(identity(t), same);
    }
  }
  const seen = new Map<string, number>();
  let added = 0;
  for (const p of parsed) {
    const k = key(p);
    const count = (seen.get(k) ?? 0) + 1;
    seen.set(k, count);
    if (count <= (storedCounts.get(k) ?? 0)) continue;
    const legacy = p.accountId ? legacyRows.get(identity(p))?.pop() : undefined;
    if (legacy !== undefined) {
      list[legacy] = { ...list[legacy]!, accountId: p.accountId, ...(p.excludedFromSpend && { excludedFromSpend: true }) };
      continue;
    }
    const base = transactionId(p) + (p.accountId ? '-' + p.accountId : '');
    let id = base, suffix = count;
    while (ids.has(id)) id = base + '-' + suffix++;
    ids.add(id);
    const item = p.amount < 0 && !p.excludedFromSpend ? applyRules(p.text, rules, p.category) : undefined;
    list.push({ id, ...p, ...(item ? { item } : {}) });
    added++;
  }
  return { list: list.sort((a, b) => a.date.localeCompare(b.date)), added };
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
  const inMonth = transactions.filter((t) => !t.excludedFromSpend && t.date.startsWith(ym));
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
