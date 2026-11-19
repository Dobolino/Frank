import { bankOptions } from '../domain/importAccounts';
import { investmentFingerprint, type InvestmentTransaction } from '../domain/investCsv';
import type { AppData } from '../domain/types';

export class ImportSourceConflict extends Error {
  constructor() {
    super('Möglicherweise wurde derselbe Auszug auf beiden Geräten importiert. Wähle einen vollständigen Datenstand, damit keine Buchung doppelt zählt.');
    this.name = 'ImportSourceConflict';
  }
}

/** An explicit broker ID identifies a fill within a depot. Every anonymous
 * occurrence in the same export is kept, even with identical price and quantity. */
export function investmentSyncKeys(rows: readonly InvestmentTransaction[]): string[] | undefined {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  for (const tx of rows) {
    const key = tx.brokerId
      ? JSON.stringify([tx.accountId, 'id', tx.brokerId])
      : JSON.stringify([tx.accountId, 'fill', investmentFingerprint(tx)]);
    const ordinal = counts.get(key) ?? 0;
    if (tx.brokerId && ordinal > 0) return undefined;
    counts.set(key, ordinal + 1);
    keys.push(tx.brokerId ? key : JSON.stringify([key, ordinal]));
  }
  return keys;
}

interface Evidence { anonymous: number; brokerIds: Set<string> }

interface Side {
  sourceIds: Map<string, Set<string>>;
  banks: Map<string, string>;
  // Content of new bookings, without the potentially device-specific account ID.
  bookings: Map<string, Map<string, Evidence>>;
}

const knownBanks = new Set(bankOptions.map(b => b.value));

function changes(base: AppData, current: AppData): Side {
  const side: Side = { sourceIds: new Map(), banks: new Map(), bookings: new Map() };
  for (const account of current.importAccounts ?? []) {
    if (knownBanks.has(account.bankId)) side.banks.set(account.id, account.bankId);
  }
  for (const [fingerprint, id] of Object.entries(current.accountRecognition?.bindings ?? {})) {
    const sources = side.sourceIds.get(id) ?? new Set<string>();
    sources.add(fingerprint);
    side.sourceIds.set(id, sources);
  }
  const addBooking = (content: string, id: string, brokerId?: string) => {
    const accounts = side.bookings.get(content) ?? new Map<string, Evidence>();
    const evidence = accounts.get(id) ?? { anonymous: 0, brokerIds: new Set<string>() };
    if (brokerId) evidence.brokerIds.add(brokerId);
    else evidence.anonymous++;
    accounts.set(id, evidence);
    side.bookings.set(content, accounts);
  };
  const previousRows = new Map(base.transactions?.map(t => [t.id, t.accountId]));
  for (const tx of current.transactions ?? []) {
    if (previousRows.has(tx.id) && previousRows.get(tx.id) === tx.accountId) continue;
    addBooking(JSON.stringify(['bank', tx.date, tx.amount, tx.text]), tx.accountId ?? '');
  }
  const trades = current.investmentTransactions ?? [];
  const previousTradeKeys = investmentSyncKeys(base.investmentTransactions ?? []), tradeKeys = investmentSyncKeys(trades);
  if (!tradeKeys || !previousTradeKeys) {
    if (JSON.stringify(trades) !== JSON.stringify(base.investmentTransactions ?? [])) throw new ImportSourceConflict();
    return side;
  }
  const previous = new Set(previousTradeKeys);
  trades.forEach((tx, i) => {
    if (!previous.has(tradeKeys[i]!)) addBooking('trade:' + investmentFingerprint(tx), tx.accountId, tx.brokerId);
  });
  return side;
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  for (const entry of a) if (b.has(entry)) return true;
  return false;
}

/** The same previously unlinked statement can create two account IDs. A
 * row-wise merge would keep both copies. Fail before proposing such a merge. */
export function assertDistinctImportSources(base: AppData, local: AppData, peer: AppData): void {
  const leftRecognition = local.accountRecognition, rightRecognition = peer.accountRecognition;
  const sharedKey = leftRecognition !== undefined && leftRecognition.key === rightRecognition?.key;
  if (sharedKey) {
    const old = base.accountRecognition?.key === leftRecognition.key ? base.accountRecognition.bindings : {};
    for (const [fingerprint, leftId] of Object.entries(leftRecognition.bindings)) {
      const rightId = rightRecognition.bindings[fingerprint];
      if (rightId && leftId !== rightId && old[fingerprint] !== leftId && old[fingerprint] !== rightId) {
        throw new ImportSourceConflict();
      }
    }
  }
  const left = changes(base, local), right = changes(base, peer);
  const oldAccounts = new Set(base.importAccounts?.map(a => a.id));
  for (const [content, accounts] of left.bookings) {
    const otherAccounts = right.bookings.get(content);
    if (!otherAccounts) continue;
    for (const [a, aEvidence] of accounts) {
      for (const [b, bEvidence] of otherAccounts) {
        if (a === b) {
          // Re-exports can add broker IDs to previously anonymous fills.
          // Combining those rows by key would create an extra fill.
          const aHasExtraIds = [...aEvidence.brokerIds].some(id => !bEvidence.brokerIds.has(id));
          const bHasExtraIds = [...bEvidence.brokerIds].some(id => !aEvidence.brokerIds.has(id));
          if ((aEvidence.anonymous > bEvidence.anonymous && bHasExtraIds) ||
              (bEvidence.anonymous > aEvidence.anonymous && aHasExtraIds)) {
            throw new ImportSourceConflict();
          }
          continue;
        }
        if (!aEvidence.anonymous && !bEvidence.anonymous && !intersects(aEvidence.brokerIds, bEvidence.brokerIds)) continue;
        const aIds = left.sourceIds.get(a), bIds = right.sourceIds.get(b);
        if (sharedKey && aIds?.size && bIds?.size) {
          if (intersects(aIds, bIds)) throw new ImportSourceConflict();
          continue;
        }
        // Account IDs inherited from the same checkpoint already distinguish
        // these accounts. Two independently created IDs do not.
        if (oldAccounts.has(a) && oldAccounts.has(b)) continue;
        const bankA = left.banks.get(a), bankB = right.banks.get(b);
        if (bankA && bankB && bankA !== bankB) continue;
        throw new ImportSourceConflict();
      }
    }
  }
}
