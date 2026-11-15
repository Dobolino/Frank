import { chf, formatChf, roundTo5, sum, toChf, type Rappen } from '../money';
import type { MealDeduction } from '../types';
import type { TaxYearParams } from '../../params/taxParams';
import { applyIncomeTariff, applySliceTariff, floorTo } from './tariff';

/** Alles, was die Steuer-Engine für ein Jahr braucht – unabhängig von Budget und Oberfläche. */
export interface TaxInput {
  /** Nettolohn gemäss Lohnausweis (nach AHV/ALV/NBUV/BVG). */
  employmentNet: Rappen;
  /** Weitere steuerbare Einkünfte (Dividenden brutto, Zinsen, Nebenerwerb). */
  otherIncome: Rappen;
  commuteCosts: Rappen;
  /** Velo/zu Fuss: BL gewährt eine Pauschale bis CHF 700. */
  commuteIsBike: boolean;
  meal: MealDeduction;
  pillar3a: Rappen;
  insurancePremiums: Rappen;
  otherDeductions: Rappen;
  wealth: Rappen;
}

export interface DeductionLine {
  key: string;
  label: string;
  amount: Rappen;
  hint?: string;
}

export interface LevelResult {
  grossIncome: Rappen;
  deductions: DeductionLine[];
  taxableIncome: Rappen;
}

export interface TaxResult {
  year: number;
  federal: LevelResult & { tax: Rappen };
  canton: LevelResult & {
    /** «Normale» Staatssteuer (100 %), Basis für Gemeinde- und Kirchensteuer. */
    simpleTax: Rappen;
    cantonTax: Rappen;
    municipalTax: Rappen;
    wealthTaxable: Rappen;
    wealthCanton: Rappen;
    wealthMunicipal: Rappen;
  };
  total: Rappen;
  incomeTaxTotal: Rappen;
  wealthTaxTotal: Rappen;
  /** Durchschnittlicher Steuersatz auf dem Bruttoeinkommen. */
  effectiveRate: number;
  /** Grenzsteuersatz: Anteil, der von 100 zusätzlichen Franken als Steuer weggeht. */
  marginalRate: number;
  warnings: string[];
}

const clampMax = (value: Rappen, maxChf: number): Rappen => Math.min(value, chf(maxChf));

function federalDeductions(i: TaxInput, p: TaxYearParams['federal']): DeductionLine[] {
  const pro = p.otherProfessional;
  const otherPro = Math.min(Math.max(Math.round((i.employmentNet * pro.percent) / 100), chf(pro.min)), chf(pro.max));
  const meal = i.meal === 'full' ? p.mealFull : i.meal === 'reduced' ? p.mealReduced : 0;
  return [
    { key: 'commute', label: 'Fahrkosten', amount: clampMax(i.commuteCosts, p.commuteMax), hint: `max. CHF ${p.commuteMax}` },
    { key: 'meal', label: 'Verpflegung', amount: chf(meal) },
    { key: 'otherPro', label: 'Übrige Berufskosten (Pauschale)', amount: i.employmentNet > 0 ? otherPro : 0, hint: `${pro.percent} %, min. ${pro.min}, max. ${pro.max}` },
    { key: 'pillar3a', label: 'Säule 3a', amount: clampMax(i.pillar3a, p.pillar3aMax), hint: `max. CHF ${p.pillar3aMax}` },
    { key: 'insurance', label: 'Versicherungsprämien & Sparzinsen', amount: clampMax(i.insurancePremiums, p.insuranceSingleWithPillar2), hint: `max. CHF ${p.insuranceSingleWithPillar2}` },
    { key: 'other', label: 'Weitere Abzüge', amount: i.otherDeductions },
  ];
}

