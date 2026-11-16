import type { Rappen } from './money';
import { calculateTax } from './tax/taxEngine';
import type { YearModel } from './yearModel';

export interface Pillar3aAnalysis {
  /** Maximal abziehbarer Betrag (mit Pensionskasse). */
  max: Rappen;
  /** Im Budget geplante Einzahlungen im Jahr. */
  planned: Rappen;
  /** Fehlt bis zum Maximum. */
  gap: Rappen;
  /** Steuerersparnis der geplanten Einzahlung gegenüber keiner Einzahlung. */
  savingPlanned: Rappen;
  /** Zusätzliche Ersparnis, wenn bis zum Maximum eingezahlt wird. */
  savingExtra: Rappen;
  /** Steuerersparnis pro 100 Franken zusätzlicher Einzahlung (Grenzsteuersatz). */
  marginalRate: number;
}

/** Was die Säule 3a steuerlich bringt und wie viel bis zum Maximum fehlt. */
export function analyzePillar3a(model: YearModel): Pillar3aAnalysis | null {
  const params = model.taxParams;
  if (!params) return null;
  const max = Math.round(params.federal.deductions.pillar3aMax * 100);
  const planned = Math.min(model.taxInput.pillar3a, max);
  const totalWith = (pillar3a: Rappen) => calculateTax({ ...model.taxInput, pillar3a }, params).total;
  const none = totalWith(0);
  const current = totalWith(planned);
  const full = totalWith(max);
  const gap = Math.max(0, max - planned);
  return {
    max,
    planned,
    gap,
    savingPlanned: none - current,
    savingExtra: current - full,
    marginalRate: gap > 0 ? (current - full) / gap : 0,
  };
}

/** Ab November erinnern, solange etwas bis zum Maximum fehlt. */
export function pillar3aReminderDue(model: YearModel, today = new Date()): boolean {
  const a = analyzePillar3a(model);
  return !!a && a.gap > 0 && model.plan.year === today.getFullYear() && today.getMonth() >= 10;
}
