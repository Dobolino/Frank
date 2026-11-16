import { ceilToFranc, sum, type Rappen } from './money';
import { dueMonths, yearlyAmount } from './budgetEngine';
import type { BudgetItem, SavingsGoal } from './types';

export interface GoalStatus {
  goal: SavingsGoal;
  remaining: Rappen;
  monthsLeft: number;
  /** Nötige Monatsrate, um das Ziel rechtzeitig zu erreichen. */
  requiredMonthly: Rappen;
  /** Aktuell im Budget eingeplante Monatsrate. */
  budgetedMonthly: Rappen;
  progress: number;
  overdue: boolean;
  onTrack: boolean;
  /** Voraussichtlicher Zielmonat mit der budgetierten Rate (YYYY-MM) oder null. */
  projectedDate: string | null;
}

/** Ganze Monate von `from` (YYYY-MM) bis `to` (YYYY-MM), mindestens 0. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function goalStatus(goal: SavingsGoal, budget: BudgetItem[], today: string): GoalStatus {
  const remaining = Math.max(0, goal.target - goal.saved);
  const monthsLeft = monthsBetween(today, goal.dueDate);
  const requiredMonthly = remaining === 0 ? 0 : ceilToFranc(remaining / Math.max(1, monthsLeft));
  const budgetedMonthly = Math.round(sum(budget.filter((b) => b.goalId === goal.id).map(yearlyAmount)) / 12);
  const overdue = remaining > 0 && goal.dueDate < today;
  const projectedDate =
    remaining === 0 ? today : budgetedMonthly > 0 ? addMonths(today, Math.ceil(remaining / budgetedMonthly)) : null;
  return {
    goal,
    remaining,
    monthsLeft,
    requiredMonthly,
    budgetedMonthly,
    progress: goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0,
    overdue,
    onTrack: remaining === 0 || (!overdue && budgetedMonthly >= requiredMonthly),
    projectedDate,
  };
}

/**
 * Passt alle verknüpften Posten proportional an. Namen, Unterposten und Fälligkeiten
 * bleiben erhalten; Rundung darf die nötige Jahresrate nicht unterschreiten.
 * `budget` ist die bearbeitbare Kopie des Jahresplans.
 */
export function setGoalMonthlyRate(budget: BudgetItem[], goal: SavingsGoal, monthlyRate: Rappen, newId: string): void {
  const linked = budget.filter((item) => item.goalId === goal.id);
  if (linked.length === 0) {
    budget.push({
      id: newId, category: 'savings', name: `Sparziel: ${goal.name}`,
      amount: monthlyRate, frequency: { kind: 'monthly' }, accountId: goal.accountId, goalId: goal.id,
    });
    return;
  }
  // Ein vollständig pausiertes Ziel braucht wieder einen Zahlungsrhythmus.
  if (linked.every((item) => dueMonths(item.frequency).length === 0)) linked[0]!.frequency = { kind: 'monthly' };
  const entries = linked.flatMap((item) => {
    const count = dueMonths(item.frequency).length;
    return (item.children?.length ? item.children : [item]).map((entry) => ({ entry, count, weight: Math.max(0, entry.amount) * count }));
  });
  const payable = entries.filter(({ count }) => count > 0);
  const totalWeight = sum(payable.map(({ weight }) => weight));
  const targetYearly = Math.max(0, monthlyRate) * 12;
  for (const { entry, count, weight } of payable) {
    entry.amount = totalWeight > 0 ? Math.floor((weight / totalWeight) * targetYearly / count) : 0;
  }
  // Der kleinste Zahlungstakt begrenzt den Rundungsüberschuss auf unter 12 Rp./Jahr.
  const remainder = targetYearly - sum(payable.map(({ entry, count }) => entry.amount * count));
  const recipient = payable.reduce((best, next) => next.count < best.count ? next : best);
  recipient.entry.amount += Math.ceil(remainder / recipient.count);
  for (const item of linked) {
    if (item.children?.length) item.amount = sum(item.children.map((child) => child.amount));
    item.accountId = goal.accountId;
    item.autoFromTax = false;
  }
}
