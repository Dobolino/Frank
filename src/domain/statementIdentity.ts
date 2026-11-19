import { yuhColumns } from './yuhCsv';

/** These hints live only in the local import preview. */
export interface StatementIdentity {
  format?: 'yuh-activities';
  bankId?: string;
  source?: string;
  sourceType?: 'bank' | 'card' | 'depot';
}

const key = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

const bankColumns = new Set([
  'konto', 'eigenes konto', 'kontonummer', 'eigene kontonummer', 'konto nr', 'konto iban', 'eigene iban',
  'account', 'account number', 'account id', 'account no', 'own account', 'own iban', 'account iban',
  'numero de compte', 'numero conto',
]);
const cardColumns = new Set([
  'kartennummer', 'karten nr', 'kreditkartennummer', 'card number', 'card no', 'numero de carte', 'numero carta',
]);
const depotColumns = new Set([
  'depot', 'depotnummer', 'depot nr', 'portfolio number', 'depot number', 'securities account',
]);

export function sourceTypeForColumn(header: string): StatementIdentity['sourceType'] {
  const name = key(header);
  if (cardColumns.has(name)) return 'card';
  if (depotColumns.has(name)) return 'depot';
  if (bankColumns.has(name) || name === 'iban') return 'bank';
}

/** An unqualified IBAN in the booking table can belong to the counterparty. */
export function isSourceColumn(label: string): boolean {
  const name = key(label);
  return name === 'konto oder kartennummer' || name === 'account or card number'
    || (name !== 'iban' && sourceTypeForColumn(label) !== undefined);
}

function bankFromLabel(text: string): string | undefined {
  const name = key(text);
  if (/^ubs\b/.test(name)) return 'ubs';
  if (/^yuh\b/.test(name)) return 'yuh';
  if (/^swissquote\b/.test(name)) return 'swissquote';
  if (/^postfinance\b/.test(name)) return 'postfinance';
  if (/^raiffeisen(?:bank)?\b/.test(name)) return 'raiffeisen';
  if (/^(?:zkb|zurcher kantonalbank)\b/.test(name)) return 'zkb';
  if (/^(?:bkb|basler kantonalbank)\b/.test(name)) return 'bkb';
  if (/^migros\s*bank\b/.test(name)) return 'migrosbank';
  if (/^viseca\b/.test(name)) return 'viseca';
}

const unique = <T,>(values: Set<T>) => values.size === 1 ? values.values().next().value : undefined;
const bankKeys = new Set(['bank', 'institut', 'finanzinstitut', 'bank name', 'banque', 'banca', 'broker']);

export function readStatementIdentity(preamble: string[][], header: string[]): StatementIdentity | undefined {
  if (yuhColumns(header)) return { format: 'yuh-activities', bankId: 'yuh', sourceType: 'bank' };
  const banks = new Set<string>();
  const numbers = new Map<string, StatementIdentity['sourceType']>();
  const ibans = new Set<string>();
  const labels = header.map(key);
  // This combination is specific to the UBS personal finance export.
  if (['transaktionsdatum', 'konto oder kartennummer', 'beschreibung', 'einnahmen oder ausgaben', 'betrag', 'wahrung', 'kategorie']
    .every(label => labels.includes(label))) banks.add('ubs');

  for (const fields of preamble) {
    const cells = fields.filter(Boolean);
    if (cells.length === 1) {
      const line = cells[0]!;
      const colon = line.indexOf(':');
      if (colon > 0) cells.splice(0, 1, line.slice(0, colon), line.slice(colon + 1));
      // A single organisation name above the statement is also common.
      else if (/^[\p{L} .-]{2,55}$/u.test(line) && /^(?:UBS(?: Switzerland)?(?: AG)?|Yuh(?: SA)?|Swissquote(?: Bank)?(?: SA| AG)?|PostFinance(?: AG| SA)?|Raiffeisen(?: Schweiz)?|Zürcher Kantonalbank|Basler Kantonalbank|Migros Bank(?: AG)?|Viseca(?: Card Services)?(?: SA| AG)?)$/i.test(line)) {
        const bank = bankFromLabel(line);
        if (bank) banks.add(bank);
      }
    }
    if (cells.length !== 2) continue;
    const [label, raw] = cells as [string, string];
    const name = key(label);
    if (bankKeys.has(name)) {
      const bank = bankFromLabel(raw);
      if (bank) banks.add(bank);
      continue;
    }
    const type = sourceTypeForColumn(label);
    const value = raw.trim();
    if (!type || !value || value.length > 100) continue;
    // A generic account name ("Privatkonto") may repeat across institutions.
    if (!/\d/.test(value)) continue;
    const compact = value.replace(/\s+/g, '').toUpperCase();
    if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) ibans.add(compact);
    else numbers.set(compact, type);
  }
  // An IBAN and the domestic account number can both appear in the preamble.
  const source = ibans.size ? unique(ibans) : unique(new Set(numbers.keys()));
  const bankId = unique(banks);
  const sourceType = source && (ibans.size ? 'bank' : numbers.get(source));
  if (!source && !bankId) return undefined;
  return { ...(bankId && { bankId }), ...(source && { source }), ...(sourceType && { sourceType }) };
}

export function statementSource(row: string[], column: number | undefined, statement?: StatementIdentity): string {
  // If a per-row column exists, a blank entry is an unidentified source.
  return (column === undefined || column < 0 ? statement?.source : row[column])?.trim() ?? '';
}
