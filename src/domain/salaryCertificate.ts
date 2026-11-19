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

/** The standard Swiss form prints its title and the gross/net salary sections
 * in several languages. An isolated mention of the certificate also occurs on payslips. */
export function isAnnualSalaryCertificate(lines: readonly string[]): boolean {
  const folded = lines.map(line => fold(line).replace(/\s+/g, ' '));
  const title = /^(?:form(?:ular)?\s*11[\s.:–-]+)?(?:a\b[\s.:[\]|x☒✓–-]*)?(?:(?:schweizer(?:ischer)?\s+)?lohnausweis|certificat de salaire|certificato di salario|(?:swiss\s+)?salary certificate)\b/;
  if (!folded.some(line => title.test(line))) return false;
  if (folded.some(line => /^(?:lohnabrechnung|gehaltsabrechnung|payslip|bulletin de (?:paie|salaire))\b/.test(line))) {
    if (!folded.some(line => /^8[.\s]+(?:bruttolohn|salaire brut|salario lordo|gross salary)\b/.test(line)) ||
        !folded.some(line => /^11[.\s]+(?:nettolohn|salaire net|salario netto|net salary)\b/.test(line))) return false;
  }
  return folded.some(line => /\b(?:bruttolohn|nettolohn|salaire (?:brut|net)|salario (?:lordo|netto)|(?:gross|net) salary)\b/.test(line));
}
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

function buildCertificate(entries: Entry[], fromScan = false): SalaryCertificate {
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
  const datedYear = from && to && from <= to && from.slice(0,4) === to.slice(0,4) ? Number(to.slice(0,4)) : undefined;
  if (from && to && datedYear && (fromScan || !certificate.year || certificate.year === datedYear)) {
    if (fromScan && entries.some(entry => entry.key === 'year' && entry.value.trim() && Number(entry.value) !== datedYear)) {
      certificate.warnings.push('Das gescannte Jahresfeld weicht vom Jahr der beiden Periodendaten ab. Frank zeigt das Jahr der Lohnperiode. Bitte mit dem Ausweis vergleichen.');
    }
    certificate.period = {from, to};
    certificate.year = datedYear;
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
const headerDates = new RegExp('^(?:D\\s+[|\\[]?\\s*)?(\\d{4})\\s+(?:E\\s+[|\\[]?\\s*)?(' + dateToken + ')\\s+(' + dateToken + ')(?:\\s+G\\b.*|\\s+[xX])?$');
const endValue = /(?:^|\s|[=:])((?:CHF\s*)?[+-]?(?:\d{1,3}(?:['’\u202f\u00a0 ]\d{3})+|\d+)(?:[.,](?:\d{1,2}|[-–]))?(?:\s*CHF)?|[xX☒✓])$/i;

// The official form places a section and a subposition on the same line.
export function salaryPosition(line: string): string | undefined {
  const nested = /(?:^|\s)((?:13\.[12]\.[123]|10\.[12])\b)\s+(?=[^\d])/.exec(line);
  const leading = /^(\d+)\b/.exec(line.trim())?.[1];
  if (leading && nested && leading !== nested[1]!.split('.')[0]) return undefined;
  const key = nested?.[1] ?? fieldCode(line);
  return key && codes.has(key) ? key : undefined;
}

/** Liest nummerierte Positionen, ergänzt sie um explizite Formularfelder der ESTV. */
export function parseSalaryCertificateText(lines: string[], formEntries: Entry[] = [], fromScan = false): SalaryCertificate {
  const entries: Entry[] = [...formEntries];
  if (lines.some(line => /^b\s*[|\[.(]*\s*[x☒✓]+[|.)\]\s]*(?:rentenbescheinigung|attestation de rentes|attestazione delle rendite)/i.test(line.trim()))) {
    throw new Error('Dieses Formular ist als Rentenbescheinigung markiert. Bitte einen Lohnausweis wählen.');
  }
  for (const raw of lines) {
    const line = raw.trim().replace(/[\x00-\x1f]/g, ' ')
      // The raised Swiss thousands separator can appear as a prime or degree
      // sign. Normalize it only inside a well-formed group of three digits.
      .replace(/(\d)[°′‘ʼ]\s*(?=\d{3}(?:\D|$))/g, "$1'");
    const year = labelYear.exec(line)?.[1] ?? /^D\s+((?:19|20)\d{2})(?:\s+E|$)/.exec(line)?.[1];
    if (year) entries.push({key:'year', value:year});
    const dates = labelDates.exec(line);
    const header = headerDates.exec(line);
    const datesRow = header && (fromScan || /^(?:19|20)\d{2}$/.test(header[1]!)) ? header : undefined;
    if (datesRow) entries.push({key:'year', value:datesRow[1]!});
    if (dates || datesRow) entries.push(
      {key:'from', value:dates ? dates[1]! : datesRow![2]!},
      {key:'to', value:dates ? dates[2]! : datesRow![3]!},
    );
    const key = salaryPosition(line);
    if (!key) continue;
    const body = line.replace(/^\d+(?:\.\d+)*\.?\s*/, '');
    const val = endValue.exec(body)?.[1];
    if (val) entries.push({key, value:val});
  }
  const certificate = buildCertificate(entries, fromScan);
  if (fromScan) {
    const { gross, social, pension, pensionPurchase, net } = certificate;
    if (gross !== undefined && social !== undefined && pension !== undefined && net !== undefined &&
        Math.abs(gross - social - pension - (pensionPurchase ?? 0) - net) > 100) {
      // The printed form defines 11 = 8 − 9 − 10.1 − 10.2. There is no
      // reliable way to decide which of several OCR values caused the mismatch.
      for (const key of ['gross', 'social', 'pension', 'pensionPurchase', 'net'] as const) delete certificate[key];
      certificate.warnings.push('Die gescannten Ziffern 8 bis 11 stimmen rechnerisch nicht überein. Trage diese Beträge aus dem Ausweis ein.');
    }
  }
  return certificate;
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
