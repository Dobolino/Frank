import { describe, expect, it } from 'vitest';
import { monthlyAmount, outflowsByMonth, standingOrders, summarizeBudget, yearlyAmount } from '../src/domain/budgetEngine';
import { simulateAccounts } from '../src/domain/cashflowEngine';
import { goalStatus, monthsBetween } from '../src/domain/goalsEngine';
import { chf } from '../src/domain/money';
import type { Account, BudgetItem } from '../src/domain/types';

const accounts: Account[] = [
  { id: 'main', name: 'Lohnkonto', type: 'checking' },
  { id: 'yuh', name: 'YUH', type: 'savings' },
];

const m = (name: string, amount: number, extra: Partial<BudgetItem> = {}): BudgetItem => ({
  id: name,
  name,
  category: 'fixed',
  amount: chf(amount),
  frequency: { kind: 'monthly' },
  ...extra,
});

describe('Budget', () => {
  it('rechnet jährliche Posten korrekt auf den Monat um', () => {
    const item = m('Autoversicherung', 1200, { frequency: { kind: 'yearly', month: 3 } });
    expect(yearlyAmount(item)).toBe(chf(1200));
    expect(monthlyAmount(item)).toBe(chf(100));
    expect(outflowsByMonth(item)[2]).toBe(chf(1200));
    expect(outflowsByMonth(item)[0]).toBe(0);
  });

  it('summiert Unterposten (Streaming)', () => {
    const streaming = m('Streaming', 0, {
      children: [
        { id: 'n', name: 'Video-Abo', amount: chf(20.9) },
        { id: 'a', name: 'Musik-Abo', amount: chf(12.95) },
      ],
    });
    expect(monthlyAmount(streaming)).toBe(chf(33.85));
  });

  it('vergisst keine Zeile im Jahrestotal', () => {
    const items = [m('Bank', 10), m('Leasing', 250), m('MFK', 30, { category: 'mobility' }), m('Sparen Auto', 80, { category: 'savings' })];
    const s = summarizeBudget(items, { regularNetMonthly: chf(5000), netYearly: chf(65000), otherYearly: 0 });
    expect(s.expensesYearly).toBe(chf((10 + 250 + 30 + 80) * 12));
    expect(s.expensesMonthly * 12).toBe(s.expensesYearly);
  });

  it('berechnet den YUH-Dauerauftrag aus allen markierten Posten', () => {
    const yuh = { accountId: 'yuh' };
    const items = [
      m('Strom', 90, yuh), m('Hausrat', 25, yuh), m('Serafe', 28, yuh), m('Ausgang', 200, yuh),
      m('Autoversicherung', 100, yuh), m('MFK', 30, yuh), m('Steuern', 700, yuh), m('ETF', 400, yuh),
      m('Sparen Auto', 50, yuh), m('Miete', 1500),
    ];
    const [order] = standingOrders(items, accounts);
    expect(order!.standingOrder).toBe(chf(1623));
  });

  it('erkennt, wenn das Sparkonto vor einer Jahresrechnung zu wenig Guthaben hat', () => {
    const items = [m('Autoversicherung', 1200, { accountId: 'yuh', frequency: { kind: 'yearly', month: 2 } })];
    const [flow] = simulateAccounts({ items, accounts, salaryMonths: [], allocations: [], startBalances: {} });
    expect(flow!.standingOrder).toBe(chf(100));
    expect(flow!.minMonth).toBe(2);
    expect(flow!.bufferNeeded).toBe(chf(1200 - 200));
    expect(flow!.endBalance).toBe(0);
  });
});

describe('Sparziele', () => {
  it('berechnet die nötige Monatsrate', () => {
    expect(monthsBetween('2026-11', '2027-06')).toBe(7);
    const status = goalStatus(
      { id: 'japan', name: 'Japan', target: chf(4000), saved: chf(500), dueDate: '2027-06' },
      [m('Reise', 300, { goalId: 'japan', category: 'savings' })],
      '2026-11',
    );
    expect(status.requiredMonthly).toBe(chf(500));
    expect(status.budgetedMonthly).toBe(chf(300));
    expect(status.onTrack).toBe(false);
    expect(status.projectedDate).toBe('2027-11');
  });
});
