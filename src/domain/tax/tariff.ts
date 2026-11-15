/**
 * Allgemeine Tarif-Bausteine. Alle Werte in CHF (nicht Rappen),
 * so wie sie in den offiziellen Tariftabellen stehen.
 */

/** Stufentarif: ab `from` gilt `baseTax` + `ratePercent` % auf dem Betrag über `from`. */
export interface BracketTariff {
  kind: 'brackets';
  brackets: { from: number; baseTax: number; ratePercent: number }[];
  /** Ab diesem Einkommen gilt ein Flat-Satz auf dem ganzen Einkommen (Bund: 11.5 %). */
  flat?: { from: number; ratePercent: number };
  /** Steuerbeträge unter diesem Betrag werden nicht erhoben (Bund: CHF 25, Art. 36 Abs. 3 DBG). */
  minTax?: number;
}

/**
 * Formeltarif BL (§ 34 StG): Steuer = b·x + c·x·(ln x − 1) + d,
 * oberhalb des letzten Segments linear.
 */
export interface FormulaTariff {
  kind: 'formula';
  segments: { from: number; b: number; c: number; d: number }[];
  top: { from: number; base: number; ratePercent: number };
}

/** Vermögenssteuer in Scheiben (Promille). */
export interface SliceTariff {
  kind: 'slices';
  slices: { upTo: number | null; permille: number }[];
  /** Steuerbares Vermögen unter diesem Betrag ist steuerfrei. */
  exemptBelow: number;
}

export type IncomeTariff = BracketTariff | FormulaTariff;

export function applyIncomeTariff(t: IncomeTariff, income: number): number {
  if (income <= 0) return 0;
  return t.kind === 'brackets' ? applyBrackets(t, income) : applyFormula(t, income);
}

function applyBrackets(t: BracketTariff, x: number): number {
  if (t.flat && x >= t.flat.from) return (x * t.flat.ratePercent) / 100;
  let tax = 0;
  for (const b of t.brackets) {
    if (x >= b.from) tax = b.baseTax + ((x - b.from) * b.ratePercent) / 100;
  }
  return tax < (t.minTax ?? 0) ? 0 : Math.max(0, tax);
}

function applyFormula(t: FormulaTariff, x: number): number {
  if (x >= t.top.from) return t.top.base + ((x - t.top.from) * t.top.ratePercent) / 100;
  let seg: FormulaTariff['segments'][number] | undefined;
  for (const s of t.segments) if (x >= s.from) seg = s;
  if (!seg) return 0;
  return Math.max(0, seg.b * x + seg.c * x * (Math.log(x) - 1) + seg.d);
}

export function applySliceTariff(t: SliceTariff, wealth: number): number {
  if (wealth < t.exemptBelow) return 0;
  let rest = wealth;
  let lower = 0;
  let tax = 0;
  for (const s of t.slices) {
    const width = s.upTo === null ? rest : Math.min(rest, s.upTo - lower);
    if (width <= 0) break;
    tax += (width * s.permille) / 1000;
    rest -= width;
    if (s.upTo !== null) lower = s.upTo;
  }
  return tax;
}

/** Abrunden auf ein Vielfaches (z. B. steuerbares Einkommen auf 100 CHF). */
export const floorTo = (x: number, step: number): number => (step > 0 ? Math.floor(x / step) * step : x);
