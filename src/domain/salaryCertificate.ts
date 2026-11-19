import { csvRecords } from './bankCsv';
import type { Rappen } from './money';
import { salaryCertificateFields, type SalaryCertificateRecord } from './salaryCertificateRecord';

/** Beträge laut einem einzelnen Lohnausweis, in Rappen für die angegebene Periode. */
export interface SalaryCertificate extends SalaryCertificateRecord {
  year?: number;
  warnings: string[];
}

const positions = new Map(salaryCertificateFields.map(field => [field.number, field.key]));
const codes = new Set([...positions.keys(), '13.1.1', '13.1.2', '13.2.1', '13.2.2', '13.2.3']);
type Entry = { key: string; value: string };

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const names: [RegExp, string][] = [
  [/^(?:d\s+)?(?:jahr|lohnjahr|annee|anno|year)\b/, 'year'],
  [/^(?:von|du|dal|from)$/, 'from'], [/^(?:bis|au|al|to)$/, 'to'],
  [/^(?:bruttolohn|salaire brut|salario lordo|gross salary)\b/, '8'],
  [/^(?:nettolohn|salaire net|salario netto|net salary)\b/, '11'],
  [/^(?:sozialabzuge|beitrage ahv|cotisations avs|contributi avs)\b/, '9'],
  [/^(?:ordentliche beitrage|cotisations ordinaires|contributi ordinari)\b/, '10.1'],
  [/^(?:beitrage fur den einkauf|cotisations pour le rachat|contributi per il riscatto)\b/, '10.2'],
  [/^(?:effektive spesen|effektivspesen|frais effectifs|spese effettive)\b/, '13.1'],
  [/^(?:pauschalspesen|pauschale spesen|frais forfaitaires|spese forfettarie)\b/, '13.2'],
];

function fieldCode(text: string): string | undefined {
  const label = fold(text);
  const number = /^(?:(?:ziffer|chiffre|cifra|code)\s+)?(\d+(?:\.\d+)*)(?:[.):])?(?=\s|$)/.exec(label)?.[1];
  if (number) return codes.has(number) ? number : undefined;
  return names.find(([pattern]) => pattern.test(label))?.[1];
}

