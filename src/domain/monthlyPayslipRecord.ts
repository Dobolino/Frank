import type { Rappen } from './money';
import type { YearPlan } from './types';

export const monthlyPayslipFields = [
  { key: 'baseGross', label: 'Grundlohn brutto' },
  { key: 'pension', label: 'BVG-Abzug' },
  { key: 'net', label: 'Nettolohn' },
  { key: 'actualExpenses', label: 'Effektive Spesen' },
  { key: 'flatExpenses', label: 'Pauschalspesen' },
  { key: 'payout', label: 'Auszahlung' },
] as const;

export type MonthlyPayslipRecord = Partial<Record<typeof monthlyPayslipFields[number]['key'], Rappen>>;

export function validMonthlyPayslipRecord(value: unknown): value is MonthlyPayslipRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, amount]) =>
    monthlyPayslipFields.some(field => field.key === key) && Number.isSafeInteger(amount) &&
    (key === 'net' || key === 'payout' || amount >= 0));
}

export function isPlanMonth(period: string, year: number): boolean {
  return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period) && Number(period.slice(0, 4)) === year;
}

export function saveMonthlyPayslip(plan: YearPlan, period: string, record: MonthlyPayslipRecord): void {
  if (!isPlanMonth(period, plan.year) || !validMonthlyPayslipRecord(record)) {
    throw new Error('Prüfe den Abrechnungsmonat und die Beträge der Monatsabrechnung.');
  }
  (plan.monthlyPayslips ??= {})[period] = { ...record };
}
