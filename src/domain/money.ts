/**
 * Geldbeträge werden intern immer als ganze Rappen gespeichert,
 * damit keine Rundungsfehler durch Gleitkommazahlen entstehen.
 */
export type Rappen = number;

/** CHF-Betrag (z. B. 1234.5) → Rappen (123450). */
export const chf = (franken: number): Rappen => Math.round(franken * 100);

/** Rappen → CHF als Zahl. */
export const toChf = (r: Rappen): number => r / 100;

/** Kaufmännisch auf 5 Rappen runden (Lohnabrechnung, Steuerbeträge). */
export const roundTo5 = (r: number): Rappen => Math.round(r / 5) * 5;

/** Auf ganze Franken aufrunden (z. B. für Daueraufträge). */
export const ceilToFranc = (r: number): Rappen => Math.ceil(r / 100 - 1e-9) * 100;

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

const fmt2 = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Formatierung im Schweizer Stil: 1'234.50 */
export function formatChf(r: Rappen, opts: { decimals?: boolean; prefix?: boolean } = {}): string {
  const { decimals = true, prefix = false } = opts;
  const text = (decimals ? fmt2 : fmt0).format(r / 100).replace(/’/g, "'");
  return prefix ? `CHF ${text}` : text;
}

/** Eingabe-Text ("1'234.50", "1234,5") → Rappen; null bei ungültiger Eingabe. */
export function parseChf(input: string): Rappen | null {
  const cleaned = input.replace(/['’\s]/g, '').replace(',', '.').replace(/^CHF/i, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? chf(n) : null;
}

export const formatPercent = (fraction: number, digits = 1): string =>
  `${(fraction * 100).toFixed(digits)} %`;
