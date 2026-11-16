import { chf, sum, type Rappen } from './money';
import type { Holding, Investments } from './types';

/** Währungen, die in Hundertsteln notieren (London: Pence). */
const MINOR_UNITS: Record<string, { major: string; divisor: number }> = {
  GBX: { major: 'GBP', divisor: 100 },
  GBp: { major: 'GBP', divisor: 100 },
  ZAc: { major: 'ZAR', divisor: 100 },
  ILA: { major: 'ILS', divisor: 100 },
};

/** Hauptwährung für den Wechselkurs (GBX → GBP). */
export const fxCurrency = (currency: string): string => MINOR_UNITS[currency]?.major ?? currency.toUpperCase();

/** Kurs in Einheiten der Hauptwährung (Pence → Pfund). */
const toMajor = (price: number, currency: string): number => price / (MINOR_UNITS[currency]?.divisor ?? 1);

export interface HoldingValue {
  holding: Holding;
  /** Kurs, mit dem gerechnet wird (Kursdienst oder von Hand). */
  price: number | null;
  priceSource: 'quote' | 'manual' | 'none';
  /** Wechselkurs zu CHF, null wenn unbekannt. */
  fxRate: number | null;
  /** Wert in CHF, null wenn Kurs oder Wechselkurs fehlt. */
  valueChf: Rappen | null;
  /** Gewinn/Verlust gegenüber Einstand, null ohne Einstand oder Wert. */
  gainChf: Rappen | null;
  gainPct: number | null;
  /** Veränderung heute in CHF. */
  dayChangeChf: Rappen | null;
}

export interface PortfolioSummary {
  positions: HoldingValue[];
  totalChf: Rappen;
  costChf: Rappen;
  gainChf: Rappen;
  gainPct: number | null;
  dayChangeChf: Rappen;
  /** Anteile pro Position am bewerteten Total (0–1). */
  weights: { id: string; share: number }[];
  /** Positionen ohne Kurs oder Wechselkurs. */
  missing: HoldingValue[];
}

export function valueHolding(h: Holding, fx: Investments['fx']): HoldingValue {
  const price = h.quote?.price ?? h.manualPrice ?? null;
  const priceSource = h.quote ? 'quote' : h.manualPrice !== undefined ? 'manual' : 'none';
  const base = fxCurrency(h.currency);
  const fxRate = base === 'CHF' ? 1 : (fx[base]?.rate ?? null);
  const valueChf = price !== null && fxRate !== null ? chf(toMajor(price, h.currency) * h.quantity * fxRate) : null;
  const gainChf = valueChf !== null && h.costChf !== undefined && h.costChf > 0 ? valueChf - h.costChf : null;
  const gainPct = gainChf !== null && h.costChf ? gainChf / h.costChf : null;
  const pct = h.quote?.changePct;
  const dayChangeChf = valueChf !== null && pct !== undefined && pct > -100 ? Math.round(valueChf - valueChf / (1 + pct / 100)) : null;
  return { holding: h, price, priceSource, fxRate, valueChf, gainChf, gainPct, dayChangeChf };
}

export function summarizePortfolio(inv: Investments | undefined): PortfolioSummary {
  const positions = (inv?.holdings ?? []).map((h) => valueHolding(h, inv?.fx ?? {}));
  const valued = positions.filter((p) => p.valueChf !== null);
  const totalChf = sum(valued.map((p) => p.valueChf!));
  const withCost = valued.filter((p) => p.gainChf !== null);
  const costChf = sum(withCost.map((p) => p.holding.costChf!));
  const gainChf = sum(withCost.map((p) => p.gainChf!));
  return {
    positions,
    totalChf,
    costChf,
    gainChf,
    gainPct: costChf > 0 ? gainChf / costChf : null,
    dayChangeChf: sum(valued.map((p) => p.dayChangeChf ?? 0)),
    weights: valued.map((p) => ({ id: p.holding.id, share: totalChf > 0 ? p.valueChf! / totalChf : 0 })),
    missing: positions.filter((p) => p.valueChf === null),
  };
}

/** Alle Fremdwährungen, für die ein Wechselkurs gebraucht wird. */
export function neededFx(inv: Investments | undefined): string[] {
  return [...new Set((inv?.holdings ?? []).map((h) => fxCurrency(h.currency)).filter((c) => c !== 'CHF'))].sort();
}