const amountPattern = /^(?:CHF\s*)?([+-]?)(\d{1,3}(?:['’\u202f\u00a0 ]\d{3})+|\d+)(?:[.,](\d{1,2}|[-–]))?(?:\s*CHF)?$/i;
function chfValue(value: string): Rappen | undefined {
  const match = amountPattern.exec(value.trim());
  if (!match) return undefined;
  const francs = Number(match[2]!.replace(/\D/g, ''));
  const cents = Number((match[3] ?? '').replace(/[-–]/, '').padEnd(2, '0'));
  const amount = (match[1] === '-' ? -1 : 1) * (francs * 100 + cents);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

function isoDate(text: string) {
  const input = text.trim();
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(input);
  const iso = dmy ? dmy[3] + '-' + dmy[2]!.padStart(2,'0') + '-' + dmy[1]!.padStart(2,'0') : input;
  if (!/^\d{4}-\d\d-\d\d$/.test(iso)) return undefined;
  const test = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(test.getTime()) && test.toISOString().slice(0,10) === iso ? iso : undefined;
}

function buildCertificate(entries: Entry[]): SalaryCertificate {
  const certificate: SalaryCertificate = { warnings: [] };
  const numbers = new Map<string, Set<number>>();
  const years = new Set<number>(), starts = new Set<string>(), ends = new Set<string>();
  const unread = new Set<string>();
  for (const {key, value} of entries) {
    if (!value.trim()) continue;
    if (key === 'year') {
      if (/^(?:19|20)\d\d$/.test(value.trim())) years.add(Number(value));
    } else if (key === 'from' || key === 'to') {
      const date = isoDate(value);
      if (date) (key === 'from' ? starts : ends).add(date);
    } else if (codes.has(key)) {
      const amount = chfValue(value);
      if (amount === undefined) {
        unread.add(key);
      } else {
        const amounts = numbers.get(key) ?? new Set<number>();
        amounts.add(['9','10.1','10.2'].includes(key) ? Math.abs(amount) : amount);
        numbers.set(key, amounts);
      }
    }
  }
  if (years.size > 1 || starts.size > 1 || ends.size > 1) {
    throw new Error('Mehrere Lohnperioden gefunden. Bitte einen einzelnen Lohnausweis wählen.');
  }
  const [from] = starts, [to] = ends;
  certificate.year = [...years][0];
  if (from && to && from <= to && from.slice(0,4) === to.slice(0,4) &&
      (!certificate.year || certificate.year === Number(to.slice(0,4)))) {
    certificate.period = {from, to};
    certificate.year ??= Number(to.slice(0,4));
  } else if (from || to) {
    certificate.warnings.push('Die Lohnperiode ist unvollständig oder passt nicht zum Jahr. Bitte mit dem Ausweis vergleichen.');
  }

  for (const [code, property] of positions) {
    const parts = [...numbers.keys()].filter(key => key.startsWith(code + '.'));
    const all = [code, ...parts];
    if (all.some(key => (numbers.get(key)?.size ?? 0) > 1)) {
      certificate.warnings.push('Widersprüchliche Beträge bei Ziffer ' + code + '. Bitte manuell prüfen.');
      continue;
    }
    const total = numbers.get(code)?.values().next().value;
    const subtotal = parts.reduce((sum, key) => sum + [...numbers.get(key)!][0]!, 0);
    if (total !== undefined && parts.length && subtotal > total) {
      certificate.warnings.push('Die Unterpositionen von Ziffer ' + code + ' übersteigen das Total. Bitte prüfen.');
      continue;
    }
    if (total !== undefined || parts.length) certificate[property] = total ?? subtotal;
  }
  if ([...unread].some(key => key.startsWith('13.'))) {
    certificate.warnings.push('Einige Spesenpositionen enthalten nur ein Kreuz oder keinen lesbaren Geldbetrag. Prüfe die bezifferten Beträge im Original.');
  }
  if (![...positions.values()].some(property => certificate[property] !== undefined)) {
    throw new Error('Keine eindeutigen Lohn- oder Spesenbeträge gefunden. Prüfe das Original oder erfasse die Beträge von Hand.');
  }
  return certificate;
}

const dateToken = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./]\\d{1,2}[./]\\d{4})';
const labelYear = /\b(?:Jahr|Année|Anno|Year)\s*[:=]?\s*((?:19|20)\d{2})\b/i;
const labelDates = new RegExp('(?:von|du|dal|from|Periode|Zeitraum)\\s*:?\\s*(' + dateToken + ')\\s*(?:bis|au|al|to|[-–])\\s*(' + dateToken + ')', 'i');
const headerDates = new RegExp('^(?:D\\s+)?((?:19|20)\\d{2})\\s+(?:E\\s+)?(' + dateToken + ')\\s+(' + dateToken + ')(?:\\s+G)?(?:\\s+[xX])?$');
const endValue = /(?:^|\s|[=:])((?:CHF\s*)?[+-]?(?:\d{1,3}(?:['’\u202f\u00a0 ]\d{3})+|\d+)(?:[.,](?:\d{1,2}|[-–]))?(?:\s*CHF)?|[xX☒✓])$/i;

/** Liest nummerierte Positionen, ergänzt sie um explizite Formularfelder der ESTV. */
export function parseSalaryCertificateText(lines: string[], formEntries: Entry[] = []): SalaryCertificate {
  const entries: Entry[] = [...formEntries];
  for (const raw of lines) {
    const line = raw.trim().replace(/[\x00-\x1f]/g, ' ');
    const year = labelYear.exec(line)?.[1] ?? /^D\s+((?:19|20)\d{2})(?:\s+E|$)/.exec(line)?.[1];
    if (year) entries.push({key:'year', value:year});
    const dates = labelDates.exec(line);
    const datesRow = headerDates.exec(line);
    if (datesRow) entries.push({key:'year', value:datesRow[1]!});
    if (dates || datesRow) entries.push(
      {key:'from', value:dates ? dates[1]! : datesRow![2]!},
      {key:'to', value:dates ? dates[2]! : datesRow![3]!},
    );
    // The official form prints 13.2 and 13.2.1 on the same line. Take the
    // detail code. Similar typography is used for the two pension lines.
    const nested = /(?:^|\s)((?:13\.[12]\.[123]|10\.[12])\b)\s+(?=[^\d])/.exec(line);
    const candidate = nested ? line.slice(nested.index).trim() : line;
    const key = fieldCode(candidate);
    if (!key || !codes.has(key)) continue;
    const body = candidate.replace(/^\d+(?:\.\d+)*\.?\s*/, '');
    const val = endValue.exec(body)?.[1];
    if (val) entries.push({key, value:val});
  }
  return buildCertificate(entries);
}

/** Long form (Ziffer;Betrag;Jahr), or a single record with named columns. */
export function parseSalaryCertificateCsv(text: string): SalaryCertificate {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const candidates = [';', '\t', ','].map(sep => csvRecords(clean, sep));
  const rows = candidates.sort((a,b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))[0]!;
  const [header = [], ...body] = rows;
  const labels = header.map(fold);
  const codeIndex = labels.findIndex(l => /^(?:ziffer|chiffre|cifra|code|feld|position)$/.test(l));
  const amountIndex = labels.findIndex(l => /^(?:betrag|valeur|montant|importo|value|betrag in|amount)(?:\s*\(?chf\)?)?$/.test(l));
  const yearIndex = labels.findIndex(l => fieldCode(l) === 'year');
  const entries: Entry[] = [];
  if (codeIndex >= 0 && amountIndex >= 0) {
    for (const row of body) {
      const key = fieldCode(row[codeIndex] ?? '');
      if (key) entries.push({key, value:row[amountIndex] ?? ''});
      if (yearIndex >= 0) entries.push({key:'year', value:row[yearIndex] ?? ''});
    }
  } else {
    if (body.length > 1) throw new Error('Bitte einen Lohnausweis pro CSV verwenden oder die Spalten «Ziffer;Betrag;Jahr» wählen.');
    for (const [index, label] of labels.entries()) {
      const key = fieldCode(label);
      if (key) entries.push({key, value:body[0]?.[index] ?? ''});
    }
  }
  return buildCertificate(entries);
}
