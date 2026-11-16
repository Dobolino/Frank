import { describe, expect, it } from 'vitest';
import { neededFx, summarizePortfolio, valueHolding } from '../src/domain/investEngine';
import { chf } from '../src/domain/money';
import type { Holding, Investments } from '../src/domain/types';
import { parseAlphaFx, parseAlphaQuote, parseAlphaSearch, parseTwelveFx, parseTwelveQuote, parseTwelveSearch, QuoteError } from '../src/quotes/quotes';

const h = (o: Partial<Holding>): Holding => ({ id: 'x', symbol: 'X', name: 'X', currency: 'CHF', quantity: 1, ...o });

describe('Depotbewertung', () => {
  const fx = { USD: { rate: 0.9, asOf: '' }, GBP: { rate: 1.1, asOf: '' } };

  it('rechnet Fremdwährungen in CHF um', () => {
    const v = valueHolding(h({ currency: 'USD', quantity: 10, quote: { price: 200, asOf: '' } }), fx);
    expect(v.valueChf).toBe(chf(1800));
  });

  it('behandelt Pence (GBX) als Hundertstel Pfund', () => {
    const v = valueHolding(h({ currency: 'GBX', quantity: 100, quote: { price: 500, asOf: '' } }), fx);
    expect(v.valueChf).toBe(chf(550));
  });

  it('nimmt den Kurs von Hand, wenn kein Kursdienst-Kurs vorliegt', () => {
    const v = valueHolding(h({ quantity: 3, manualPrice: 100 }), {});
    expect(v.priceSource).toBe('manual');
    expect(v.valueChf).toBe(chf(300));
  });

  it('meldet fehlenden Wechselkurs statt falsch zu rechnen', () => {
    const v = valueHolding(h({ currency: 'EUR', quote: { price: 10, asOf: '' } }), fx);
    expect(v.valueChf).toBeNull();
  });

  it('berechnet Gewinn, Tagesveränderung und Anteile', () => {
    const inv: Investments = {
      fx,
      holdings: [
        h({ id: 'a', quantity: 10, costChf: chf(800), quote: { price: 100, changePct: 2, asOf: '' } }),
        h({ id: 'b', currency: 'USD', quantity: 10, quote: { price: 100, asOf: '' } }),
        h({ id: 'c', currency: 'EUR', quantity: 1, quote: { price: 1, asOf: '' } }),
      ],
    };
    const s = summarizePortfolio(inv);
    expect(s.totalChf).toBe(chf(1900));
    expect(s.gainChf).toBe(chf(200));
    expect(s.gainPct).toBeCloseTo(0.25);
    expect(s.dayChangeChf).toBe(Math.round(chf(1000) - chf(1000) / 1.02));
    expect(s.weights.find((w) => w.id === 'a')?.share).toBeCloseTo(1000 / 1900);
    expect(s.missing.map((m) => m.holding.id)).toEqual(['c']);
    expect(neededFx(inv)).toEqual(['EUR', 'USD']);
  });
});

describe('Antworten der Kursdienste', () => {
  it('Twelve Data: Kurs, Suche, Wechselkurs', () => {
    const q = parseTwelveQuote({ symbol: 'AAPL', currency: 'USD', close: '189.50', percent_change: '-1.25', last_quote_at: 1_700_000_000 });
    expect(q).toMatchObject({ price: 189.5, changePct: -1.25, currency: 'USD' });
    const s = parseTwelveSearch({ status: 'ok', data: [{ symbol: 'NESN', instrument_name: 'Nestle SA', exchange: 'SIX', currency: 'CHF', instrument_type: 'Common Stock', country: 'Switzerland' }] });
    expect(s[0]).toMatchObject({ symbol: 'NESN', name: 'Nestle SA', exchange: 'SIX', currency: 'CHF' });
    expect(parseTwelveFx({ symbol: 'USD/CHF', rate: 0.88 })).toBe(0.88);
  });

  it('Twelve Data: Limit und unbekannte Titel als verständliche Fehler', () => {
    expect(() => parseTwelveQuote({ status: 'error', code: 429, message: 'run out of credits' })).toThrow(QuoteError);
    try {
      parseTwelveQuote({ status: 'error', code: 404, message: 'symbol not found' });
    } catch (e) {
      expect((e as QuoteError).kind).toBe('notFound');
    }
  });

  it('Alpha Vantage: Kurs, Suche, Wechselkurs, Limit', () => {
    const q = parseAlphaQuote({ 'Global Quote': { '05. price': '102.3000', '10. change percent': '0.5123%', '07. latest trading day': '2026-11-13' } });
    expect(q).toMatchObject({ price: 102.3, changePct: 0.5123 });
    const s = parseAlphaSearch({ bestMatches: [{ '1. symbol': 'NESN.SWI', '2. name': 'Nestle SA', '3. type': 'Equity', '4. region': 'Switzerland', '8. currency': 'CHF' }] });
    expect(s[0]).toMatchObject({ symbol: 'NESN.SWI', currency: 'CHF' });
    expect(parseAlphaFx({ 'Realtime Currency Exchange Rate': { '5. Exchange Rate': '0.8812' } })).toBeCloseTo(0.8812);
    expect(() => parseAlphaQuote({ Information: 'API rate limit is 25 requests per day.' })).toThrow(/Abfragelimit/);
    expect(() => parseAlphaQuote({ 'Global Quote': {} })).toThrow(QuoteError);
  });
});
