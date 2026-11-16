/**
 * Tariftypen des ESTV-Steuerrechners. Alle Werte in CHF.
 *
 * BUND      Zeilen [ab Betrag, Satz %, Steuer]: Steuer + Satz auf dem Teil über «ab Betrag».
 * ZUERICH   Zeilen [Breite der Stufe, Satz %]: jede Einkommensstufe mit eigenem Satz (Stufentarif).
 * FREIBURG  Zeilen [Einkommen, Durchschnittssatz %]: Satz dazwischen linear, Steuer = Einkommen × Satz.
 * FLATTAX   eine Zeile [0, Satz %]: fester Satz.
 * FORMEL    Formel-Segmente (BL).
 */

export type ScaleRow = [amount: number, percent: number, taxes: number];

export type FormulaSegment =
  | { from: number; kind: 'log'; b: number; c: number; d: number }
  | { from: number; kind: 'linear'; base: number; rate: number; offset: number };

export type Scale =
  | { type: 'BUND' | 'ZUERICH' | 'FREIBURG' | 'FLATTAX'; rows: ScaleRow[] }
  | { type: 'FORMEL'; segments: FormulaSegment[] };

export function applyScale(scale: Scale, x: number): number {
  if (!(x > 0)) return 0;
  switch (scale.type) {
    case 'BUND':
      return bracket(scale.rows, x);
    case 'ZUERICH':
      return slices(scale.rows, x);
    case 'FREIBURG':
      return averageRate(scale.rows, x);
    case 'FLATTAX':
      return (x * (scale.rows[0]?.[1] ?? 0)) / 100;
    case 'FORMEL':
      return formula(scale.segments, x);
  }
}

function bracket(rows: ScaleRow[], x: number): number {
  let tax = 0;
  for (const [from, pct, base] of rows) {
    if (x >= from) tax = base + ((x - from) * pct) / 100;
  }
  return Math.max(0, tax);
}

function slices(rows: ScaleRow[], x: number): number {
  let rest = x;
  let tax = 0;
  for (const [width, pct] of rows) {
    const part = Math.min(rest, width);
    tax += (part * pct) / 100;
    rest -= part;
    if (rest <= 0) break;
  }
  return tax;
}

function averageRate(rows: ScaleRow[], x: number): number {
  let rate = 0;
  for (let i = 0; i < rows.length; i++) {
    const [from, pct] = rows[i]!;
    if (x < from) break;
    const next = rows[i + 1];
    rate = next && x < next[0] ? pct + ((next[1] - pct) * (x - from)) / (next[0] - from) : pct;
  }
  return (x * rate) / 100;
}

function formula(segments: FormulaSegment[], x: number): number {
  let seg: FormulaSegment | undefined;
  for (const s of segments) if (x >= s.from) seg = s;
  if (!seg) return 0;
  const tax = seg.kind === 'log' ? seg.b * x + seg.c * x * (Math.log(x) - 1) + seg.d : seg.base + seg.rate * (x - seg.offset);
  return Math.max(0, tax);
}
