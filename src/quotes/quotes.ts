/**
 * Kursabfrage bei einem Kursdienst mit eigenem API-Key.
 * Der Key liegt nur im LocalStorage dieses Geräts, nicht in den Finanzdaten und nicht im Backup.
 * An den Dienst gehen nur Tickersymbole und Währungen, nie Stückzahlen oder Beträge.
 */

export type QuoteProvider = 'twelvedata' | 'alphavantage';

export interface QuoteConfig {
  provider: QuoteProvider;
  apiKey: string;
}

export const PROVIDERS: Record<QuoteProvider, { label: string; signup: string; limits: string }> = {
  twelvedata: {
    label: 'Twelve Data',
    signup: 'https://twelvedata.com/register',
    limits: 'Gratis: 8 Abfragen pro Minute, 800 pro Tag. Börsen ausserhalb der USA teils nur im Bezahlangebot.',
  },
  alphavantage: {
    label: 'Alpha Vantage',
    signup: 'https://www.alphavantage.co/support/#api-key',
    limits: 'Gratis: 25 Abfragen pro Tag. Schweizer Titel z. B. als «NESN.SWI».',
  },
};

const STORAGE_KEY = 'frank.quotes.v1';

export function loadQuoteConfig(): QuoteConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<QuoteConfig>;
    return c.provider && c.apiKey ? { provider: c.provider, apiKey: c.apiKey } : null;
  } catch {
    return null;
  }
}

export function saveQuoteConfig(c: QuoteConfig | null): void {
  try {
    if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ohne Speicher gilt der Key nur bis zum Neuladen */
  }
}

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly kind: 'limit' | 'auth' | 'notFound' | 'network' | 'other' = 'other',
  ) {
    super(message);
  }
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  type?: string;
  country?: string;
}

export interface FetchedQuote {
  price: number;
  changePct?: number;
  currency?: string;
  asOf: string;
}

