import { describe, expect, it } from 'vitest';
import { expensePeriod } from '../src/domain/expensePeriod';
import type { BudgetItem, Transaction } from '../src/domain/types';

const item = (id: string, name: string, amount: number): BudgetItem => ({
  id,
  name,
  category: 'household',
  amount,
  frequency: { kind: 'monthly' },
});
const booking = (id: string, date: string, amount: number, rest: Partial<Transaction> = {}): Transaction => ({
  id,
  date,
  amount,
  text: 'Test',
  ...rest,
});
const budget = [
  item('1', 'Einkauf', 32000),
  item('2', 'Einkauf', 8000),
  { ...item('3', 'Jahresrechnung', 12000), frequency: { kind: 'yearly' as const, month: 4 as const } },
  { ...item('4', 'Rückstellung', 42000), taxTag: 'taxProvision' as const },
];
const transactions = [
  booking('a', '2025-11-02', -2400, { item: 'Einkauf' }),
  booking('b', '2026-04-14', -6350, { item: 'Einkauf' }),
  booking('c', '2026-04-22', -1750),
  booking('d', '2026-04-30', -60000, { excludedFromSpend: true }),
  booking('e', '2026-04-28', 530000),
  booking('f', '2026-05-10', -2750, { item: 'Einkauf' }),
];

describe('Ausgabenansicht', () => {
  it('zählt doppelte Postennamen, Überträge und Eingänge korrekt', () => {
    const month = expensePeriod(budget, transactions, '2026-04');
    expect(month.planned).toBe(52000);
    expect(month.spent).toBe(8100);
    expect(month.income).toBe(530000);
    expect(month.unassigned).toBe(1750);
    expect(month.entries).toHaveLength(4);
    expect(month.rows.find((row) => row.name === 'Einkauf')).toMatchObject({ spent: 6350, planned: 40000 });
  });
  it('berücksichtigt Monats- und Jahresfälligkeiten im richtigen Jahr', () => {
    const year = expensePeriod(budget, transactions, '2026');
    expect(year.planned).toBe(492000);
    expect(year.spent).toBe(10850);
    expect(expensePeriod(budget, transactions, '2026-05').planned).toBe(40000);
  });
  it('zeigt frühere Buchungen auch ohne vorhandenen Plan', () => {
    expect(expensePeriod([], transactions, '2025')).toMatchObject({ spent: 2400, planned: 0 });
  });
});
