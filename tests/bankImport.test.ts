import { describe, expect, it } from 'vitest';
import { guessColumns, parseAmount, parseCsv, parseDate, toTransactions } from '../src/domain/bankCsv';
import { compareMonth, mergeTransactions, merchantKey } from '../src/domain/actuals';
import { parseAppData } from '../src/storage/storage';
import { demoData } from '../src/seed/demo';

/** Nachgebaute Exporte mit typischem Aufbau, keine echten Kontodaten. */
const POSTFINANCE = `Datum von:;01.10.2026
Buchungsart:;Alle
Konto:;CH00 0000 0000 0000 0000 0
Währung:;CHF

Datum;Avisierungstext;Gutschrift in CHF;Lastschrift in CHF;Label;Kategorie
02.10.2026;"KAUF/DIENSTLEISTUNG VOM 01.10.2026 KARTEN NR. XXXX1234 Migros Bern";;-54.30;;
05.10.2026;"GIRO POST LOHN FIRMA AG";5'319.20;;;
28.10.2026;"KAUF/DIENSTLEISTUNG VOM 27.10.2026 Coop Pronto";;-12.90;;
`;

const ONE_COLUMN = `"Buchungsdatum","Valuta","Buchungstext","Betrag","Saldo"
"2026-10-03","2026-10-03","TWINT Migros Bern","-81.20","1200.00"
"2026-10-25","2026-10-25","Lohn","5319.20","6519.20"
`;

describe('CSV-Import', () => {
  it('erkennt PostFinance-Aufbau mit Vorspann und getrennten Spalten', () => {
    const table = parseCsv(POSTFINANCE);
    expect(table.header[0]).toBe('Datum');
    const map = guessColumns(table.header);
    expect(map).toMatchObject({ date: 0, text: 1, credit: 2, debit: 3 });
    const tx = toTransactions(table, map);
    expect(tx.map((t) => t.amount)).toEqual([-5430, 531920, -1290]);
    expect(tx[0]!.date).toBe('2026-10-02');
  });

  it('erkennt eine Betragsspalte mit Vorzeichen und Anführungszeichen', () => {
    const table = parseCsv(ONE_COLUMN);
    const map = guessColumns(table.header);
    expect(map).toMatchObject({ date: 0, text: 2, amount: 3 });
    expect(toTransactions(table, map).map((t) => [t.date, t.amount])).toEqual([['2026-10-03', -8120], ['2026-10-25', 531920]]);
  });

  it('liest Schweizer Datums- und Zahlenformate', () => {
    expect(parseDate('31.12.26')).toBe('2026-12-31');
    expect(parseDate('1.2.2026')).toBe('2026-02-01');
    expect(parseDate('32.01.2026')).toBeNull();
    expect(parseAmount("1'234.50")).toBe(123450);
    expect(parseAmount('-12,30')).toBe(-1230);
    expect(parseAmount('1.234,50')).toBe(123450);
    expect(parseAmount('')).toBeNull();
  });
});

describe('Zuordnung und Soll/Ist', () => {
  const parsed = toTransactions(parseCsv(POSTFINANCE), guessColumns(parseCsv(POSTFINANCE).header));

  it('ordnet über Regeln zu und importiert nichts doppelt', () => {
    const rules = [{ match: 'migros', item: 'Einkauf' }];
    const first = mergeTransactions([], parsed, rules);
    expect(first.added).toBe(3);
    expect(first.list.find((t) => t.text.includes('Migros'))?.item).toBe('Einkauf');
    expect(first.list.find((t) => t.amount > 0)?.item).toBeUndefined();
    expect(mergeTransactions(first.list, parsed, rules).added).toBe(0);
  });

  it('vergleicht Budget und Ausgaben pro Monat', () => {
    const data = demoData();
    const { list } = mergeTransactions([], parsed, [{ match: 'migros', item: 'Einkauf' }]);
    const c = compareMonth(data.years['2026']!.budget, list, '2026-10');
    const einkauf = c.rows.find((r) => r.name === 'Einkauf')!;
    expect(einkauf.plan).toBe(45000);
    expect(einkauf.actual).toBe(5430);
    expect(c.unassigned).toBe(1290);
    expect(c.unassignedCount).toBe(1);
    expect(c.income).toBe(531920);
  });

  it('bildet Stichworte ohne Ziffern und Füllwörter', () => {
    expect(merchantKey('TWINT Migros Bern 1234')).toBe('migros bern');
  });

  it('übersteht Backup mit Buchungen und Regeln', () => {
    const { list } = mergeTransactions([], parsed, []);
    const data = { ...demoData(), transactions: list, rules: [{ match: 'coop', item: 'Einkauf' }] };
    expect(parseAppData(JSON.stringify(data))).toEqual(data);
  });
});
