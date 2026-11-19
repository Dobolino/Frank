import { notBooked, yuhColumns, yuhMovement, type YuhColumns } from './yuhCsv';
import type { Rappen } from './money';
import { isSourceColumn, readStatementIdentity, statementSource, type StatementIdentity } from './statementIdentity';
export { sourceTypeForColumn } from './statementIdentity';

/**
 * CSV-Export einer Bank einlesen. Erkennt Trennzeichen, Kopfzeile und Spalten
 * (Datum, Text, Betrag oder Belastung/Gutschrift) bei gängigen Schweizer Banken.
 * Die Datei verlässt das Gerät nicht.
 */

export interface CsvTable {
  header: string[];
  rows: string[][];
  statement?: StatementIdentity;
}

export interface ColumnMap {
  date: number;
  text: number;
  /** Eine Spalte mit Vorzeichen (negativ = Ausgabe). */
  amount?: number;
  /** Getrennte Spalten: Belastung (Ausgabe) und Gutschrift (Eingang). */
  debit?: number;
  credit?: number;
  /** Kategorie der Bank (z. B. UBS-App: «Lebensmittel»), optional. */
  category?: number;
  source?: number;
  currency?: number;
  direction?: number;
}

export interface ParsedTransaction {
  /** YYYY-MM-DD */
  date: string;
  text: string;
  /** Negativ = Ausgabe, positiv = Eingang. */
  amount: Rappen;
  category?: string;
  accountId?: string;
  sourceFingerprint?: string;
  counterparty?: string;
  excludedFromSpend?: boolean;
}

