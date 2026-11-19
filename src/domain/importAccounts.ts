import type { ImportAccount, Transaction } from './types';

const banks: Record<string, string> = {
  ubs: 'UBS', yuh: 'Yuh', swissquote: 'Swissquote', postfinance: 'PostFinance', raiffeisen: 'Raiffeisen',
  zkb: 'Zürcher Kantonalbank', bkb: 'Basler Kantonalbank', migrosbank: 'Migros Bank', viseca: 'Viseca',
};

export function bankLogoPath(id: string): string | undefined {
  if (!Object.hasOwn(banks, id)) return undefined;
  const folder = ['bkb', 'migrosbank', 'viseca'].includes(id) ? 'merchants' : 'banks';
  return `${folder}/${id}.png`;
}
export const bankOptions = Object.entries(banks).map(([value, label]) => ({ value, label }));
export const bankLabel = (id: string) => Object.hasOwn(banks, id) ? banks[id]! : id;
export const accountTypeLabel = (type: ImportAccount['type']) => ({ bank: 'Bankkonto', card: 'Kartenkonto', depot: 'Depot' })[type];
export function accountDisplayName(account: ImportAccount): string {
  return account.lastFour ? `${account.name} · •••• ${account.lastFour}` : account.name;
}

/** A transfer link and the import classification can be undone independently. */
export function isExcludedFromActuals(tx: Pick<Transaction, 'transferPeerId' | 'excludedFromSpend'>) {
  return Boolean(tx.transferPeerId || tx.excludedFromSpend);
}

/** Changing account assignments can put both sides of a former transfer on the same account. */
export function collapsedTransferIds(transactions: Transaction[], accountOf = (tx: Transaction) => tx.accountId) {
  const linked = new Map(transactions.filter(tx => tx.transferPeerId).map(tx => [tx.id, tx]));
  const ids = new Set<string>();
  for (const tx of linked.values()) {
    const peer = linked.get(tx.transferPeerId!);
    if (peer && accountOf(tx) === accountOf(peer)) {
      ids.add(tx.id);
      ids.add(peer.id);
    }
  }
  return ids;
}

export function sourceLabel(source: string, index: number) {
  const tail = source.replace(/\s+/g, '').match(/\d{4}$/)?.[0];
  return source ? `Quelle ${index + 1}${tail ? ' · •••• ' + tail : ''}` : 'Konto für diesen Auszug';
}
export function movementType(category = '', text = '') {
  const key = category.trim().toLowerCase();
  if (['kontoüberträge', 'kontoübertrag', 'eigener übertrag', 'umbuchung'].includes(key)) return 'Überträge';
  if (key === 'kreditkartenabrechnungen' || /\bkreditkartenabrechnung\b/i.test(text)) return 'Kartenabrechnungen';
  if (key === 'bargeldbezüge' || /\bbargeldbezug\b/i.test(text)) return 'Bargeldbezüge';
  return undefined;
}
