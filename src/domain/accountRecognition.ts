import { sourceTypeForColumn, type CsvTable } from './bankCsv';
import type { AppData, ImportAccount } from './types';

export interface AccountSource {
  /** Source-column value, retained only while this file is being reviewed. */
  source: string;
  type: ImportAccount['type'];
  bankId?: string;
  masked?: boolean;
}

export interface RecognizedSource extends AccountSource {
  fingerprint?: string;
  accountId?: string;
}

export interface AccountRecognitionPreview {
  key: string;
  sources: RecognizedSource[];
}

const normalized = (s: string) => s.normalize('NFKC').trim().toUpperCase();
const compact = (s: string) => normalized(s).replace(/\s+/g, '');
const isMasked = (s: string) => /[•●*]|X{2,}/.test(s);
const ibanFormat = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

// ISO 13616 / mod 97-10. Check the IBAN before using its clearing number or
// treating it as globally unique in exports without an institution header.
function validIban(value: string): boolean {
  if (!ibanFormat.test(value) || isMasked(value)) return false;
  if (/^(CH|LI)/.test(value) && value.length !== 21) return false;
  const rotated = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const char of rotated) {
    const code = char.charCodeAt(0);
    remainder = code > 57
      ? (remainder * 100 + code - 55) % 97
      : (remainder * 10 + code - 48) % 97;
  }
  return remainder === 1;
}

// Only unambiguous identifiers. Some products share their clearing institution
// (e.g. Yuh and Swissquote); the statement issuer can distinguish those.
const swissClearingIds: Record<string, string> = {
  '00230': 'ubs', '09000': 'postfinance', '00700': 'zkb',
};

function isPaymentCard(value: string): boolean {
  // Common Visa, Mastercard and Amex issuer ranges plus their check digit.
  if (!/^(?:4\d{12}(?:\d{3}(?:\d{3})?)?|5[1-5]\d{14}|2\d{15}|3[47]\d{13})$/.test(value)) return false;
  if (value[0] === '2' && (Number(value.slice(0, 6)) < 222100 || Number(value.slice(0, 6)) > 272099)) return false;
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    const digit = Number(value[i]);
    const weighted = (value.length - i) % 2 === 0 ? 2 * digit : digit;
    total += weighted > 9 ? weighted - 9 : weighted;
  }
  return total % 10 === 0;
}

export function describeAccountSources(
  table: CsvTable,
  sources: string[],
  kind: 'expenses' | 'invest',
  sourceColumn?: number,
): AccountSource[] {
  const column = sourceColumn === undefined ? undefined : sourceTypeForColumn(table.header[sourceColumn] ?? '');
  return sources.map(source => {
    const value = compact(source);
    const masked = isMasked(value);
    const ibanLike = /^[A-Z]{2}\d{2}/.test(value);
    // Long domestic account identifiers can look like card numbers. Prefer an
    // explicit column type over a card-shaped number in a combined column.
    const maskedCard = /^[X*•●\d]+$/.test(value) && masked && /\d{4}$/.test(value);
    const type = kind === 'invest' ? 'depot' : ibanLike ? 'bank'
      : column ?? table.statement?.sourceType ?? (maskedCard || isPaymentCard(value) ? 'card' : 'bank');
    const iid = value.startsWith('CH') && validIban(value) ? value.slice(4, 9) : '';
    const bankId = table.statement?.bankId ?? swissClearingIds[iid];
    return { source, type: type === 'depot' && kind === 'expenses' ? 'bank' : type, bankId, masked };
  });
}

/** Fingerprint material must only ever be used in memory. */
function identity(input: AccountSource): string | undefined {
  const value = compact(input.source);
  if (validIban(value)) return JSON.stringify([input.type === 'depot' ? 'depot' : 'bank', 'iban', value]);
  // Non-IBAN account numbers, broker IDs and card suffixes only have meaning
  // within the issuer. A shared format/filename or an institution alone is insufficient.
  if (!input.bankId || value.length > 128) return undefined;
  const masked = isMasked(value);
  if (masked) {
    // A placeholder such as CH12 XXXX ... contains only check digits, common
    // to multiple hidden accounts. Preserve any *visible* issuer prefix as well.
    const visibleAccount = /^(CH|LI)\d{2}/.test(value) ? value.slice(9) : value;
    if (!/\d{4}/.test(visibleAccount)) return undefined;
  } else if (ibanFormat.test(value) || !/\d/.test(value) || value.length < 4 || !/^[A-Z\d._:/-]+$/.test(value)) {
    return undefined;
  }
  const identifier = masked ? value.replace(/[•●*X]+/g, '*') : normalized(input.source);
  return JSON.stringify([input.type, normalized(input.bankId), identifier]);
}

const hex = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');

export const newAccountRecognitionKey = () => hex(crypto.getRandomValues(new Uint8Array(32)));

export async function prepareAccountRecognition(
  data: AppData,
  sources: readonly AccountSource[],
): Promise<AccountRecognitionPreview> {
  const existing = data.accountRecognition;
  const fallback = { key: '', sources: sources.map(source => ({ ...source })) };
  if (!globalThis.crypto?.subtle) return fallback;
  try {
    const key = existing?.key ?? newAccountRecognitionKey();
    const raw = Uint8Array.from(key.match(/../g)!, h => parseInt(h, 16));
    const signingKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const accounts = data.importAccounts ?? [];
    const matches = await Promise.all(sources.map(async source => {
      const material = identity(source);
      if (!material) return { ...source };
      const mac = await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(material));
      const fingerprint = hex(new Uint8Array(mac));
      const id = existing?.bindings[fingerprint];
      const target = accounts.find(a => a.id === id && (a.type === 'depot') === (source.type === 'depot'));
      return { ...source, fingerprint, accountId: target?.id };
    }));
    return { key, sources: matches };
  } catch {
    // The CSV itself remains importable when WebCrypto is unavailable.
    return fallback;
  }
}

export function hasAccountBinding(data: AppData, accountId: string): boolean {
  return !!data.accountRecognition && Object.values(data.accountRecognition.bindings).includes(accountId);
}

/** Call inside the same store update that commits the accounts and bookings. */
export function rememberAccountSources(
  draft: AppData,
  prepared: AccountRecognitionPreview,
  assignments: ReadonlyMap<string, string>,
): void {
  if (!prepared.key || (draft.accountRecognition && draft.accountRecognition.key !== prepared.key)) return;
  const bindings = new Map<string, Set<string>>();
  for (const { source, type, fingerprint } of prepared.sources) {
    const accountId = assignments.get(source);
    if (!fingerprint || !accountId) continue;
    const valid = draft.importAccounts?.some(a => a.id === accountId && (a.type === 'depot') === (type === 'depot'));
    if (!valid) continue;
    const choices = bindings.get(fingerprint) ?? new Set<string>();
    choices.add(accountId);
    bindings.set(fingerprint, choices);
  }
  if (!bindings.size) return;
  const recognition = draft.accountRecognition ??= { key: prepared.key, bindings: {} };
  for (const [fingerprint, choices] of bindings) {
    // Two distinguishable source labels can normalize to the same partial
    // identifier. If reviewed separately, further imports require review again.
    if (choices.size > 1) delete recognition.bindings[fingerprint];
    else recognition.bindings[fingerprint] = [...choices][0]!;
  }
}
