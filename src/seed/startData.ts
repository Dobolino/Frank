import { SCHEMA_VERSION, type AppData } from '../domain/types';
import { findMunicipality } from '../params/taxData';
import { DEFAULT_ACCOUNTS, DEFAULT_TAX_PROFILE, item, salary } from './builders';

export interface StartAnswers {
  bfsId: number;
  /** Bruttolohn pro Monat in CHF. */
  grossMonthly: number;
  /** Miete inkl. Nebenkosten pro Monat in CHF. */
  rent: number;
  /** Krankenkasse (Grundversicherung) pro Monat in CHF. */
  healthInsurance: number;
  /** Säule 3a pro Monat in CHF (0 = keine). */
  pillar3a: number;
  /** Pensionskasse (BVG) pro Monat in CHF laut Lohnabrechnung, optional. */
  bvg?: number;
  year?: number;
}

/** Erste eigene Daten aus den fünf Fragen beim ersten Start. Weitere Posten ergänzt die Person im Budget. */
export function buildStartData(a: StartAnswers): AppData {
  const m = findMunicipality(a.bfsId);
  if (!m) throw new Error('Unbekannte Gemeinde.');
  const year = a.year ?? new Date().getFullYear();
  const s = { accountId: 'savings' };
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { bfsId: m.bfsId, municipality: m.name, canton: m.canton, civilStatus: 'single', church: 'none' },
    accounts: DEFAULT_ACCOUNTS,
    activeYear: year,
    goals: [],
    years: {
      [String(year)]: {
        year,
        salary: salary(a.grossMonthly, a.bvg ?? 0),
        otherIncome: [],
        tax: { ...DEFAULT_TAX_PROFILE, commuteMode: 'none', commuteCosts: 0 },
        extrasAllocation: [],
        startBalances: {},
        budget: [
          item('fixed', 'Miete inkl. NK', a.rent),
          item('fixed', 'Krankenkasse (KVG)', a.healthInsurance, { taxTag: 'insurance' }),
          // Radio- und Fernsehabgabe: gilt für jeden Haushalt
          item('fixed', 'Serafe', 335, { ...s, frequency: { kind: 'yearly', month: 3 } }),
          item('savings', 'Steuern', 0, { ...s, taxTag: 'taxProvision', autoFromTax: true }),
          ...(a.pillar3a > 0 ? [item('savings', 'Säule 3a', a.pillar3a, { accountId: 'p3a', taxTag: 'pillar3a' })] : []),
        ],
      },
    },
  };
}
