import catalog from '../params/brands/catalog.json';
import type { AppData, Transaction } from './types';

export interface Merchant {
  id: string;
  name: string;
  role: string;
  logo?: string;
  aliases: string[];
  requiresAny?: string[];
}
export const merchantCatalog: Merchant[] = catalog;

export function merchantText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/['’‘]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function merchantDirectory(data: Pick<AppData, 'customMerchants' | 'merchantRules'>) {
  const custom = (data.customMerchants ?? []).map(m => ({ ...m, role: 'merchant', aliases: [merchantText(m.name)] }));
  const overrides = new Map(custom.map(m => [m.id, m]));
  const known = merchantCatalog.map(m => overrides.has(m.id) ? { ...m, logo: overrides.get(m.id)!.logo ?? m.logo } : m);
  const knownIds = new Set(known.map(m => m.id));
  const local = custom.filter(m => !knownIds.has(m.id));
  const all = [...known, ...local];
  const byId = new Map(all.map(brand => [brand.id, brand]));
  const rules = new Map((data.merchantRules ?? []).map(r => [r.match, r.merchantId]));
  function find(transaction: Pick<Transaction, 'text' | 'merchantId'>) {
    const normalized = merchantText(transaction.text);
    const explicit = transaction.merchantId ?? rules.get(normalized);
    if (explicit !== undefined) return byId.get(explicit);
    if (!normalized) return undefined;
    const text = ' ' + normalized + ' ';
    const contains = (alias: string) => text.includes(' ' + alias + ' ');
    const recognized = known.find(m => m.aliases.some(contains) && (!m.requiresAny || m.requiresAny.some(contains)));
    if (recognized) return recognized;
    const candidates = local.filter(m => {
      const name = m.aliases[0]!;
      return normalized === name || (name.length >= 4 && !['cafe','restaurant','shop','store','hotel','markt'].includes(name) && contains(name));
    });
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  return { all, byId, find };
}

export function merchantRanking(rows: { transaction: Transaction; merchant?: Merchant }[], order: 'amount' | 'count') {
  const totals = new Map<string, { merchant: Merchant; count: number; amount: number }>();
  for (const { transaction, merchant } of rows) {
    if (!merchant || merchant.role !== 'merchant' || transaction.amount >= 0 || transaction.excludedFromSpend) continue;
    const row = totals.get(merchant.id) ?? { merchant, count: 0, amount: 0 };
    row.count += 1;
    row.amount -= transaction.amount;
    totals.set(merchant.id, row);
  }
  return Array.from(totals.values()).sort((a, b) =>
    (order === 'amount' ? b.amount - a.amount || b.count - a.count : b.count - a.count || b.amount - a.amount)
    || a.merchant.name.localeCompare(b.merchant.name, 'de-CH'));
}
