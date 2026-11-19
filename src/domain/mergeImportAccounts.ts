import { investmentFingerprint } from './investCsv';
import type { AppData, ImportAccount } from './types';

export const canMergeImportAccounts = (a: ImportAccount, b: ImportAccount) =>
  a.id !== b.id && (a.type === 'depot') === (b.type === 'depot');

export function previewAccountMerge(data: AppData, targetId: string, sourceIds: readonly string[]) {
  const target = data.importAccounts?.find(a => a.id === targetId);
  if (!target || !sourceIds.length) throw new Error('Wähle das Ziel und mindestens ein weiteres Konto.');
  const sources = new Set(sourceIds);
  const accounts = data.importAccounts?.filter(a => sources.has(a.id)) ?? [];
  if (sources.size !== accounts.length || accounts.some(a => !canMergeImportAccounts(a, target))) {
    throw new Error('Wähle passende Bank- und Kartenkonten oder zwei Depots aus.');
  }
  const bindings = Object.entries(data.accountRecognition?.bindings ?? {});
  const moves = (data.transactions ?? []).filter(t => t.accountId && sources.has(t.accountId)).length;
  const trades = (data.investmentTransactions ?? []).filter(t => sources.has(t.accountId)).length;
  const links = bindings.filter(([,id]) => sources.has(id)).length;
  const sharedTrades = new Set<number>();

  if (target.type === 'depot') {
    // Retain the original target fill in preference to an equivalent copy from a source.
    const seen = new Map<string, string>();
    const fills = data.investmentTransactions ?? [];
    for (const fill of fills) {
      if (fill.accountId === target.id && fill.brokerId) seen.set(fill.brokerId, investmentFingerprint(fill));
    }
    fills.forEach((fill,index) => {
      if (!sources.has(fill.accountId) || !fill.brokerId) return;
      const fingerprint = investmentFingerprint(fill);
      const existing = seen.get(fill.brokerId);
      if (existing !== undefined) {
        if (existing !== fingerprint) throw new Error('Die Depots enthalten dieselbe Broker-ID mit verschiedenen Buchungsdaten. Prüfe zuerst die Auszüge.');
        sharedTrades.add(index);
      } else seen.set(fill.brokerId, fingerprint);
    });
  }
  return { moves, trades, links, sharedTrades };
}

/** Move all references in one store update. Bank rows keep their original IDs, assignments and multiplicity. */
export function mergeImportAccounts(data: AppData, targetId: string, sourceIds: readonly string[]) {
  const { sharedTrades } = previewAccountMerge(data, targetId, sourceIds);
  const sources = new Set(sourceIds);
  const affected = new Set([targetId, ...sources]);
  const bindings = data.accountRecognition?.bindings ?? {};
  // Once several statement sources are linked to one account, historical rows can
  // only be attributed before the move, and only for a single known source.
  const unique = new Map<string, string | null>();
  for (const [fingerprint,id] of Object.entries(bindings)) {
    if (affected.has(id)) unique.set(id, unique.has(id) ? null : fingerprint);
  }
  for (const row of data.transactions ?? []) {
    if (!row.accountId || !affected.has(row.accountId)) continue;
    const original = unique.get(row.accountId);
    if (!row.sourceFingerprint && original) row.sourceFingerprint = original;
    row.accountId = targetId;
  }
  if (data.investmentTransactions && (sharedTrades.size || data.investmentTransactions.some(t => sources.has(t.accountId)))) {
    data.investmentTransactions = data.investmentTransactions.filter((_,index) => !sharedTrades.has(index));
    for (const trade of data.investmentTransactions) if (sources.has(trade.accountId)) trade.accountId = targetId;
  }
  for (const [fingerprint,id] of Object.entries(bindings)) {
    if (sources.has(id)) bindings[fingerprint] = targetId;
  }
  data.importAccounts = data.importAccounts!.filter(a => !sources.has(a.id));
}
