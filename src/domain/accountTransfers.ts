import type { AppData, Transaction } from './types';

export interface TransferPair {
  outgoing: Transaction;
  incoming: Transaction;
}

function normalized(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Only unspecific bank categories and transfer categories are candidates. A wage,
// purchase, card bill or Yuh savings pot already has a different explanation.
const transferCategories = new Set([
  'kontoubertrag', 'kontoubertrage', 'eigener ubertrag', 'umbuchung', 'ubertrag', 'ubertrage',
  'uberweisung', 'transfer', 'transfers', 'virement', 'bonifico',
]);
const openCategories = new Set([
  '', 'andere transaktionen', 'andere einnahmen', 'andere ausgaben', 'nicht kategorisiert',
  'sonstiges', 'unkategorisiert', 'ersparnisse anlagen', 'other', 'uncategorized',
]);
const paymentLabel = /\b(?:uberweisung|ueberweisung|bankubertrag|kontoubertrag|umbuchung|virement|bonifico|transfer|payment|zahlung|auftrag)\b/;
const unrelated = /\b(?:refund\w*|ruckerstattung\w*|ruckzahlung\w*|remboursement\w*|erstattung\w*|storno\w*|chargeback|kartenzahlung\w*|karteneinkauf\w*|kreditkartenabrechnung\w*|debitkarte\w*|bargeld\w*|card|twint|lohn\w*|gehalt\w*|salary|salaire|dividende\w*|zins\w*|sparziel\w*|wahrungswechsel)\b/;
const genericWords = new Set((
  'uberweisung ueberweisung bankubertrag kontoubertrag umbuchung ubertrag auftrag dauerauftrag ' +
  'transfer transferred payment payments paiement virement virements bonifico zahlung zahlungen zahlungseingang ' +
  'zahlungsausgang eingang ausgang einzahlung auszahlung gutschrift belastung incoming outgoing order sepa instant ' +
  'credit debit ebanking online banking bankingapp mobile automatisch automatic eigene eigenen eigenes eigener eigen ' +
  'mein meine intern interne internal compte conto konto kontos account accounts bank banque banker epargne savings ' +
  'sparkonto privatkonto lohnkonto empfaenger empfanger absender recipient sender begunstigter von vom nach an from ' +
  'reference referenz mitteilung zweck betreff mitteilungstext details sparplan standard private personal interstate interbank geld buchung finanz financial suisse schweiz switzerland ' +
  'svizzera ag gmbh limited group service services schweizerische chf eur euro usd francs mastercard visa ' +
  'ubs yuh swissquote postfinance raiffeisen kantonalbank migrosbank viseca'
).split(' '));

interface Evidence {
  row: Transaction;
  words: Set<string>;
  payment: boolean;
  firstWord: string;
}

function evidence(row: Transaction): Evidence | undefined {
  const category = normalized(row.category ?? '');
  const transferCategory = transferCategories.has(category);
  if (row.merchantId || (!transferCategory && !openCategories.has(category))) return;
  const description = normalized(row.text);
  if (unrelated.test(description)) return;
  // SENDER/RECIPIENT, when supplied, identifies the party more precisely than
  // a description. Older imports only have the description.
  const counterparty = normalized(row.counterparty ?? '');
  const words = (counterparty || description).split(' ').filter(word =>
    word.length >= 3 && /\p{L}/u.test(word) && !/^[x\d]+$/.test(word) && !genericWords.has(word));
  const firstWord = words[0];
  if (!firstWord) return;
  return { row, words: new Set(words), firstWord, payment: !!counterparty || transferCategory || paymentLabel.test(description) };
}

function corroborated(a: Evidence, b: Evidence): boolean {
  if (a.row.accountId === b.row.accountId || !(a.payment || b.payment)) return false;
  let matches = 0;
  for (const word of a.words) {
    if (!b.words.has(word)) continue;
    // A lone city/address word later in both descriptions is weak evidence.
    if (word.length >= 5 && (word === a.firstWord || word === b.firstWord)) return true;
    if (++matches >= 2) return true;
  }
  return false;
}

const newestFirst = (a: TransferPair, b: TransferPair) => b.outgoing.date.localeCompare(a.outgoing.date);

/** The transaction store contains CHF in integer Rappen. A possible transfer
 * needs two distinct bank accounts, opposite amounts and independent text evidence.
 * Candidates must be unique in both directions before they reach the review UI. */
export function transferSuggestions(data: AppData): TransferPair[] {
  const banks = new Set(data.importAccounts?.filter(account => account.type === 'bank').map(account => account.id));
  if (banks.size < 2) return [];

  const byDateAndAmount = new Map<string, Evidence[]>();
  const entries: Evidence[] = [];
  for (const row of data.transactions ?? []) {
    if (row.transferPeerId || !row.amount || !row.accountId || !banks.has(row.accountId)) continue;
    const entry = evidence(row);
    if (!entry) continue;
    entries.push(entry);
    const key = row.date + ':' + row.amount;
    const bucket = byDateAndAmount.get(key);
    if (bucket) bucket.push(entry);
    else byDateAndAmount.set(key, [entry]);
  }

  const unique = new Map<string, Transaction>();
  for (const entry of entries) {
    const { row } = entry;
    const opposite = byDateAndAmount.get(row.date + ':' + -row.amount);
    if (!opposite) continue;
    let peer: Transaction | undefined;
    for (const candidate of opposite) {
      if (!corroborated(entry, candidate)) continue;
      if (peer) { peer = undefined; break; }
      peer = candidate.row;
    }
    if (peer) unique.set(row.id, peer);
  }
  const pairs: TransferPair[] = [];
  for (const { row } of entries) {
    if (row.amount > 0) continue;
    const peer = unique.get(row.id);
    if (peer && unique.get(peer.id) === row) pairs.push({ outgoing: row, incoming: peer });
  }
  return pairs.sort(newestFirst);
}

export function confirmedTransfers(data: AppData): TransferPair[] {
  const rows = data.transactions ?? [];
  const byId = new Map(rows.map(row => [row.id, row]));
  const pairs: TransferPair[] = [];
  for (const outgoing of rows) {
    if (outgoing.amount >= 0 || !outgoing.transferPeerId) continue;
    const incoming = byId.get(outgoing.transferPeerId);
    if (incoming?.transferPeerId === outgoing.id) pairs.push({ outgoing, incoming });
  }
  return pairs.sort(newestFirst);
}

/** Recheck on the current draft so a stale preview can never link ambiguous legs. */
export function confirmTransfer(data: AppData, outgoingId: string, incomingId: string): boolean {
  const pair = transferSuggestions(data).find(p => p.outgoing.id === outgoingId && p.incoming.id === incomingId);
  if (!pair) return false;
  pair.outgoing.transferPeerId = pair.incoming.id;
  pair.incoming.transferPeerId = pair.outgoing.id;
  return true;
}

export function unlinkTransfer(data: AppData, outgoingId: string, incomingId: string): boolean {
  const pair = confirmedTransfers(data).find(p => p.outgoing.id === outgoingId && p.incoming.id === incomingId);
  if (!pair) return false;
  delete pair.outgoing.transferPeerId;
  delete pair.incoming.transferPeerId;
  return true;
}
