import type { Rappen } from './money';
import type { WealthSnapshot } from './types';

export const snapshotTotal = (s: WealthSnapshot): Rappen => s.accounts + s.depot + s.pillar3a;

/** Eintrag für einen Monat setzen; ein bestehender Eintrag desselben Monats wird ersetzt. Ergebnis ist nach Monat sortiert. */
export function upsertSnapshot(history: WealthSnapshot[] | undefined, snapshot: WealthSnapshot): WealthSnapshot[] {
  return [...(history ?? []).filter((s) => s.month !== snapshot.month), snapshot].sort((a, b) => a.month.localeCompare(b.month));
}

export interface WealthTrend {
  latest: WealthSnapshot | null;
  /** Veränderung seit dem vorherigen Eintrag. */
  change: Rappen | null;
  /** Veränderung seit dem ersten Eintrag des laufenden Jahres (oder dem letzten des Vorjahres). */
  changeYear: Rappen | null;
}

export function wealthTrend(history: WealthSnapshot[] | undefined): WealthTrend {
  const h = [...(history ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const latest = h.at(-1) ?? null;
  if (!latest) return { latest, change: null, changeYear: null };
  const prev = h.at(-2);
  const year = latest.month.slice(0, 4);
  const base = [...h].reverse().find((s) => s.month < `${year}-01`) ?? h.find((s) => s.month.startsWith(year));
  return {
    latest,
    change: prev ? snapshotTotal(latest) - snapshotTotal(prev) : null,
    changeYear: base && base !== latest ? snapshotTotal(latest) - snapshotTotal(base) : null,
  };
}
