import { describe, expect, it } from 'vitest';
import reference from './fixtures/estv-reference.json';
import { taxParamsFor } from '../src/params/taxData';
import { calculateTax, type TaxInput } from '../src/domain/tax/taxEngine';
import { chf, toChf } from '../src/domain/money';

/**
 * Vergleich mit dem ESTV-Steuerrechner (Detailrechner): ledig, ohne Kinder, ohne Konfession,
 * unselbständig erwerbstätig, ohne Fahrkosten, Verpflegung und Säule 3a.
 * Die Werte erzeugt `npm run update-tax` für jeden Kantonshauptort.
 */
interface Case {
  year: number;
  canton: string;
  bfsId: number;
  city: string;
  gross: number;
  fortune: number;
  netWage: number;
  taxableIncomeFed: number;
  taxableIncomeCanton: number;
  taxableFortune: number;
  incomeTaxFed: number;
  incomeTaxCanton: number;
  incomeTaxCity: number;
  fortuneTaxCanton: number;
  fortuneTaxCity: number;
  personalTax: number;
  deductions: { id: string; label: string; fed: number; canton: number }[];
}

const CASES = reference as Case[];

/** Kantone mit Regeln, die Frank nur angenähert abbildet (siehe README). */
const APPROXIMATE: Record<string, number> = { VS: 0.03, GE: 0.02, VD: 0.02 };
const DEFAULT_TOLERANCE = 0.01;
/** Krankenkassenprämie, die der ESTV-Detailrechner für Erwachsene annimmt. */
const ESTV_PREMIUM = 4560;
/**
 * Sozialabzüge für tiefe Einkommen (BE, FR, NE, OW, SZ, VD, VS) bildet Frank nicht ab, nur die Entlastung in LU.
 * In diesen Fällen darf Frank die Steuer höher schätzen, aber nie tiefer.
 */

function run(c: Case) {
  const { params } = taxParamsFor(c.year, c.bfsId);
  if (!params) throw new Error(`Keine Parameter für ${c.city}`);
  const input: TaxInput = {
    employmentNet: chf(c.netWage),
    otherIncome: 0,
    commuteCosts: 0,
    commuteIsBike: false,
    meal: 'none',
    pillar3a: 0,
    // ESTV setzt die Krankenkassenprämie pauschal ein
    insurancePremiums: chf(ESTV_PREMIUM),
    rentDeduction: chf(-(c.deductions.find((d) => d.label === 'Mieterabzug')?.canton ?? 0)),
    otherDeductions: 0,
    wealth: chf(c.fortune),
  };
  return calculateTax(input, params);
}

const close = (actual: number, expected: number, rel: number, absChf = 30) =>
  Math.abs(actual - expected) <= Math.max(absChf, Math.abs(expected) * rel);

describe('Gesamtberechnung gegen ESTV-Detailrechner', () => {
  it.each(CASES.map((c) => [`${c.canton} ${c.city}, Lohn ${c.gross}, Vermögen ${c.fortune}`, c] as const))('%s', (_, c) => {
    const t = run(c);
    const lowIncomeRelief = c.canton !== 'LU' && c.deductions.some((d) => /bescheidene|Zusätzlicher Sozialabzug/.test(d.label));
    const tol = APPROXIMATE[c.canton] ?? DEFAULT_TOLERANCE;
    expect(toChf(t.federal.taxableIncome)).toBeCloseTo(Math.floor(c.taxableIncomeFed / 100) * 100, -2);
    expect(close(toChf(t.federal.tax), c.incomeTaxFed, DEFAULT_TOLERANCE), 'Bundessteuer').toBe(true);
    const ownIncome = toChf(t.canton.cantonTax + t.canton.municipalTax + t.canton.personalTax);
    const estvIncome = c.incomeTaxCanton + c.incomeTaxCity + c.personalTax;
    if (lowIncomeRelief) {
      expect(ownIncome, 'Frank darf bei tiefen Einkommen nicht tiefer schätzen').toBeGreaterThanOrEqual(estvIncome - 30);
    } else {
      expect(close(toChf(t.canton.taxableIncome), c.taxableIncomeCanton, DEFAULT_TOLERANCE, 100), 'steuerbares Einkommen Kanton').toBe(true);
      expect(close(ownIncome, estvIncome, tol), `Einkommenssteuer Kanton + Gemeinde: ${ownIncome} statt ${estvIncome}`).toBe(true);
    }
    const ownWealth = toChf(t.wealthTaxTotal);
    const estvWealth = c.fortuneTaxCanton + c.fortuneTaxCity;
    // FR gewährt bei kleinen Vermögen einen Abzug, der nicht im ESTV-Export steht: Frank schätzt dort leicht zu hoch.
    const smallOverestimate = ownWealth >= estvWealth && ownWealth - estvWealth <= 100;
    expect(close(ownWealth, estvWealth, Math.max(tol, 0.03)) || smallOverestimate, `Vermögenssteuer: ${ownWealth} statt ${estvWealth}`).toBe(true);
  });
});