type Json = Record<string, unknown>;
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace('%', '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

// ───────────────────────────── Twelve Data ─────────────────────────────

function twelveError(j: Json): QuoteError | null {
  if (j.status !== 'error') return null;
  const code = num(j.code);
  const msg = str(j.message) ?? 'Unbekannter Fehler';
  if (code === 429) return new QuoteError('Abfragelimit erreicht. In einer Minute erneut versuchen.', 'limit');
  if (code === 401 || code === 403) return new QuoteError(`API-Key abgelehnt oder Börse nicht im Angebot: ${msg}`, 'auth');
  if (code === 404 || code === 400) return new QuoteError(`Titel nicht gefunden: ${msg}`, 'notFound');
  return new QuoteError(msg);
}

export function parseTwelveQuote(j: Json): FetchedQuote {
  const err = twelveError(j);
  if (err) throw err;
  const price = num(j.close) ?? num(j.price);
  if (price === undefined) throw new QuoteError('Antwort ohne Kurs.', 'other');
  const ts = num(j.last_quote_at) ?? num(j.timestamp);
  return {
    price,
    changePct: num(j.percent_change),
    currency: str(j.currency),
    asOf: ts ? new Date(ts * 1000).toISOString() : (str(j.datetime) ?? new Date().toISOString()),
  };
}

export function parseTwelveSearch(j: Json): SymbolMatch[] {
  const err = twelveError(j);
  if (err) throw err;
  const data = Array.isArray(j.data) ? (j.data as Json[]) : [];
  return data.map((d) => ({
    symbol: str(d.symbol) ?? '',
    name: str(d.instrument_name) ?? str(d.symbol) ?? '',
    exchange: str(d.exchange),
    currency: str(d.currency),
    type: str(d.instrument_type),
    country: str(d.country),
  }));
}

export function parseTwelveFx(j: Json): number {
  const err = twelveError(j);
  if (err) throw err;
  const rate = num(j.rate);
  if (rate === undefined) throw new QuoteError('Antwort ohne Wechselkurs.');
  return rate;
}

// ───────────────────────────── Alpha Vantage ─────────────────────────────

function alphaError(j: Json): QuoteError | null {
  const note = str(j.Note) ?? str(j.Information);
  if (note) return new QuoteError(`Abfragelimit oder Key-Problem: ${note}`, /rate|limit|call frequency|per day/i.test(note) ? 'limit' : 'auth');
  const e = str(j['Error Message']);
  if (e) return new QuoteError(`Titel nicht gefunden: ${e}`, 'notFound');
  return null;
}

export function parseAlphaQuote(j: Json): FetchedQuote {
  const err = alphaError(j);
  if (err) throw err;
  const q = (j['Global Quote'] ?? {}) as Json;
  const price = num(q['05. price']);
  if (price === undefined) throw new QuoteError('Titel nicht gefunden oder ohne Kurs.', 'notFound');
  const day = str(q['07. latest trading day']);
  return { price, changePct: num(q['10. change percent']), asOf: day ? `${day}T00:00:00.000Z` : new Date().toISOString() };
}

export function parseAlphaSearch(j: Json): SymbolMatch[] {
  const err = alphaError(j);
  if (err) throw err;
  const matches = Array.isArray(j.bestMatches) ? (j.bestMatches as Json[]) : [];
  return matches.map((m) => ({
    symbol: str(m['1. symbol']) ?? '',
    name: str(m['2. name']) ?? '',
    type: str(m['3. type']),
    country: str(m['4. region']),
    currency: str(m['8. currency']),
  }));
}

export function parseAlphaFx(j: Json): number {
  const err = alphaError(j);
  if (err) throw err;
  const r = (j['Realtime Currency Exchange Rate'] ?? {}) as Json;
  const rate = num(r['5. Exchange Rate']);
  if (rate === undefined) throw new QuoteError('Antwort ohne Wechselkurs.');
  return rate;
}

// ───────────────────────────── Abfragen ─────────────────────────────

async function getJson(url: string): Promise<Json> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new QuoteError('Keine Verbindung zum Kursdienst.', 'network');
  }
  if (res.status === 429) throw new QuoteError('Abfragelimit erreicht. Später erneut versuchen.', 'limit');
  try {
    return (await res.json()) as Json;
  } catch {
    throw new QuoteError(`Unerwartete Antwort (HTTP ${res.status}).`);
  }
}

const q = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');

export async function searchSymbols(c: QuoteConfig, query: string): Promise<SymbolMatch[]> {
  if (c.provider === 'twelvedata') {
    return parseTwelveSearch(await getJson(`https://api.twelvedata.com/symbol_search?${q({ symbol: query, outputsize: '15', apikey: c.apiKey })}`));
  }
  return parseAlphaSearch(await getJson(`https://www.alphavantage.co/query?${q({ function: 'SYMBOL_SEARCH', keywords: query, apikey: c.apiKey })}`));
}

export async function fetchQuote(c: QuoteConfig, symbol: string, exchange?: string): Promise<FetchedQuote> {
  if (c.provider === 'twelvedata') {
    return parseTwelveQuote(await getJson(`https://api.twelvedata.com/quote?${q({ symbol, exchange, apikey: c.apiKey })}`));
  }
  return parseAlphaQuote(await getJson(`https://www.alphavantage.co/query?${q({ function: 'GLOBAL_QUOTE', symbol, apikey: c.apiKey })}`));
}

/** Wechselkurs: 1 Einheit `from` = x CHF. */
export async function fetchFxToChf(c: QuoteConfig, from: string): Promise<number> {
  if (c.provider === 'twelvedata') {
    return parseTwelveFx(await getJson(`https://api.twelvedata.com/exchange_rate?${q({ symbol: `${from}/CHF`, apikey: c.apiKey })}`));
  }
  return parseAlphaFx(
    await getJson(`https://www.alphavantage.co/query?${q({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: from, to_currency: 'CHF', apikey: c.apiKey })}`),
  );
}
