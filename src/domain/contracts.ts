import { dueMonths, itemAmount } from './budgetEngine';
import { merchantDirectory, merchantText } from './merchants';
import { uid } from '../seed/builders';
import type { AppData, BudgetItem, Month, Transaction } from './types';

export const CONTRACT_KINDS = ['Wohnen', 'Versicherungen', 'Kredite', 'Abos'] as const;
export type ContractKind = typeof CONTRACT_KINDS[number];

function kindFromLabel(label: string): ContractKind | undefined {
  const value = merchantText(label);
  if (/\b(miet(?:e|zins|vertrag)|wohnungsmiete|hausverwaltung|regimo)\b/.test(value)) return 'Wohnen';
  if (/versicherung|krankenkasse|haftpflicht|\b(sanitas|helsana|swica|css versicherung|groupe mutuel)\b/.test(value)) return 'Versicherungen';
  if (/leasing|kreditrate|darlehen|hypothek/.test(value)) return 'Kredite';
  if (/\b(abo|abos|abonnement|mitgliedschaft|fitnesscenter|streaming|handy|internet|mobilfunk|netflix|spotify|swisscom|yallo|sunrise)\b/.test(value)) return 'Abos';
  return undefined;
}

const eligible = (tx: Transaction) => tx.amount < 0 && !tx.excludedFromSpend;

export function plannedContracts(budget: BudgetItem[], transactions: Transaction[], year: number) {
  const byItem = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (!eligible(tx) || !tx.item || !tx.date.startsWith(year + '-')) continue;
    const matches = byItem.get(tx.item) ?? [];
    matches.push(tx);
    byItem.set(tx.item, matches);
  }
  return budget.flatMap(item => {
    if (item.category === 'savings' || item.amount < 0) return [];
    // Assignments store the displayed item name. Two identically named items
    // cannot be distinguished reliably in an imported transaction.
    const matches = budget.filter(x => x.name === item.name).length === 1 ? byItem.get(item.name) ?? [] : [];
    const group = item.taxTag === 'insurance' ? 'Versicherungen' : kindFromLabel(item.name)
      ?? matches.map(t => kindFromLabel((t.category ?? '') + ' ' + t.text)).find(Boolean);
    if (!group) return [];
    const latest = matches.reduce((ym, tx) => tx.date.slice(0, 7) > ym ? tx.date.slice(0, 7) : ym, '');
    const paid = matches.filter(tx => tx.date.startsWith(latest)).reduce((sum, tx) => sum - tx.amount, 0);
    const expected = dueMonths(item.frequency).includes(Number(latest.slice(-2)) as Month) ? itemAmount(item) : 0;
    return [{ item, group, latest, paid, expected }];
  });
}

export interface RecurringSuggestion {
  id: string;
  name: string;
  kind: ContractKind;
  amount: number;
  first: string;
  last: string;
  count: number;
  bookingIds: string[];
  accountId?: string;
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));

export function recurringSuggestions(data: AppData, year: number): RecurringSuggestion[] {
  const directory = merchantDirectory(data);
  const groups = new Map<string, { name: string; kind: ContractKind; transactions: Transaction[] }>();
  for (const tx of data.transactions ?? []) {
    if (!eligible(tx) || Number(tx.date.slice(0, 4)) > year) continue;
    const merchant = directory.find(tx);
    if (merchant && merchant.role !== 'merchant') continue;
    const kind = kindFromLabel((merchant?.name ?? '') + ' ' + tx.text + ' ' + (tx.category ?? ''));
    const name = merchant?.name || tx.text.trim();
    if (!kind || !name) continue;
    const key = JSON.stringify([tx.accountId ?? '', merchant?.id ?? merchantText(name)]);
    const group = groups.get(key) ?? { name, kind, transactions: [] };
    group.transactions.push(tx);
    groups.set(key, group);
  }
  const suggestions: RecurringSuggestion[] = [];
  for (const group of groups.values()) {
    const byMonth = new Map<number, Transaction[]>();
    for (const tx of group.transactions) {
      const month = monthIndex(tx.date);
      const matches = byMonth.get(month) ?? [];
      matches.push(tx);
      byMonth.set(month, matches);
    }
    const lastMonth = Array.from(byMonth.keys()).reduce((a, b) => Math.max(a, b));
    const last = byMonth.get(lastMonth)![0]!;
    if (Number(last.date.slice(0, 4)) !== year) continue;
    const series: Transaction[] = [];
    for (let m = lastMonth; byMonth.has(m); m--) {
      const matches = byMonth.get(m)!;
      const tx = matches[0]!;
      if (matches.length !== 1 || tx.amount !== last.amount || tx.item) break;
      if (Math.abs(Number(tx.date.slice(-2)) - Number(last.date.slice(-2))) > 6) break;
      series.push(tx);
    }
    if (series.length < 3) continue;
    suggestions.push({
      id: last.id, name: group.name, kind: group.kind, amount: -last.amount, count: series.length,
      first: series[series.length - 1]!.date, last: last.date, accountId: last.accountId,
      bookingIds: series.filter(tx => Number(tx.date.slice(0, 4)) === year).map(tx => tx.id),
    });
  }
  return suggestions.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'de-CH'));
}

/** Commit only the reviewed series. Existing assignments and other years stay intact. */
export function acceptContractSuggestion(data: AppData, year: number, suggestion: RecurringSuggestion, targetId: string, newName: string) {
  const plan = data.years[String(year)];
  if (!plan) return false;
  const ids = new Set(suggestion.bookingIds);
  const payments = (data.transactions ?? []).filter(tx => ids.has(tx.id) && !tx.item && eligible(tx) && tx.date.startsWith(year + '-'));
  if (!payments.length) return false;
  let item = plan.budget.find(b => b.id === targetId);
  if (targetId === 'new') {
    const name = newName.trim();
    if (!name || plan.budget.some(b => merchantText(b.name) === merchantText(name))) return false;
    item = { id: uid('b'), category: 'fixed', name, amount: suggestion.amount, frequency: { kind: 'monthly' } };
    plan.budget.push(item);
  }
  if (!item || plan.budget.filter(b => b.name === item.name).length !== 1) return false;
  for (const tx of payments) tx.item = item.name;
  return true;
}
