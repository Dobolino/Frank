import { describe, expect, it } from 'vitest';
import { catchUp, levelFor, onlyMonthlyItems, runRadar, upcomingBills, type RadarYear } from '../src/domain/radarEngine';
import { chf } from '../src/domain/money';
import type { Account, BudgetItem } from '../src/domain/types';

const accounts: Account[] = [
  { id: 'main', name: 'Lohnkonto', type: 'checking' },
  { id: 'sav', name: 'Sparkonto', type: 'savings' },
];
const sav = accounts[1]!;

const item = (name: string, amount: number, extra: Partial<BudgetItem> = {}): BudgetItem => ({
  id: name,
  name,
  category: 'fixed',
  amount: chf(amount),
  frequency: { kind: 'monthly' },
  accountId: 'sav',
  ...extra,
});

/** Versicherung CHF 1'200 im März, dazu Ausgang CHF 100 pro Monat → Dauerauftrag CHF 200. */
const year = (y: number): RadarYear => ({
  year: y,
  items: [item('Versicherung', 1200, { frequency: { kind: 'yearly', month: 3 } }), item('Ausgang', 100)],
  salaryMonths: [],
  allocations: [],
});

describe('Finanz-Radar', () => {
  it('rollt über den Jahreswechsel und nimmt fehlende Jahre an', () => {
    const r = runRadar({
      account: sav,
      accounts,
      getYear: (y) => (y === 2026 ? year(2026) : null),
      startYm: '2026-11',
      startBalance: 0,
      buffer: chf(500),
    });
    expect(r.points).toHaveLength(12);
    expect(r.points[0]!.ym).toBe('2026-11');
    expect(r.points[2]!.ym).toBe('2027-01');
    expect(r.points[2]!.assumed).toBe(true);
    // Nov +100, Dez +200, Jan +300, Feb +400, März 400 + 200 − 1300 = −700
    expect(r.points[4]!.balanceEnd).toBe(chf(-700));
    expect(r.level).toBe('red');
    expect(r.minYm).toBe('2027-03');
  });

  it('berechnet den Spar-Tipp so, dass das Konto nicht ins Minus fällt', () => {
    const r = runRadar({ account: sav, accounts, getYear: year, startYm: '2026-11', startBalance: 0, buffer: chf(500) });
    // −700 nach 5 Monaten → 140 pro Monat
    expect(r.catchUpMonthly).toBe(chf(140));
    const fixed = runRadar({ account: sav, accounts, getYear: year, startYm: '2026-11', startBalance: chf(700), buffer: chf(500) });
    expect(fixed.minBalance).toBe(0);
    expect(fixed.level).toBe('yellow');
  });

  it('berücksichtigt einmalige Ausgaben', () => {
    const base = runRadar({ account: sav, accounts, getYear: year, startYm: '2026-04', startBalance: chf(2000), buffer: chf(500) });
    expect(base.level).toBe('green');
    const withOneOff = runRadar({
      account: sav,
      accounts,
      getYear: year,
      startYm: '2026-04',
      startBalance: chf(2000),
      buffer: chf(500),
      oneOffs: [{ ym: '2026-05', amount: chf(1800), accountId: 'sav' }],
    });
    expect(withOneOff.minBalance).toBe(base.minBalance - chf(1800));
    expect(withOneOff.level).not.toBe('green');
  });

  it('Ampel und Tipp-Grundlagen', () => {
    expect(levelFor(chf(-1), chf(500))).toBe('red');
    expect(levelFor(chf(100), chf(500))).toBe('yellow');
    expect(levelFor(chf(600), chf(500))).toBe('green');
    expect(catchUp([chf(100), chf(-300)], 0)).toBe(chf(150));
    expect(catchUp([chf(100)], 0)).toBe(0);
  });

  it('listet grössere fällige Rechnungen und erkennt rein monatliche Budgets', () => {
    const bills = upcomingBills(year, '2027-02', 2, chf(200));
    expect(bills).toEqual([{ ym: '2027-03', name: 'Versicherung', amount: chf(1200), accountId: 'sav' }]);
    expect(onlyMonthlyItems(year(2026).items, 'sav')).toBe(false);
    expect(onlyMonthlyItems([item('A', 1), item('B', 2)], 'sav')).toBe(true);
  });
});
