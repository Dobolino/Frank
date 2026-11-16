import { describe, expect, it } from 'vitest';
import { goalStatus, setGoalMonthlyRate } from '../src/domain/goalsEngine';
import { yearlyAmount } from '../src/domain/budgetEngine';
import { chf } from '../src/domain/money';
import type { BudgetItem, Frequency, SavingsGoal } from '../src/domain/types';

const goal: SavingsGoal = { id: 'trip', name: 'Reise', target: chf(1200), saved: 0, dueDate: '2027-01', accountId: 'savings' };
const item = (frequency: Frequency, amount: number): BudgetItem => ({
  id: 'budget-trip', name: 'Reisebetrag', category: 'savings', goalId: goal.id,
  frequency, amount: chf(amount), accountId: 'old-account', note: 'Nicht verlieren',
});

describe('Sparrate ins Budget übernehmen', () => {
  it.each<{ label: string; frequency: Frequency; before: number; after: number }>([
    { label: 'monatlich', frequency: { kind: 'monthly' }, before: 50, after: 100 },
    { label: 'jährlich', frequency: { kind: 'yearly', month: 12 }, before: 600, after: 1200 },
    { label: 'quartalsweise', frequency: { kind: 'quarterly', months: [3, 6, 9, 12] }, before: 150, after: 300 },
    { label: 'bestimmte Monate', frequency: { kind: 'custom', months: [6, 12] }, before: 300, after: 600 },
  ])('rechnet eine Monatsrate korrekt in $label um', ({ frequency, before, after }) => {
    const budget = [item(frequency, before)];
    setGoalMonthlyRate(budget, goal, chf(100), 'unused');
    expect(budget).toHaveLength(1);
    expect(budget[0]).toMatchObject({ id: 'budget-trip', amount: chf(after), frequency, note: 'Nicht verlieren', accountId: 'savings' });
    expect(goalStatus(goal, budget, '2026-01').budgetedMonthly).toBe(chf(100));
  });

  it('verteilt die Rate auf mehrere Posten und erhält deren Unterposten', () => {
    const first = item({ kind: 'monthly' }, 0);
    first.children = [{ id: 'flight', name: 'Flug', amount: chf(20) }, { id: 'hotel', name: 'Hotel', amount: chf(30) }];
    const second = { ...item({ kind: 'yearly', month: 6 }, 600), id: 'extra', autoFromTax: true };
    const unrelated = { ...item({ kind: 'monthly' }, 10), id: 'other', goalId: 'other' };
    const budget = [first, second, unrelated];
    setGoalMonthlyRate(budget, goal, chf(200), 'unused');
    expect(budget).toHaveLength(3);
    expect(first.children).toEqual([{ id: 'flight', name: 'Flug', amount: chf(40) }, { id: 'hotel', name: 'Hotel', amount: chf(60) }]);
    expect(first.amount).toBe(chf(100));
    expect(second.amount).toBe(chf(1200));
    expect(second.autoFromTax).toBe(false);
    expect(second.accountId).toBe(goal.accountId);
    expect(unrelated.amount).toBe(chf(10));
    expect(unrelated.accountId).toBe('old-account');
    expect(goalStatus(goal, budget, '2026-01').budgetedMonthly).toBe(chf(200));
  });

  it('legt einen fehlenden Posten an und kann eine vollständig pausierte Rate wieder starten', () => {
    const budget: BudgetItem[] = [];
    setGoalMonthlyRate(budget, goal, chf(100), 'created');
    expect(budget[0]).toMatchObject({ id: 'created', frequency: { kind: 'monthly' }, amount: chf(100), accountId: 'savings' });
    budget[0]!.frequency = { kind: 'custom', months: [] };
    budget[0]!.amount = 0;
    setGoalMonthlyRate(budget, goal, chf(200), 'unused');
    expect(goalStatus(goal, budget, '2026-01').budgetedMonthly).toBe(chf(200));
    expect(budget).toHaveLength(1);
  });

  it('rundet ungleichmässige Zahlungstermine ohne Unterdeckung und bleibt wiederholbar', () => {
    const budget = [item({ kind: 'custom', months: [1, 2, 3, 4, 5, 6, 7] }, 25)];
    setGoalMonthlyRate(budget, goal, chf(101), 'unused');
    expect(yearlyAmount(budget[0]!)).toBeGreaterThanOrEqual(chf(101 * 12));
    expect(yearlyAmount(budget[0]!) - chf(101 * 12)).toBeLessThan(12);
    const once = structuredClone(budget);
    setGoalMonthlyRate(budget, goal, chf(101), 'unused');
    expect(budget).toEqual(once);
  });

  it('setzt erreichte Ziele auf null, ohne die Posten zu löschen', () => {
    const budget = [item({ kind: 'yearly', month: 5 }, 300)];
    setGoalMonthlyRate(budget, goal, 0, 'unused');
    expect(budget).toHaveLength(1);
    expect(yearlyAmount(budget[0]!)).toBe(0);
  });
});

describe('Überfällige Sparziele', () => {
  it('ist trotz hoher Rate nicht im Plan, wenn der Zielmonat bereits verstrichen ist', () => {
    const status = goalStatus({ ...goal, dueDate: '2025-12' }, [item({ kind: 'monthly' }, 1200)], '2026-01');
    expect(status.overdue).toBe(true);
    expect(status.onTrack).toBe(false);
    expect(status.projectedDate).toBe('2026-02');
  });

  it('bezeichnet ein erreichtes Ziel nicht als überfällig', () => {
    const status = goalStatus({ ...goal, saved: goal.target, dueDate: '2025-12' }, [], '2026-01');
    expect(status.overdue).toBe(false);
    expect(status.onTrack).toBe(true);
  });
});
