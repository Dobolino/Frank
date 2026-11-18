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

/** Aufbau wie der Export aus der UBS-App (erfundene Werte). */
const UBS_APP = `Transaktionsdatum;Konto- oder Kartennummer;Beschreibung;Einnahmen oder Ausgaben;Betrag;Währung;Kategorie
31.10.2026;XXXX 0000;"Coop Pronto Bahnhof";Ausgaben;-23.40;CHF;Lebensmittel
30.10.2026;XXXX 0000;"Migros Zentrum";Ausgaben;-61.15;CHF;Lebensmittel
29.10.2026;XXXX 0000;"SBB Mobile";Ausgaben;-12.80;CHF;Transport
28.10.2026;XXXX 0000;"Lohn";Einnahmen;5200.00;CHF;Einkommen
`;

describe('UBS-App-Export mit Bank-Kategorien', () => {
  it('erkennt Spalten inkl. Kategorie und speichert keine Kartennummer', () => {
    const table = parseCsv(UBS_APP);
    const map = guessColumns(table.header);
    expect(map).toMatchObject({ date: 0, text: 2, amount: 4, category: 6 });
    const tx = toTransactions(table, map);
    expect(tx[0]).toEqual({ date: '2026-10-31', text: 'Coop Pronto Bahnhof', amount: -2340, category: 'Lebensmittel' });
    expect(JSON.stringify(tx)).not.toContain('XXXX');
  });

  it('ordnet über die Bank-Kategorie zu, wenn keine Händler-Regel greift', () => {
    const parsed = toTransactions(parseCsv(UBS_APP), guessColumns(parseCsv(UBS_APP).header));
    const { list } = mergeTransactions([], parsed, [{ match: 'lebensmittel', item: 'Einkauf', field: 'category' }, { match: 'sbb', item: 'ÖV-Abo' }]);
    expect(list.filter((t) => t.item === 'Einkauf')).toHaveLength(2);
    expect(list.find((t) => t.text.startsWith('SBB'))?.item).toBe('ÖV-Abo');
    expect(list.find((t) => t.amount > 0)?.item).toBeUndefined();
  });
});

describe('Konten- und Kartenimport', () => {
  it('liest mehrzeilige Händlertexte und importiert nur CHF mit richtiger Richtung', () => {
    const t = parseCsv('Transaktionsdatum,Konto- oder Kartennummer,Beschreibung,Einnahmen oder Ausgaben,Betrag,Währung\r\n01.03.2026,K1,"Test,\nShop",Ausgaben,4.50,CHF\n02.03.2026,K2,Text,Einnahmen,-25.00,CHF\n03.03.2026,K1,Text,Ausgaben,1,EUR');
    const map = guessColumns(t.header);
    expect(map).toMatchObject({ source: 1, direction: 3, currency: 5 });
    expect(toTransactions(t, map)).toEqual([
      { date: '2026-03-01', text: 'Test, Shop', amount: -450 },
      { date: '2026-03-02', text: 'Text', amount: 2500 },
    ]);
  });
  it('erhält gleichlautende Zahlungen je Konto und erkennt den erneuten Import', () => {
    const t = { date: '2026-02-04', text: 'Laden', amount: -300 };
    const rows = [{ ...t, accountId: 'bank' }, { ...t, accountId: 'karte' }, { ...t, accountId: 'karte' }];
    const old = mergeTransactions([], [t], []).list;
    const { added, list } = mergeTransactions(old, rows, []);
    expect(added).toBe(2);
    expect(list.map(t => t.accountId).sort()).toEqual(['bank', 'karte', 'karte']);
    expect(new Set(list.map(t => t.id)).size).toBe(3);
    expect(mergeTransactions(list, rows, []).added).toBe(0);
  });
  it('weist Eigenüberträge und Kartenabrechnungen separat vom Konsum aus', () => {
    const a = { id: 'a', text: 'Einkauf', date: '2026-10-10', amount: -1200 };
    const result = compareMonth([], [a, { ...a, id: 'b', excludedFromSpend: true }, { ...a, id: 'c', amount: 1200, excludedFromSpend: true }], '2026-10');
    expect(result.actualTotal).toBe(1200);
    expect(result.income).toBe(0);
  });
});