function cantonDeductions(i: TaxInput, p: TaxYearParams['canton']): DeductionLine[] {
  const meal = i.meal === 'full' ? p.mealFull : i.meal === 'reduced' ? p.mealReduced : 0;
  const commute = i.commuteIsBike ? Math.min(i.commuteCosts, chf(p.bikeFlat)) : clampMax(i.commuteCosts, p.commuteMax);
  return [
    { key: 'commute', label: 'Fahrkosten', amount: commute, hint: i.commuteIsBike ? `Velo: max. CHF ${p.bikeFlat}` : `max. CHF ${p.commuteMax}` },
    { key: 'meal', label: 'Verpflegung', amount: chf(meal) },
    { key: 'otherPro', label: 'Übrige Berufskosten (Pauschale)', amount: i.employmentNet > 0 ? chf(p.otherProfessionalFlat) : 0, hint: `CHF ${p.otherProfessionalFlat}` },
    { key: 'pillar3a', label: 'Säule 3a', amount: clampMax(i.pillar3a, p.pillar3aMax), hint: `max. CHF ${p.pillar3aMax}` },
    { key: 'insurance', label: 'Versicherungsprämien & Sparzinsen', amount: clampMax(i.insurancePremiums, p.insuranceSingle), hint: `max. CHF ${p.insuranceSingle}` },
    { key: 'other', label: 'Weitere Abzüge', amount: i.otherDeductions },
  ];
}

function level(gross: Rappen, deductions: DeductionLine[], roundTo: number): LevelResult {
  const raw = Math.max(0, gross - sum(deductions.map((d) => d.amount)));
  return { grossIncome: gross, deductions, taxableIncome: chf(floorTo(toChf(raw), roundTo)) };
}

/** Kern der Berechnung ohne Grenzsteuersatz (wird dafür zweimal aufgerufen). */
function compute(i: TaxInput, p: TaxYearParams) {
  const gross = i.employmentNet + i.otherIncome;
  const fedLevel = level(gross, federalDeductions(i, p.federal), p.federal.roundIncomeTo);
  const cantonLevel = level(gross, cantonDeductions(i, p.canton), p.canton.roundIncomeTo);

  const fedTax = roundTo5(chf(applyIncomeTariff(p.federal.tariff, toChf(fedLevel.taxableIncome))));
  const simple = chf(applyIncomeTariff(p.canton.tariff, toChf(cantonLevel.taxableIncome)));
  const cantonTax = roundTo5(simple * p.canton.cantonRate);
  const municipalTax = roundTo5(simple * p.municipality.rate);

  const wealthTaxable = Math.max(0, i.wealth - chf(p.canton.wealth.allowanceSingle));
  const wealthSimple = chf(applySliceTariff(p.canton.wealth.tariff, toChf(wealthTaxable)));
  const wealthCanton = roundTo5(wealthSimple * p.canton.cantonRate);
  const wealthMunicipal = roundTo5(wealthSimple * p.municipality.rate);

  return { gross, fedLevel, cantonLevel, fedTax, simple: roundTo5(simple), cantonTax, municipalTax, wealthTaxable, wealthCanton, wealthMunicipal };
}

export function calculateTax(input: TaxInput, params: TaxYearParams): TaxResult {
  const c = compute(input, params);
  const plus = compute({ ...input, otherIncome: input.otherIncome + chf(1000) }, params);
  const incomeTaxTotal = c.fedTax + c.cantonTax + c.municipalTax;
  const plusIncomeTax = plus.fedTax + plus.cantonTax + plus.municipalTax;
  const wealthTaxTotal = c.wealthCanton + c.wealthMunicipal;
  const total = incomeTaxTotal + wealthTaxTotal;

  const warnings: string[] = [];
  if (input.pillar3a > chf(params.federal.pillar3aMax)) {
    warnings.push(
      `Säule 3a: Einzahlung CHF ${formatChf(input.pillar3a)} liegt über dem Maximum von CHF ${formatChf(chf(params.federal.pillar3aMax))}. Nur das Maximum ist abziehbar – Monatsrate z. B. auf CHF ${formatChf(Math.floor(chf(params.federal.pillar3aMax) / 1200) * 100)} senken.`,
    );
  }

  return {
    year: params.year,
    federal: { ...c.fedLevel, tax: c.fedTax },
    canton: {
      ...c.cantonLevel,
      simpleTax: c.simple,
      cantonTax: c.cantonTax,
      municipalTax: c.municipalTax,
      wealthTaxable: c.wealthTaxable,
      wealthCanton: c.wealthCanton,
      wealthMunicipal: c.wealthMunicipal,
    },
    total,
    incomeTaxTotal,
    wealthTaxTotal,
    effectiveRate: c.gross > 0 ? incomeTaxTotal / c.gross : 0,
    marginalRate: (plusIncomeTax - incomeTaxTotal) / chf(1000),
    warnings,
  };
}
