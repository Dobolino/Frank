import type { Rappen } from './money';

export const salaryCertificateFields = [
  { key: 'gross', number: '8', label: 'Bruttolohn total' },
  { key: 'social', number: '9', label: 'Sozialversicherungen' },
  { key: 'pension', number: '10.1', label: 'BVG-Beiträge, ordentlich' },
  { key: 'pensionPurchase', number: '10.2', label: 'BVG-Einkäufe' },
  { key: 'net', number: '11', label: 'Nettolohn' },
  { key: 'actualExpenses', number: '13.1', label: 'Effektive Spesen' },
  { key: 'flatExpenses', number: '13.2', label: 'Pauschalspesen' },
] as const;

export type CertificateField = typeof salaryCertificateFields[number]['key'];
export type SalaryCertificateRecord = Partial<Record<CertificateField, Rappen>> & {
  period?: { from: string; to: string };
};

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().startsWith(value);
}

export function validSalaryCertificateRecord(raw: unknown): raw is SalaryCertificateRecord {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== 'period' && !salaryCertificateFields.some(field => field.key === key))) return false;
  if (!salaryCertificateFields.some(({ key }) => record[key] !== undefined)) return false;
  if (salaryCertificateFields.some(({ key }) => record[key] !== undefined && !Number.isSafeInteger(record[key]))) return false;
  if (record.period === undefined) return true;
  if (typeof record.period !== 'object' || record.period === null || Array.isArray(record.period)) return false;
  const period = record.period as Record<string, unknown>;
  return Object.keys(period).every(key => key === 'from' || key === 'to')
    && isCalendarDate(period.from) && isCalendarDate(period.to) && period.from <= period.to;
}
