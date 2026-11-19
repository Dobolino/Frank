import { describe, expect, it } from 'vitest';
import { confirmTransfer, confirmedTransfers, transferSuggestions, unlinkTransfer } from '../src/domain/accountTransfers';
import type { ImportAccount, Transaction } from '../src/domain/types';
import { demoData } from '../src/seed/demo';

const bank = (id: string, type: ImportAccount['type'] = 'bank'): ImportAccount =>
  ({ id, name: id, type, bankId: 'other' });
const accounts = [bank('alltag'), bank('sparen'), bank('karte', 'card')];
const outgoing: Transaction = {
  id: 'debit', accountId: 'alltag', amount: -12345, date: '2026-03-14',
  text: 'Feldgarten A. CH', category: 'Andere Transaktionen',
};
const incoming: Transaction = {
  id: 'credit', accountId: 'sparen', amount: 12345, date: outgoing.date,
  text: 'Überweisung von Feldgarten Ada',
};

function stored(...rows: Transaction[]) {
  const data = demoData();
  data.importAccounts = structuredClone(accounts);
  data.transactions = structuredClone(rows);
  return data;
}

describe('Umbuchungen zwischen eigenen Konten', () => {
  it('erkennt beschriftete Altbuchungen auch bei abgekürztem Namen und ausschliesslich mit passendem Bankkonto', () => {
    const card = { ...incoming, accountId: 'karte', id: 'card' };
    const data = stored(card, incoming, outgoing);
    const pairs = transferSuggestions(data);
    expect(pairs).toEqual([{ incoming, outgoing }]);
    expect(confirmedTransfers(data)).toEqual([]);
    expect(data.transactions).toEqual([card, incoming, outgoing]);
  });

  it('verwendet erhaltene Gegenparteien und unterscheidet Konten derselben Bank', () => {
    const transfer = { ...incoming, text: 'Eingang', counterparty: 'Feldgarten Ada' };
    expect(transferSuggestions(stored(outgoing, transfer))).toHaveLength(1);
    expect(transferSuggestions(stored(outgoing, { ...transfer, counterparty: 'Beispielfirma AG' }))).toHaveLength(0);
    expect(transferSuggestions(stored(outgoing, { ...transfer, accountId: 'alltag' }))).toHaveLength(0);
  });

  it('stellt Belastung und Gutschrift in beiden Überweisungsrichtungen richtig dar', () => {
    const bankCredit = { ...outgoing, amount: 12345, category: 'Andere Einnahmen', text: 'Ada Feldgarten' };
    const bankDebit = { ...incoming, amount: -12345, text: 'Überweisung an Féldgarten Ada' };
    expect(transferSuggestions(stored(bankCredit, bankDebit))).toEqual([{ outgoing: bankDebit, incoming: bankCredit }]);
  });

  it('erfordert Gegenrichtung, taggleichen Betrag, passende Belege und zwei identifizierte Konten', () => {
    const overrides: Partial<Transaction>[] = [
      { amount: 12344 }, { amount: -12345 }, { date: '2026-03-15' },
      { accountId: undefined }, { accountId: 'nicht vorhanden' }, { accountId: 'karte' },
      { text: 'Vorname Familienname' }, { text: 'Überweisung an Beispielfirma' },
      { text: incoming.text, merchantId: 'test-shop' },
    ];
    for (const change of overrides) {
      expect(transferSuggestions(stored(outgoing, { ...incoming, ...change }))).toEqual([]);
    }
    const noMarker = stored({ ...outgoing, text: 'Feldgarten Ada' }, { ...incoming, text: 'Feldgarten Ada' });
    expect(transferSuggestions(noMarker)).toEqual([]);
    const onlyBank = stored({ ...outgoing, text: 'Online Banking Swissquote Schweiz' }, { ...incoming, text: 'Zahlung Swissquote Schweiz' });
    expect(transferSuggestions(onlyBank)).toEqual([]);
    const onlyCity = stored({ ...outgoing, text: 'Erstmuster Testwil' }, { ...incoming, text: 'Zahlung Zweitmuster Testwil' });
    expect(transferSuggestions(onlyCity)).toEqual([]);
  });

  it('klammert Töpfe, Käufe, Kartenabrechnungen, Fremdwährungswechsel, Lohn und Rückerstattungen von Vorschlägen aus', () => {
    for (const category of ['Kreditkartenabrechnungen', 'Sparziel-Überträge', 'Lohn & Renten', 'Lebensmittel', 'Währungswechsel']) {
      expect(transferSuggestions(stored({ ...outgoing, category }, incoming))).toEqual([]);
    }
    for (const prefix of ['Kartenzahlung', 'Rückerstattung', 'Dividende', 'Lohn', 'TWINT']) {
      expect(transferSuggestions(stored({ ...outgoing, text: prefix + ' Feldgarten Ada' }, incoming))).toEqual([]);
    }
  });

  it('zeigt bei mehrdeutiger Belastung oder Gutschrift keinen Vorschlag und prüft erneut bei Bestätigung', () => {
    for (const duplicate of [incoming, outgoing]) {
      const data = stored(outgoing, incoming);
      expect(transferSuggestions(data)).toHaveLength(1);
      data.transactions!.push({ ...duplicate, id: 'double' });
      expect(transferSuggestions(data)).toEqual([]);
      expect(confirmTransfer(data, outgoing.id, incoming.id)).toBe(false);
      expect(confirmedTransfers(data)).toEqual([]);
    }
  });

  it('verlinkt und löst beide Seiten gemeinsam und behält unabhängige Klassifizierungen bei', () => {
    const existing = { ...outgoing, category: 'Kontoüberträge', item: 'Mein Sparplan', excludedFromSpend: true };
    const data = stored(existing, incoming);
    expect(confirmTransfer(data, 'credit', 'debit')).toBe(false);
    expect(confirmTransfer(data, 'debit', 'credit')).toBe(true);
    expect(data.transactions!.map(t => t.transferPeerId)).toEqual(['credit', 'debit']);
    expect(transferSuggestions(data)).toEqual([]);
    expect(confirmedTransfers(data)).toHaveLength(1);
    expect(confirmTransfer(data, 'debit', 'credit')).toBe(false);
    expect(unlinkTransfer(data, 'debit', 'falsche-buchung')).toBe(false);
    expect(unlinkTransfer(data, 'debit', 'credit')).toBe(true);
    expect(unlinkTransfer(data, 'debit', 'credit')).toBe(false);
    expect(data.transactions).toEqual([existing, incoming]);
    expect(transferSuggestions(data)).toHaveLength(1);
  });
});
