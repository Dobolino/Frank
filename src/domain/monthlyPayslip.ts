import { parseChf, type Rappen } from './money';
import type { MonthlyPayslipRecord } from './monthlyPayslipRecord';

export interface MonthlyPayslip extends MonthlyPayslipRecord {
  kind: 'monthly';
  /** Abrechnungsmonat, YYYY-MM. */
  period?: string;
}

type Field = 'baseGross' | 'pension' | 'flatExpenses' | 'net' | 'payout';

const clean = (line: string) => line.normalize('NFKC').replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim();
const stripCode = (line: string) => line.replace(/^\d{3,6}(?:\.\d+)?\s+/, '').replace(/^[_|]+\s*/, '');
const title = /\b(?:lohnabrechnung|gehaltsabrechnung|salärabrechnung|monatsabrechnung\s+lohn)\b/i;
const datedStatement = /^abrechnung\s+(?:per|für|fuer|vom)\b/i;
const amounts: [Field, RegExp][] = [
  ['baseGross', /^(?:monatslohn|grundlohn|monatsgehalt|grundgehalt)\b/i],
  ['pension', /^(?:(?:bvg|pk)[ -]?(?:beitrag|abzug)|pensionskasse(?:nbeitrag|nabzug)?)\b/i],
  ['flatExpenses', /^(?:pauschalspesen|spesenpauschale|pauschale\s+spesen)\b/i],
  ['net', /^netto[ -]?(?:lohn|gehalt)\b/i],
  ['payout', /^(?:auszahlung(?:sbetrag)?|ausbezahlter\s+betrag)\b/i],
];
const exceptional = /\b(?:korrektur|nachzahlung|nachtrag|rückwirkend|einmalig\w*|jährlich\w*|pro jahr|bonus|einkauf|arbeitgeber\w*|ag(?:[ -]anteil)?|ytd|kumuliert\w*)\b|\b13\.?\s*(?:monats)?lohn\b/i;
const foreign = /\b(?:EUR|USD|GBP)\b/i;

export function isMonthlyPayslip(lines: string[]): boolean {
  if (lines.some(line => title.test(line))) return true;
  const labels = lines.map(line => stripCode(clean(line)));
  return labels.some(line => datedStatement.test(line)) &&
    labels.some(line => /^(?:monatslohn|bruttolohn|grundlohn)\b/i.test(line)) &&
    labels.some(line => /^(?:nettolohn|bvg[ -]beitrag|ahv[ -]beitrag)\b/i.test(line));
}

// Swiss payroll exports put the booked amount in the rightmost column. A rate,
// percentage, number of hours or wages code alone is insufficient.
function finalAmount(row: string): Rappen | undefined {
  if (foreign.test(row)) return;
  const cell = /(?:^|\s|CHF\s*)([+-]?\s*(?:\d{1,3}(?:['’\u202f ]\d{3})+|\d+)[.,](?:\d{2}|--?))\s*(?:CHF)?\s*$/i.exec(row)?.[1];
  if (!cell) return;
  const amount = parseChf(cell.replace(/[.,]--?$/, '.00'));
  return amount !== null && Number.isSafeInteger(amount) ? amount : undefined;
}

function headingPeriod(line: string): string | undefined {
  if (!title.test(line) && !datedStatement.test(line) && !/^(?:abrechnungsmonat|abrechnungsperiode|lohnperiode|monat)\s*[: ]/i.test(line)) return;
  const date = /\b(?:(\d{1,2})[./])?(\d{1,2})[./-]((?:19|20)\d{2})\b/.exec(line);
  if (date) {
    const year = Number(date[3]), month = Number(date[2]), day = Number(date[1] ?? 1);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return;
    return date[3] + '-' + date[2]!.padStart(2, '0');
  }
  const iso = /\b((?:19|20)\d{2})-(0[1-9]|1[0-2])\b/.exec(line);
  if (iso) return iso[1] + '-' + iso[2];
  const named = /\b(jan(?:uar)?|feb(?:ruar)?|mär(?:z)?|maerz|apr(?:il)?|mai|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:tember)?|okt(?:ober)?|nov(?:ember)?|dez(?:ember)?)\.?\s+((?:19|20)\d{2})\b/i.exec(line);
  if (!named) return;
  const short = named[1]!.toLowerCase().replace('maerz', 'mär').slice(0, 3);
  const month = ['jan','feb','mär','apr','mai','jun','jul','aug','sep','okt','nov','dez'].indexOf(short) + 1;
  return named[2] + '-' + String(month).padStart(2, '0');
}

const expense = /^(?:(?:effektive|eff[.])\s+spesen|spesen\s+effektiv|spesenrückerstattung|reisekosten|kilometerentschädigung|parkgeb[uü]hren)\b/i;

/** Monatswerte bleiben von den Jahresziffern des Lohnausweises getrennt. */
export function parseMonthlyPayslip(lines: string[]): MonthlyPayslip {
  if (!isMonthlyPayslip(lines)) throw new Error('Keine Monatsabrechnung erkannt.');
  const result: MonthlyPayslip = { kind: 'monthly' };
  const fields = new Map<Field, number | null>();
  const periods = new Set<string>();
  let afterNet = false, actual = 0, flatAfterNet = 0;
  for (const raw of lines) {
    const line = clean(raw);
    const period = headingPeriod(line);
    if (period) periods.add(period);
    if (/\b(?:betrag|monat|basis|aktuell)\b/i.test(line) && /\b(?:ytd|kumuliert\w*|jahrestotal|year.to.date)\b/i.test(line)) {
      throw new Error('Monatswerte und Jahressummen stehen in mehreren Betragsspalten. Bitte die Monatswerte von Hand erfassen.');
    }
    const row = stripCode(line);
    const field = amounts.find(([, label]) => label.test(row))?.[0];
    const value = finalAmount(row);
    if (field === 'net') afterNet = true;
    if (field === 'payout') afterNet = false;
    if (value === undefined || exceptional.test(row)) continue;
    if (field === 'baseGross' && /\b(?:stund\w*|stundenlohn|std|tage|taggeld)\b/i.test(row)) continue;
    if (field && (value >= 0 || field === 'pension' || field === 'net' || field === 'payout')) {
      // Several BVG or wage components can have the same amount. A repeated
      // label does not tell us whether the rows are components or a total.
      fields.set(field, fields.has(field) ? null : field === 'pension' ? Math.abs(value) : value);
      if (afterNet && field === 'flatExpenses') flatAfterNet += value;
    }
    if (afterNet && value > 0 && (expense.test(row) || (/^privatauto\b/i.test(row) && /\bkm\b/i.test(row)))) {
      actual += value;
    }
  }
  if (periods.size > 1) throw new Error('Mehrere Abrechnungsmonate erkannt. Bitte eine einzelne Monatsabrechnung wählen.');
  if (periods.size) result.period = [...periods][0];
  for (const [field, amount] of fields) {
    if (amount !== null) result[field] = amount;
  }
  // Include documented costs only if the independently read payout reconciles.
  if (actual > 0 && result.net !== undefined && result.payout !== undefined && result.net + actual + flatAfterNet === result.payout) {
    result.actualExpenses = actual;
  }
  if (!Object.keys(result).some(key => key !== 'kind' && key !== 'period')) {
    throw new Error('Monatsabrechnung erkannt, aber keine eindeutigen CHF-Beträge gefunden.');
  }
  return result;
}
