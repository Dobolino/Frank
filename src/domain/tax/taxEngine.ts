import { chf, formatChf, roundTo5, sum, toChf, type Rappen } from '../money';
import type { MealDeduction } from '../types';
import type { ChildRules, Deductions, FamilyScale, PercentDeduction, TaxYearParams } from '../../params/taxData';
import { applyScale } from './scales';

/** Alles, was die Steuer-Engine für ein Jahr braucht – unabhängig von Budget und Oberfläche. */
export interface TaxInput {
  /** Nettolohn gemäss Lohnausweis (nach AHV/ALV/NBUV/BVG). */
  employmentNet: Rappen;
  /** Weitere steuerbare Einkünfte (Dividenden brutto, Zinsen, Nebenerwerb). */
  otherIncome: Rappen;
  commuteCosts: Rappen;
  /** Velo/zu Fuss: einige Kantone (z. B. BL) gewähren eine Pauschale. */
  commuteIsBike: boolean;
  meal: MealDeduction;
  pillar3a: Rappen;
  insurancePremiums: Rappen;
  otherDeductions: Rappen;
  /** Mieterabzug, nur Kantonssteuer (ZG, VD). */
  rentDeduction?: Rappen;
  wealth: Rappen;
  /** Verheiratet: gemeinsame Veranlagung mit Familientarif. */
  married?: boolean;
  /** Alter der Kinder mit Kinderabzug. */
  children?: number[];
  /** Nettolohn der Partnerin oder des Partners gemäss Lohnausweis. */
  partnerNet?: Rappen;
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
    /** Einfache Steuer (Tarif ohne Steuerfuss), Basis für Kantons-, Gemeinde- und Kirchensteuer. */
    simpleTax: Rappen;
    cantonTax: Rappen;
    municipalTax: Rappen;
    churchTax: Rappen;
    personalTax: Rappen;
    wealthTaxable: Rappen;
    wealthCanton: Rappen;
    wealthMunicipal: Rappen;
    wealthChurch: Rappen;
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

/** Bundessteuer: Beträge unter CHF 25 werden nicht erhoben (Art. 36 Abs. 3 DBG). */
const FEDERAL_MIN_TAX = 25;

const clampMax = (value: Rappen, maxChf: number | null): Rappen => (maxChf === null ? value : Math.min(value, chf(maxChf)));
const fmt = (n: number) => formatChf(chf(n), { decimals: false });

/** Grundbetrag + Prozent von `income`, begrenzt durch Minimum und Maximum (CHF-Parameter, Rappen-Ergebnis). */
function percentDeduction(d: PercentDeduction | null | undefined, income: Rappen): Rappen {
  if (!d) return 0;
  let v = chf(d.base) + Math.round((income * d.percent) / 100);
  v = Math.max(v, chf(d.min));
  if (d.max !== null) v = Math.min(v, chf(d.max));
  return v;
}

/** Kinderabzug für ein Kind: engste passende Altersspanne, sonst nach Anzahl; dazu Eigenbetreuung bis 14. */
export function childDeduction(rules: ChildRules, age: number, index: number): number {
  const match = rules.age
    .filter((r) => age >= r.minAge && age <= r.maxAge)
    .sort((a, b) => a.maxAge - a.minAge - (b.maxAge - b.minAge))[0];
  const byCount = index < 2 ? rules.firstTwo : rules.fromThird || rules.firstTwo;
  return (match?.amount ?? byCount) + (age <= 14 ? rules.ownCare : 0);
}

function familyLines(i: TaxInput, d: Deductions): DeductionLine[] {
  const f = d.family;
  const ages = i.children ?? [];
  const kids = ages.length;
  if (!f || (!i.married && kids === 0)) return [];
  const lines: DeductionLine[] = [];
  const partner = i.partnerNet ?? 0;
  if (i.married && (f.married || f.marriedExtra)) {
    const amount = percentDeduction(f.married, i.employmentNet + partner) + chf(f.marriedExtra ?? 0);
    lines.push({ key: 'married', label: 'Abzug für Verheiratete', amount, hint: 'Sozialabzug' });
  }
  if (i.married && f.secondEarner && partner > 0 && i.employmentNet > 0) {
    const lower = Math.min(i.employmentNet, partner);
    // Kleine Prozentsätze (BE: 2 %) gelten auf dem gemeinsamen Erwerbseinkommen, sonst auf dem tieferen
    const base = f.secondEarner.percent > 0 && f.secondEarner.percent < 5 ? i.employmentNet + partner : lower;
    lines.push({ key: 'secondEarner', label: 'Zweitverdienerabzug', amount: Math.min(lower, percentDeduction(f.secondEarner, base)) });
  }
  if (kids > 0) {
    const amount = chf(ages.reduce((s, age, idx) => s + childDeduction(f.children, age, idx), 0));
    if (amount > 0) lines.push({ key: 'children', label: `Kinderabzug (${kids})`, amount, hint: 'nach Alter der Kinder' });
  }
  return lines;
}

function deductionLines(i: TaxInput, d: Deductions, bikeFlat?: number): DeductionLine[] {
  const meal = i.meal === 'full' ? d.mealFull : i.meal === 'reduced' ? d.mealReduced : 0;
  const bike = i.commuteIsBike && bikeFlat !== undefined;
  const commute = bike ? Math.min(i.commuteCosts, chf(bikeFlat)) : clampMax(i.commuteCosts, d.commuteMax);
  const commuteHint = bike ? `Velo: max. CHF ${fmt(bikeFlat)}` : d.commuteMax === null ? 'ohne Maximum' : `max. CHF ${fmt(d.commuteMax)}`;

  const pro = d.otherPro;
  let otherPro = 0;
  let proHint = '';
  if (pro && i.employmentNet > 0) {
    otherPro = chf(pro.base) + Math.round((i.employmentNet * pro.percent) / 100);
    otherPro = Math.max(otherPro, chf(pro.min));
    if (pro.max !== null) otherPro = Math.min(otherPro, chf(pro.max));
    // Partnerin oder Partner erhält dieselbe Pauschale auf dem eigenen Lohn
    if (i.married && (i.partnerNet ?? 0) > 0) otherPro += percentDeduction({ ...pro, max: pro.max }, i.partnerNet ?? 0);
    proHint =
      pro.percent > 0
        ? [pro.base > 0 ? `CHF ${fmt(pro.base)} +` : '', `${pro.percent} %`, pro.min > 0 ? `min. ${fmt(pro.min)}` : '', pro.max !== null ? `max. ${fmt(pro.max)}` : '']
            .filter(Boolean)
            .join(' ')
        : `CHF ${fmt(pro.base)}`;
  }

  const kids = (i.children ?? []).length;
  const f = d.family;
  const oneEarner = i.married && !(i.partnerNet && i.partnerNet > 0);
  const marriedMax = oneEarner && f?.insuranceMaxOneEarner ? f.insuranceMaxOneEarner : f?.insuranceMax;
  const insuranceMax =
    d.insuranceMax === null ? null : (i.married && marriedMax ? marriedMax : d.insuranceMax) + kids * (f?.insurancePerChild ?? 0);
  const pillar3aMax = d.pillar3aMax * (i.married && (i.partnerNet ?? 0) > 0 ? 2 : 1);
  const personal = i.married ? [] : d.personal;

  return [
    { key: 'commute', label: 'Fahrkosten', amount: commute, hint: commuteHint },
    { key: 'meal', label: 'Verpflegung', amount: chf(meal) },
    { key: 'otherPro', label: 'Übrige Berufskosten (Pauschale)', amount: otherPro, hint: proHint || undefined },
    { key: 'pillar3a', label: 'Säule 3a', amount: clampMax(i.pillar3a, pillar3aMax), hint: `max. CHF ${fmt(pillar3aMax)}` },
    {
      key: 'insurance',
      label: 'Versicherungsprämien & Sparzinsen',
      amount: clampMax(i.insurancePremiums, insuranceMax),
      hint: insuranceMax === null ? undefined : `max. CHF ${fmt(insuranceMax)}`,
    },
    ...personal.map((p) => ({ key: p.id, label: p.label, amount: chf(p.amount), hint: 'Sozialabzug' })),
    ...familyLines(i, d),
    ...(d.rentMax && i.rentDeduction
      ? [{ key: 'rent', label: 'Mieterabzug', amount: clampMax(i.rentDeduction, d.rentMax), hint: `max. CHF ${fmt(d.rentMax)}` }]
      : []),
    { key: 'other', label: 'Weitere Abzüge', amount: i.otherDeductions },
  ];
}

function level(gross: Rappen, deductions: DeductionLine[], roundTo: number, lowIncome?: Deductions['lowIncome']): LevelResult {
  let raw = Math.max(0, gross - sum(deductions.map((d) => d.amount)));
  if (lowIncome && raw < chf(lowIncome.threshold)) {
    const relief = Math.round(((chf(lowIncome.threshold) - raw) * lowIncome.percent) / 100);
    deductions = [...deductions, { key: 'lowIncome', label: 'Abzug für bescheidene Einkommen', amount: relief }];
    raw = Math.max(0, raw - relief);
  }
  const taxable = Math.floor(toChf(raw) / roundTo) * roundTo;
  return { grossIncome: gross, deductions, taxableIncome: chf(taxable) };
}

/** Lineare Interpolation in einer Stützstellen-Tabelle, ausserhalb gilt der Randwert. */
function interpolate(points: [number, number][], x: number): number {
  if (points.length === 0) return 1;
  if (x <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1]![1];
}

/** Familientarif mit Splitting: Steuer = s · Tarif(x / s). */
const familyTax = (f: FamilyScale, x: number, divisor?: number): number => {
  const s = divisor ?? (f.splitting > 0 ? f.splitting : 1);
  return s * applyScale(f.scale, x / s);
};

/** Kern der Berechnung ohne Grenzsteuersatz (wird dafür zweimal aufgerufen). */
function compute(i: TaxInput, p: TaxYearParams) {
  const gross = i.employmentNet + (i.married ? (i.partnerNet ?? 0) : 0) + i.otherIncome;
  const kids = (i.children ?? []).length;
  const family = !!i.married || kids > 0;
  const c = p.canton;
  const cal = c.calibration ?? {};
  const fedLevel = level(gross, deductionLines({ ...i, rentDeduction: 0 }, p.federal.deductions), 100);
  const cantonLevel = level(gross, deductionLines(i, c.deductions, c.bikeFlat), 1, c.deductions.lowIncome);

  const fedX = toChf(fedLevel.taxableIncome);
  const famCal = cal.family ?? {};
  const fedFamily = family ? p.federal.family : null;
  const fedBase = fedFamily ? familyTax(fedFamily, fedX) : applyScale(p.federal.income, fedX);
  // Elterntarif: Rabatt pro Kind auf der Bundessteuer
  const fedRaw = Math.max(0, fedBase - kids * (famCal.childCreditFed ?? 0));
  const fedTax = fedRaw < FEDERAL_MIN_TAX ? 0 : roundTo5(chf(fedRaw));

  const x = toChf(cantonLevel.taxableIncome);
  const k = cal.divisor ?? 1;
  const cantonFamily = family ? c.family?.income : null;
  const simpleBase = cantonFamily ? familyTax(cantonFamily, x, famCal.divisor) : k * applyScale(c.income, x / k);
  const simple = chf(simpleBase);
  const r = p.rates;
  const cantonFactor = cantonFamily
    ? famCal.cantonCurve ? interpolate(famCal.cantonCurve, x) : (famCal.cantonFactor ?? cal.cantonFactor ?? 1)
    : (cal.cantonFactor ?? 1);
  const cityFactor = cantonFamily && (famCal.cityCurve || famCal.cityFactor)
    ? famCal.cityCurve ? interpolate(famCal.cityCurve, x) : famCal.cityFactor!
    : cal.cityCurve ? interpolate(cal.cityCurve, x) : (cal.cityFactor ?? 1);
  let cantonRaw = simple * r.incomeCanton * cantonFactor;
  let cityRaw = simple * r.incomeCity * cityFactor;
  // Wirkung der Kinder nach dem Tarif (Ermässigung, Familienquotient), anteilig auf Kanton und Gemeinde
  if (kids > 0 && famCal.childCurve) {
    const reduction = chf(kids * interpolate(famCal.childCurve, x));
    const both = cantonRaw + cityRaw;
    if (both > 0) {
      const keep = Math.max(0, both - reduction) / both;
      cantonRaw *= keep;
      cityRaw *= keep;
    }
  }
  const cantonTax = roundTo5(cantonRaw);
  const municipalTax = roundTo5(cityRaw);
  const churchTax = roundTo5(simple * r.incomeChurch);

  const wf = c.deductions.wealthFamily;
  const allowance =
    (i.married && wf?.married ? wf.married : c.deductions.wealthAllowance) + kids * (wf?.perChild ?? 0);
  const wealthTaxable = Math.max(0, i.wealth - chf(allowance));
  const wealthScale = i.married && c.family?.wealth ? c.family.wealth : c.wealth;
  const wealthSimple = wealthScale ? chf(applyScale(wealthScale, toChf(wealthTaxable))) : 0;
  const wealthCanton = roundTo5(wealthSimple * r.wealthCanton * (cal.wealthCantonFactor ?? 1));
  const wealthMunicipal = roundTo5(wealthSimple * r.wealthCity * (cal.wealthCityFactor ?? 1));
  const wealthChurch = roundTo5(wealthSimple * r.wealthChurch);
  const personalTax = chf(cal.personalTax ?? 0);

  return {
    gross,
    fedLevel,
    cantonLevel,
    fedTax,
    simple: roundTo5(simple),
    cantonTax,
    municipalTax,
    churchTax,
    personalTax,
    wealthTaxable,
    wealthCanton,
    wealthMunicipal,
    wealthChurch,
  };
}

const incomeTaxOf = (c: ReturnType<typeof compute>) => c.fedTax + c.cantonTax + c.municipalTax + c.churchTax;

export function calculateTax(input: TaxInput, params: TaxYearParams): TaxResult {
  const c = compute(input, params);
  const plus = compute({ ...input, otherIncome: input.otherIncome + chf(1000) }, params);
  const incomeTaxTotal = incomeTaxOf(c) + c.personalTax;
  const wealthTaxTotal = c.wealthCanton + c.wealthMunicipal + c.wealthChurch;
  const total = incomeTaxTotal + wealthTaxTotal;

  const warnings: string[] = [];
  const max3a = params.federal.deductions.pillar3aMax;
  if (input.pillar3a > chf(max3a)) {
    warnings.push(
      `Säule 3a: Einzahlung CHF ${formatChf(input.pillar3a)} liegt über dem Maximum von CHF ${formatChf(chf(max3a))}. Nur das Maximum ist abziehbar – Monatsrate z. B. auf CHF ${formatChf(Math.floor(chf(max3a) / 1200) * 100)} senken.`,
    );
  }
  const famApprox = (input.married || (input.children ?? []).length > 0) && params.canton.calibration?.family?.approximate?.length;
  const approx = [...(params.canton.calibration?.approximate ?? []), ...(famApprox ? ['family'] : [])];
  if (approx.length) {
    warnings.push(`${params.canton.name}: Einzelne Regeln des Kantons bildet Frank nur angenähert ab. Rechne mit einigen Prozent Abweichung.`);
  }

  return {
    year: params.year,
    federal: { ...c.fedLevel, tax: c.fedTax },
    canton: {
      ...c.cantonLevel,
      simpleTax: c.simple,
      cantonTax: c.cantonTax,
      municipalTax: c.municipalTax,
      churchTax: c.churchTax,
      personalTax: c.personalTax,
      wealthTaxable: c.wealthTaxable,
      wealthCanton: c.wealthCanton,
      wealthMunicipal: c.wealthMunicipal,
      wealthChurch: c.wealthChurch,
    },
    total,
    incomeTaxTotal,
    wealthTaxTotal,
    effectiveRate: c.gross > 0 ? incomeTaxTotal / c.gross : 0,
    marginalRate: (incomeTaxOf(plus) - incomeTaxOf(c)) / chf(1000),
    warnings,
  };
}
