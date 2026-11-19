import type { Rappen } from './money';
import { expensePeriod } from './expensePeriod';
import { isExcludedFromActuals } from './importAccounts';
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
export function mergeTransactions(
  existing: Transaction[], parsed: ParsedTransaction[], rules: CategoryRule[],
  previousAccounts: Readonly<Record<string, string>> = {},
  reviewedMovements: ReadonlyMap<ParsedTransaction, boolean> = new Map(),
): { list: Transaction[]; added: number } {
  const content = (t: ParsedTransaction) => JSON.stringify([t.date, t.amount, t.text]);
  const bySource = new Map<string, number[]>();
  const olderByAccount = new Map<string, number[]>();
  const byAccount = new Map<string, number[]>();
  const bucketKey = (scope: string, row: ParsedTransaction) => JSON.stringify([scope, content(row)]);
  const add = (pool: Map<string, number[]>, key: string, index: number) => {
    const bucket = pool.get(key);
    if (bucket) bucket.push(index);
    else pool.set(key, [index]);
  };
  existing.forEach((row, index) => {
    const key = bucketKey(row.accountId ?? '', row);
    add(byAccount, key, index);
    if (row.sourceFingerprint) add(bySource, bucketKey(row.sourceFingerprint, row), index);
    else add(olderByAccount, key, index);
  });

  // Equal date, amount and memo can occur twice. Keep any existing counterparties
  // and only enrich a legacy booking when there is one row on each side.
  const repeated = new Set<string>();
  if (parsed.some(row => row.counterparty)) {
    for (const [key, indices] of byAccount) if (indices.length > 1) repeated.add(key);
    const seen = new Set<string>();
    for (const row of parsed) {
      const key = bucketKey(row.accountId ?? '', row);
      if (seen.has(key)) repeated.add(key);
      seen.add(key);
    }
  }

  const consumed = new Set<number>();
  const matched = new Map<number, number>();
  const take = (inputIndex: number, bucket?: number[]) => {
    if (matched.has(inputIndex)) return;
    while (bucket?.length) {
      const old = bucket.pop()!;
      if (consumed.has(old)) continue;
      consumed.add(old);
      matched.set(inputIndex, old);
      break;
    }
  };
  // Reserve the same physical source first. Two cards may pay the same merchant
  // the same amount on the same day, even when both belong to one logical account.
  parsed.forEach((row, i) => {
    if (row.sourceFingerprint) take(i, bySource.get(bucketKey(row.sourceFingerprint, row)));
  });
  parsed.forEach((row, i) => {
    if (!row.sourceFingerprint) return;
    const oldId = previousAccounts[row.sourceFingerprint] ?? row.accountId;
    if (oldId) take(i, olderByAccount.get(bucketKey(oldId, row)));
    if (row.accountId && row.accountId !== oldId) take(i, olderByAccount.get(bucketKey(row.accountId, row)));
  });
  parsed.forEach((row, i) => {
    if (!row.sourceFingerprint) take(i, byAccount.get(bucketKey(row.accountId ?? '', row)));
    if (row.accountId) take(i, olderByAccount.get(bucketKey('', row)));
  });

  const ids = new Set(existing.map(row => row.id));
  const list = [...existing];
  const nextSuffix = new Map<string, number>();
  let added = 0;
  parsed.forEach((row, i) => {
    const oldIndex = matched.get(i);
    if (oldIndex !== undefined) {
      const old = list[oldIndex]!;
      const freshCategory = !old.category && !old.item ? row.category : undefined;
      const counterparty = !old.counterparty && row.counterparty &&
        !repeated.has(bucketKey(old.accountId ?? '', old)) && !repeated.has(bucketKey(row.accountId ?? '', row))
        ? row.counterparty : undefined;
      const excluded = reviewedMovements.get(row);
      const reclassify = excluded !== undefined && excluded !== Boolean(old.excludedFromSpend);
      if (freshCategory || counterparty || reclassify || (row.accountId && row.accountId !== old.accountId) || (row.sourceFingerprint && !old.sourceFingerprint)) {
        const updated = { ...old, accountId: row.accountId ?? old.accountId,
          ...(freshCategory && { category: freshCategory }),
          ...(counterparty && { counterparty }),
          ...(row.sourceFingerprint && { sourceFingerprint: row.sourceFingerprint }),
          ...(row.excludedFromSpend && { excludedFromSpend: true }) };
        if (excluded === false) delete updated.excludedFromSpend;
        if (excluded === true) updated.excludedFromSpend = true;
        list[oldIndex] = updated;
      }
      return;
    }
    const scope = row.sourceFingerprint ?? row.accountId;
    const base = transactionId(row) + (scope ? '-' + scope : '');
    let id = base, suffix = nextSuffix.get(base) ?? 2;
    while (ids.has(id)) id = base + '-' + suffix++;
    nextSuffix.set(base, suffix);
    ids.add(id);
    const item = row.amount < 0 && !isExcludedFromActuals(row) ? applyRules(row.text, rules, row.category) : undefined;
    list.push({ id, ...row, ...(item ? { item } : {}) });
    added++;
  });
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
  const period = expensePeriod(budget, transactions, ym);
  return {
    rows: period.rows.map(row => ({
      name: row.name,
      category: row.category === 'other' ? 'personal' : row.category,
      plan: row.planned,
      actual: row.spent,
    })),
    planTotal: period.planned,
    actualTotal: period.spent,
    unassigned: period.unassigned,
    unassignedCount: period.entries.filter(t => !isExcludedFromActuals(t) && t.amount <= 0 && !t.item).length,
    income: period.income,
  };
}
