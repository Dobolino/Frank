import { describe, expect, it } from 'vitest';
import { mergeTransactions, transactionId } from '../src/domain/actuals';
import { guessColumns, parseCsv, toTransactions } from '../src/domain/bankCsv';

const header = 'DATE;ACTIVITY TYPE;ACTIVITY NAME;DEBIT;DEBIT CURRENCY;CREDIT;CREDIT CURRENCY;CARD NUMBER;RECIPIENT;SENDER';
function parseRows(rows: string[]) {
  const table = parseCsv([header, ...rows].join('\n'));
  return toTransactions(table, guessColumns(table.header));
}

describe('Gegenpartei im Yuh-Auszug', () => {
  it('liest Namen richtungsabhängig nur für Zahlungsaufträge und bewahrt den Buchungstext', () => {
    const rows = parseRows([
      '07/05/2026;PAYMENT_TRANSACTION_IN;Eingang;;;40;CHF;;Mein Konto;Rivera CH00 5555 0000 1111 0000 0',
      '07/05/2026;PAYMENT_TRANSACTION_OUT;Ausgang;-20;CHF;;;;Atelier Grün;Mein Konto',
      '07/05/2026;GOAL_DEPOSIT;Sommer;;;40;CHF;;Reisetopf;Mein Konto',
      '07/05/2026;CARD_TRANSACTION_OUT;Bäckerei;-2;CHF;;;****0001;Musterbäckerei;Mein Konto',
      '07/05/2026;PAYMENT_TRANSACTION_IN;Unbekannt;;;40;CHF;;Mein Konto;',
    ]);
    expect(rows.map(r => [r.text, r.counterparty])).toEqual([
      ['Eingang', 'Rivera'], ['Ausgang', 'Atelier Grün'], ['Sommer', undefined],
      ['Bäckerei', undefined], ['Unbekannt', undefined],
    ]);
    expect(transactionId(rows[0]!)).toBe(transactionId({ date: '2026-05-07', amount: 4000, text: 'Eingang' }));
  });

  it('ergänzt eindeutige Altbuchungen beim Wiederimport und erhält die bestätigte Beziehung', () => {
    const booking = { date: '2026-05-07', amount: 4000, text: 'Eingang', accountId: 'bank' };
    const legacy = { id: 'alt', transferPeerId: 'gegenbuchung', ...booking };
    const fresh = { ...booking, counterparty: 'Rivera' };
    const upgraded = mergeTransactions([legacy], [fresh], []);
    expect(upgraded).toEqual({ list: [{ ...legacy, counterparty: 'Rivera' }], added: 0 });
    expect(mergeTransactions(upgraded.list, [booking], [])).toEqual(upgraded);
    expect(mergeTransactions(upgraded.list, [fresh], [])).toEqual(upgraded);
  });

  it('hängt bei mehrdeutigen alten Buchungen keine Gegenpartei an eine zufällige ID', () => {
    const booking = { date: '2026-05-07', amount: 4000, text: 'Eingang', accountId: 'bank' };
    const existing = [{ ...booking, id: 'a' }, { ...booking, id: 'b' }];
    const first = { ...booking, counterparty: 'Rivera' }, second = { ...booking, counterparty: 'Atelier' };
    expect(mergeTransactions(existing, [first], [])).toEqual({ list: existing, added: 0 });
    expect(mergeTransactions(existing, [second, first], [])).toEqual({ list: existing, added: 0 });
  });
});
