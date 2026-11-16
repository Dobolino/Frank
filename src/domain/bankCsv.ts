import type { Rappen } from './money';

/**
 * CSV-Export einer Bank einlesen. Erkennt Trennzeichen, Kopfzeile und Spalten
 * (Datum, Text, Betrag oder Belastung/Gutschrift) bei gängigen Schweizer Banken.
 * Die Datei verlässt das Gerät nicht.
 */

export interface CsvTable {
  header: string[];
  rows: string[][];
}

export interface ColumnMap {
  date: number;
  text: number;
  /** Eine Spalte mit Vorzeichen (negativ = Ausgabe). */
  amount?: number;
  /** Getrennte Spalten: Belastung (Ausgabe) und Gutschrift (Eingang). */
  debit?: number;
  credit?: number;
}

export interface ParsedTransaction {
  /** YYYY-MM-DD */
  date: string;
  text: string;
  /** Negativ = Ausgabe, positiv = Eingang. */
  amount: Rappen;
}

/** Eine CSV-Zeile mit Anführungszeichen korrekt aufteilen. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const KEYWORDS = {
  date: ['buchungsdatum', 'datum', 'date', 'booked at', 'abschlussdatum', 'valuta', 'transaktionsdatum', 'booking date'],
  text: ['buchungstext', 'beschreibung', 'avisierungstext', 'text', 'description', 'activity name', 'details', 'mitteilung', 'empfänger', 'zahlungsempfänger'],
  amount: ['betrag', 'amount', 'credit/debit amount', 'umsatz'],
  debit: ['belastung', 'lastschrift', 'debit', 'soll', 'ausgang'],
  credit: ['gutschrift', 'credit', 'haben', 'eingang'],
};

const norm = (s: string) => s.toLowerCase().replace(/["']/g, '').trim();

/** Text der CSV-Datei in Kopfzeile und Datenzeilen zerlegen. Vorspann (Kontoinfo) wird übersprungen. */
export function parseCsv(content: string): CsvTable {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const sample = lines.slice(0, 30).join('\n');
  const sep = [';', ',', '\t'].map((s) => [s, sample.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const split = lines.map((l) => splitLine(l, sep));
  // Kopfzeile: erste Zeile mit mindestens drei Spalten, einem Datums-Stichwort und ohne Datumswerte (Vorspann überspringen)
  let headerIdx = split.findIndex(
    (r) => r.length >= 3 && r.some((c) => KEYWORDS.date.some((k) => norm(c).startsWith(k))) && !r.some((c) => parseDate(c) !== null),
  );
  if (headerIdx < 0) headerIdx = 0;
  return { header: split[headerIdx]!, rows: split.slice(headerIdx + 1).filter((r) => r.length >= 2) };
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
  const date = Math.max(0, find(header, KEYWORDS.date));
  const debit = find(header, KEYWORDS.debit, [date]);
  const credit = find(header, KEYWORDS.credit, [date, debit]);
  const text = Math.max(0, find(header, KEYWORDS.text, [date, debit, credit]));
  if (debit >= 0 && credit >= 0 && debit !== credit) return { date, text, debit, credit };
  const amount = find(header, KEYWORDS.amount, [date, text]);
  return { date, text, amount: amount >= 0 ? amount : debit >= 0 ? debit : Math.min(header.length - 1, 2) };
}

/** Datum in den Formaten 31.12.2026, 31.12.26, 2026-12-31, 31/12/2026 → YYYY-MM-DD. */
export function parseDate(raw: string): string | null {
  const s = raw.trim().slice(0, 10);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = raw.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (!m) return null;
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  const date = `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) ? date : null;
}

/** Betrag wie 1'234.50, -12,30, 1 234.50 CHF → Rappen. */
export function parseAmount(raw: string | undefined): Rappen | null {
  if (!raw) return null;
  let s = raw.replace(/[’'\s]|CHF/gi, '');
  if (s === '' || s === '-') return null;
  // Das letzte Trennzeichen ist das Dezimalzeichen, wenn danach 1–2 Ziffern folgen
  if (s.lastIndexOf(',') > s.lastIndexOf('.') && /,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function toTransactions(table: CsvTable, map: ColumnMap): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const r of table.rows) {
    const date = parseDate(r[map.date] ?? '');
    if (!date) continue;
    let amount: Rappen | null;
    if (map.debit !== undefined && map.credit !== undefined) {
      const d = parseAmount(r[map.debit]);
      const c = parseAmount(r[map.credit]);
      if (d === null && c === null) continue;
      amount = (c ?? 0) - Math.abs(d ?? 0);
    } else {
      amount = parseAmount(r[map.amount ?? -1]);
    }
    if (amount === null || amount === 0) continue;
    out.push({ date, text: (r[map.text] ?? '').replace(/\s+/g, ' ').trim(), amount });
  }
  return out;
}
