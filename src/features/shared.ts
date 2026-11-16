/** Gemeinsame Exporte für die Feature-Seiten. */
export * from '../components/ui';
import { formatChf, type Rappen } from '../domain/money';

export const formatChfShort = (r: Rappen): string => `CHF ${formatChf(r, { decimals: false })}`;

/** Heutiger Monat als YYYY-MM. */
export function todayYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export { SectionHeader } from '../components/SectionHeader';
