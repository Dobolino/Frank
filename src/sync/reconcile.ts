import type { AppData } from '../domain/types';
import type { InvestmentTransaction } from '../domain/investCsv';
import { assertDistinctImportSources, investmentSyncKeys } from './importConflicts';
import { parseAppData } from '../storage/storage';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const record = (v: Json | undefined): v is { [key: string]: Json } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function same(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v,i) => same(v,b[i]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b,k) && same(a[k], b[k]));
}

function rowKey(row: Json, field: string): string | undefined {
  if (!record(row)) return;
  if (typeof row.id === 'string') return row.id;
  if (field === 'rules' && typeof row.match === 'string') return JSON.stringify([row.field ?? 'text', row.match]);
  if (field === 'merchantRules' && typeof row.match === 'string') return row.match;
  if (field === 'wealthHistory' && typeof row.ym === 'string') return row.ym;
}

const areas: Record<string,string> = {
  accounts: 'Konten', importAccounts: 'Importkonten', transactions: 'Buchungen', investmentTransactions: 'Depotbuchungen',
  investments: 'Anlagen', wealthHistory: 'Vermögensverlauf', profile: 'Profil', goals: 'Sparziele',
  settings: 'Einstellungen', merchantRules: 'Händlerregeln', customMerchants: 'Eigene Händler', rules: 'Budgetzuordnung',
  activeYear: 'Jahresauswahl', accountRecognition: 'CSV-Kontozuordnungen',
};

export function reconcile(base: AppData, local: AppData, peer: AppData, preference: 'local' | 'peer' = 'local') {
  assertDistinctImportSources(base,local,peer);
  const conflicts = new Set<string>();
  const merge = (ancestor: Json | undefined, a: Json | undefined, b: Json | undefined, path: string[]): Json | undefined => {
    if (same(a,b) || same(ancestor,b)) return a;
    if (same(ancestor,a)) return b;
    if (path.length === 1 && path[0] === 'accountRecognition' && record(a) && record(b) && a.key !== b.key) {
      conflicts.add('CSV-Kontozuordnungen');
      return preference === 'local' ? a : b;
    }
    if (record(a) && record(b) && (record(ancestor) || ancestor === undefined)) {
      const entries: [string,Json][] = [];
      const parent = ancestor ?? {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(parent)])) {
        const get = (v: typeof parent) => Object.hasOwn(v,key) ? v[key] : undefined;
        const next = merge(get(parent), get(a), get(b), [...path, key]);
        if (next !== undefined) entries.push([key,next]);
      }
      return Object.fromEntries(entries);
    }
    if (Array.isArray(a) && Array.isArray(b) && (Array.isArray(ancestor) || ancestor === undefined)) {
      const field = path.at(-1) ?? '';
      const keyed = (rows: Json[]) => {
        if (field === 'investmentTransactions') {
          // All three snapshots have already passed parseAppData, including booking validation.
          const keys = investmentSyncKeys(rows as unknown as InvestmentTransaction[]);
          return keys && new Map(rows.map((row,i) => [keys[i]!, row]));
        }
        const result = new Map<string,Json>();
        for (const row of rows) {
          const key = rowKey(row, field);
          if (key === undefined || result.has(key)) return;
          result.set(key,row);
        }
        return result;
      };
      const old = keyed(ancestor ?? []), left = keyed(a), right = keyed(b);
      if (old && left && right) {
        const list: Json[] = [];
        for (const id of new Set([...left.keys(), ...right.keys()])) {
          const row = merge(old.get(id), left.get(id), right.get(id), path);
          if (row !== undefined) list.push(row);
        }
        return list;
      }
    }
    const group = path[0] ?? '';
    conflicts.add(group === 'years' ? 'Jahresplan ' + path[1] : areas[group] ?? 'Importeinstellungen');
    return preference === 'local' ? a : b;
  };
  const json = (data: AppData): Json => JSON.parse(JSON.stringify(data));
  const result = merge(json(base),json(local),json(peer),[]);
  // A deleted account on one device may still be referenced by a new booking on the other.
  // Only valid complete financial records can be proposed.
  return { data: parseAppData(JSON.stringify(result)), conflicts: [...conflicts] };
}
