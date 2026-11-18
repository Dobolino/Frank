import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/domain/bankCsv';
import { parseInvestmentTable, investmentSources } from '../src/domain/investCsv';
import { parseAppData } from '../src/storage/storage';
import { demoData } from '../src/seed/demo';

const header = 'Datum;Typ;Symbol;Anzahl;Betrag;Währung;Broker-ID';
const trade = "02.01.2026;Kauf;TEST;2,125;-1'200.25;CHF;";
const parse = (rows: string[]) => parseCsv([header, ...rows].join('\n'));

describe('Depotimport', () => {
  it('speichert CHF und anteilige Stücke; behandelt Fremdwährung nur bei CHF-Abrechnung', () => {
    const { rows, skipped } = parseInvestmentTable(parse([trade, '02.05.2025;Dividende;TEST;;12,50;CHF;', '03.01.2026;Verkauf;TEST;1;300;EUR;']), 'a', []);
    expect(rows.map(r => r.amount)).toEqual([-120025, 1250]);
    expect(rows[0]).toMatchObject({ accountId: 'a', symbol: 'TEST', quantity: 2.125 });
    expect(skipped.get('kein CHF-Betrag')).toBe(1);
    const converted = parseCsv('Date,Type,ISIN,Amount,Currency,Amount CHF\n2026-04-05,Sell,XX00,100,USD,79.80');
    expect(parseInvestmentTable(converted, 'a', []).rows[0]?.amount).toBe(7980);
  });

  it('bewahrt gleiche Ausführungen, verhindert doppelte Importe und trennt Broker-IDs pro Depot', () => {
    const table = parse([trade + 'abc', trade + 'xyz', trade, trade]);
    const saved = parseInvestmentTable(table, 'a', []).rows;
    expect(saved).toHaveLength(4);
    expect(parseInvestmentTable(table, 'a', saved).rows).toHaveLength(0);
    expect(parseInvestmentTable(table, 'b', saved).rows).toHaveLength(4);
    expect(parseInvestmentTable(parse([trade, trade + 'abc']), 'a', [saved[0]!]).rows).toHaveLength(1);
    const conflicting = parseInvestmentTable(parse([trade.replace("1'200.25", '10.00') + 'abc']), 'a', saved);
    expect(conflicting.skipped.get('Broker-ID mit abweichenden Daten')).toBe(1);
  });

  it('trennt Quelldepots bei einem gemischten Export', () => {
    const table = parseCsv(header + ';Depot\n' + trade + ';Depot-A\n' + trade + ';Depot-B');
    expect(investmentSources(table)).toEqual(['Depot-A', 'Depot-B']);
    expect(() => parseInvestmentTable(table, 'target', [])).toThrow(/Quelldepot/);
    expect(parseInvestmentTable(table, 'target', [], 'Depot-A').rows).toHaveLength(1);
  });

  it('sichert die importierten Buchungen und prüft die Verknüpfung zum Depot', () => {
    const data = { ...demoData(), importAccounts: [{ id: 'acct', name: 'Testdepot', type: 'depot', bankId: 'other' }], investmentTransactions: parseInvestmentTable(parse([trade]), 'acct', []).rows };
    expect(parseAppData(JSON.stringify(data))).toEqual(data);
    expect(() => parseAppData(JSON.stringify({ ...data, importAccounts: [] }))).toThrow(/accountId/);
    expect(() => parseAppData(JSON.stringify({ ...data, investmentTransactions: [{ ...data.investmentTransactions[0], amount: 1.1 }] }))).toThrow(/amount/);
  });
});