/** Liest auch Zeilenumbrüche und Trennzeichen in einem zitierten Feld. */
export function csvRecords(content: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === '"') {
      if (quoted && content[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || !value.trim()) quoted = !quoted;
      else value += ch;
    } else if (!quoted && ch === separator) {
      row.push(value.trim()); value = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = '';
    } else value += ch;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const KEYWORDS = {
  date: ['buchungsdatum', 'datum', 'date', 'booked at', 'abschlussdatum', 'valuta', 'transaktionsdatum', 'booking date', 'buchungstag', 'handelsdatum', 'trade date', 'transaction date'],
  text: ['buchungstext', 'beschreibung', 'avisierungstext', 'text', 'description', 'activity name', 'details', 'mitteilung', 'empfänger', 'zahlungsempfänger'],
  amount: ['betrag', 'amount', 'credit/debit amount', 'umsatz'],
  debit: ['belastung', 'lastschrift', 'debit', 'soll', 'ausgang'],
  credit: ['gutschrift', 'credit', 'haben', 'eingang'],
  category: ['kategorie', 'category'],
};

const norm = (s: string) => s.toLowerCase().replace(/["']/g, '').trim();

/** Text der CSV-Datei in Kopfzeile und Datenzeilen zerlegen. Vorspann (Kontoinfo) wird übersprungen. */
export function parseCsv(content: string): CsvTable {
  const clean = content.replace(/^\uFEFF/, '');
  const candidates = [';', ',', '\t'].map(separator => {
    const rows = csvRecords(clean, separator);
    const index = rows.findIndex(row => row.length >= 3 && row.some(cell => KEYWORDS.date.some(k => norm(cell).startsWith(k))) && !row.some(cell => parseDate(cell)));
    return { rows, index, score: index >= 0 ? rows[index]!.length : 0 };
  });
  const { rows, index } = candidates.sort((a, b) => b.score - a.score || (b.rows[0]?.length ?? 0) - (a.rows[0]?.length ?? 0))[0]!;
  const head = Math.max(0, index);
  const header = rows[head] ?? [];
  const statement = readStatementIdentity(rows.slice(0, head), header);
  return { header, rows: rows.slice(head + 1).filter(row => row.length >= 2), ...(statement && { statement }) };
}

const find = (header: string[], keys: string[], exclude: number[] = []) => {
  for (const k of keys) {
    const i = header.findIndex((h, idx) => !exclude.includes(idx) && norm(h).includes(k));
    if (i >= 0) return i;
  }
  return -1;
};

/** Spalten anhand der Kopfzeile erraten. */
export function guessColumns(header: string[]): ColumnMap {
  const yuh = yuhColumns(header);
  if (yuh) return { date: yuh.date, text: yuh.name, debit: yuh.debit, credit: yuh.credit };
  const map = guessAmountColumns(header);
  const category = find(header, KEYWORDS.category, [map.date, map.text]);
  const source = header.findIndex(isSourceColumn);
  const currency = find(header, ['währung', 'waehrung', 'currency']);
  const direction = find(header, ['einnahmen oder ausgaben', 'income or expense']);
  return { ...map, ...(category >= 0 && { category }), ...(source >= 0 && { source }), ...(currency >= 0 && { currency }), ...(direction >= 0 && { direction }) };
}

function guessAmountColumns(header: string[]): ColumnMap {
  const date = Math.max(0, find(header, KEYWORDS.date));
  const debit = find(header, KEYWORDS.debit, [date]);
  const credit = find(header, KEYWORDS.credit, [date, debit]);
  const text = Math.max(0, find(header, KEYWORDS.text, [date, debit, credit]));
  if (debit >= 0 && credit >= 0 && debit !== credit) return { date, text, debit, credit };
  const amount = find(header, KEYWORDS.amount, [date, text]);
  if (amount < 0 && (debit >= 0 || credit >= 0)) return { date, text, ...(debit >= 0 && { debit }), ...(credit >= 0 && { credit }) };
  return { date, text, amount: amount >= 0 ? amount : Math.min(header.length - 1, 2) };
}

/** Datum in den Formaten 31.12.2026, 31.12.26, 2026-12-31, 31/12/2026 → YYYY-MM-DD. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T]\d)/);
  const local = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:$|\s)/);
  if (!iso && !local) return null;
  const y = iso ? iso[1]! : local![3]!.length === 2 ? '20' + local![3] : local![3]!;
  const m = Number(iso ? iso[2] : local![2]);
  const d = Number(iso ? iso[3] : local![1]);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(+y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Betrag wie 1'234.50, -12,30, 1 234.50 CHF → Rappen. */
export function parseAmount(raw: string | undefined): Rappen | null {
  if (!raw) return null;
  let s = raw.replace(/[’'\s]|CHF/gi, '');
  if (s === '' || s === '-') return null;
  // Das letzte Trennzeichen ist das Dezimalzeichen, wenn danach 1–2 Ziffern folgen
  if (s.lastIndexOf(',') > s.lastIndexOf('.') && /,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Only the leg actually settled in CHF is usable in a CHF budget. The
 * exchange/commission column is informational and must not be added twice. */
export function yuhChfAmount(row: string[], cols: YuhColumns): { amount: Rappen } | { skip: 'foreign' | 'nonCash' | 'invalid' } {
  const debit = row[cols.debit]?.trim(), credit = row[cols.credit]?.trim();
  if (!debit && !credit) return { skip: 'nonCash' };
  let chf = 0, hasChf = false;
  for (const [raw, curCol, isDebit] of [[debit, cols.debitCurrency, true], [credit, cols.creditCurrency, false]] as const) {
    if (!raw) continue;
    const currency = row[curCol]?.trim().toUpperCase();
    if (!currency) return { skip: 'invalid' };
    if (currency !== 'CHF') continue;
    const value = parseAmount(raw.replace('−', '-'));
    if (value === null) return { skip: 'invalid' };
    hasChf = true;
    chf += isDebit ? -Math.abs(value) : value;
  }
  if (!hasChf) return { skip: 'foreign' };
  return chf && Number.isSafeInteger(chf) ? { amount: chf } : { skip: 'nonCash' };
}

type BankEntry = { source: string; transaction: ParsedTransaction; movement?: string };

/** Use name words as evidence. Account numbers and card numbers do not belong in this field. */
function yuhCounterparty(value: string | undefined): string | undefined {
  const words = value?.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu);
  return words?.filter(word => !/\p{N}/u.test(word)).join(' ').slice(0, 160).trim() || undefined;
}

function inspectYuhRows(table: CsvTable, cols: YuhColumns) {
  const entries: BankEntry[] = [];
  const skipped = { invalid: 0, foreign: 0, nonCash: 0, unbooked: 0 };
  for (const row of table.rows) {
    const activity = (row[cols.activity] ?? '').trim().toUpperCase();
    if (notBooked(activity)) { skipped.unbooked++; continue; }
    const date = parseDate(row[cols.date] ?? '');
    if (!date) { skipped.invalid++; continue; }
    const cash = yuhChfAmount(row, cols);
    if ('skip' in cash) { skipped[cash.skip]++; continue; }
    const movement = yuhMovement(row,cols);
    const text = (row[cols.name] ?? '').replace(/\s+/g, ' ').trim();
    let counterparty: string | undefined;
    if (activity === 'PAYMENT_TRANSACTION_IN' && cash.amount > 0) counterparty = yuhCounterparty(row[cols.sender]);
    if (activity === 'PAYMENT_TRANSACTION_OUT' && cash.amount < 0) counterparty = yuhCounterparty(row[cols.recipient]);
    entries.push({ source: '', movement, transaction: {
      date, text, amount: cash.amount, ...(movement && { category: movement }), ...(counterparty && { counterparty }),
    } });
  }
  return { entries, ...skipped };
}

export function inspectBankRows(table: CsvTable, map: ColumnMap) {
  const yuh = yuhColumns(table.header);
  if (yuh) return inspectYuhRows(table, yuh);
  const entries: BankEntry[] = [];
  let foreign = 0;
  let invalid = 0;
  for (const r of table.rows) {
    const date = parseDate(r[map.date] ?? '');
    const currency = map.currency === undefined ? 'CHF' : r[map.currency]?.trim().toUpperCase();
    if (currency !== 'CHF') { foreign++; continue; }
    if (!date) { invalid++; continue; }
    let amount: Rappen | null;
    if (map.debit !== undefined || map.credit !== undefined) {
      const d = parseAmount(r[map.debit ?? -1]);
      const c = parseAmount(r[map.credit ?? -1]);
      if (d === null && c === null) { invalid++; continue; }
      amount = (c ?? 0) - Math.abs(d ?? 0);
    } else {
      amount = parseAmount(r[map.amount ?? -1]);
    }
    if (amount === null || amount === 0) { invalid++; continue; }
    if (map.direction !== undefined) {
      const dir = norm(r[map.direction] ?? '');
      if (['ausgabe', 'ausgaben', 'expense', 'debit'].includes(dir)) amount = -Math.abs(amount);
      else if (['einnahme', 'einnahmen', 'income', 'credit'].includes(dir)) amount = Math.abs(amount);
      else { invalid++; continue; }
    }
    const category = map.category !== undefined ? (r[map.category] ?? '').trim() : '';
    const source = statementSource(r, map.source, table.statement).replace(/\s+/g, '').toUpperCase();
    entries.push({ source, transaction: { date, text: (r[map.text] ?? '').replace(/\s+/g, ' ').trim(), amount, ...(category ? { category } : {}) } });
  }
  return { entries, invalid, foreign, nonCash: 0, unbooked: 0 };
}

export function toTransactions(table: CsvTable, map: ColumnMap): ParsedTransaction[] {
  return inspectBankRows(table, map).entries.map(entry => entry.transaction);
}
