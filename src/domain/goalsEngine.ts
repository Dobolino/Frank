import { ceilToFranc, sum, type Rappen } from './money';
import { monthlyAmount } from './budgetEngine';
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
  const budgetedMonthly = sum(budget.filter((b) => b.goalId === goal.id).map(monthlyAmount));
  const projectedDate =
    remaining === 0 ? today : budgetedMonthly > 0 ? addMonths(today, Math.ceil(remaining / budgetedMonthly)) : null;
  return {
    goal,
    remaining,
    monthsLeft,
    requiredMonthly,
    budgetedMonthly,
    progress: goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0,
    onTrack: remaining === 0 || budgetedMonthly >= requiredMonthly,
    projectedDate,
  };
}
