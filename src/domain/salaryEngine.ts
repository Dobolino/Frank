import { roundTo5, sum, type Rappen } from './money';
import { MONTHS, type Month, type SalaryInput, type SocialRates } from './types';

export interface MonthlySalary {
  month: Month;
  baseGross: Rappen;
  thirteenthGross: Rappen;
  bonusGross: Rappen;
  grossTotal: Rappen;
  ahv: Rappen;
  alv: Rappen;
  nbuv: Rappen;
  ktg: Rappen;
  socialTotal: Rappen;
  bvg: Rappen;
  /** Auszahlung auf das Lohnkonto (auf 5 Rappen gerundet). */
  net: Rappen;
  /** Davon Anteil 13. Lohn + Bonus (netto). */
  extrasNet: Rappen;
}

export interface SalaryYear {
  months: MonthlySalary[];
  /** Regulärer Nettolohn eines Monats ohne Zusatzzahlungen (Dezember-Lohn als Referenz). */
  regularNet: Rappen;
  totals: {
    gross: Rappen;
    social: Rappen;
    socialWithoutKtg: Rappen;
    ktg: Rappen;
    bvg: Rappen;
    net: Rappen;
    extrasNet: Rappen;
    thirteenthGross: Rappen;
    bonusGross: Rappen;
  };
}

export const totalRate = (r: SocialRates): number => r.ahv + r.alv + r.nbuv + r.ktg;

/** Bruttolohn eines Monats unter Berücksichtigung von Lohnerhöhungen. */
export function baseGrossFor(input: SalaryInput, month: Month): Rappen {
  const change = [...input.changes]
    .filter((c) => c.fromMonth <= month)
    .sort((a, b) => b.fromMonth - a.fromMonth)[0];
  return change ? change.grossMonthly : input.grossMonthly;
}

function netOf(gross: Rappen, rates: SocialRates, bvg: Rappen): Rappen {
  return roundTo5(gross * (1 - totalRate(rates)) - bvg);
}

/**
 * Lohnberechnung für ein Jahr.
 * Der BVG-Beitrag wird nur einmal pro Monat abgezogen, nicht auf 13. Lohn und Bonus.
 */
export function calculateSalary(input: SalaryInput): SalaryYear {
  const { rates } = input;
  const months: MonthlySalary[] = MONTHS.map((month) => {
    const baseGross = baseGrossFor(input, month);
    const thirteenthGross = sum(
      input.thirteenth
        .filter((t) => t.month === month)
        .map((t) => (t.amount !== undefined ? t.amount : Math.round(baseGross * (t.share ?? 0)))),
    );
    const bonusGross = sum(input.bonuses.filter((b) => b.month === month).map((b) => b.gross));
    const grossTotal = baseGross + thirteenthGross + bonusGross;
    const part = (rate: number) => Math.round(grossTotal * rate);
    const ahv = part(rates.ahv);
    const alv = part(rates.alv);
    const nbuv = part(rates.nbuv);
    const ktg = part(rates.ktg);
    const bvg = baseGross > 0 ? input.bvgMonthly : 0;
    const net = netOf(grossTotal, rates, bvg);
    const regular = netOf(baseGross, rates, bvg);
    return {
      month,
      baseGross,
      thirteenthGross,
      bonusGross,
      grossTotal,
      ahv,
      alv,
      nbuv,
      ktg,
      socialTotal: ahv + alv + nbuv + ktg,
      bvg,
      net,
      extrasNet: net - regular,
    };
  });

  const total = (key: keyof MonthlySalary) => sum(months.map((m) => m[key] as number));
  const ktg = total('ktg');
  const social = total('socialTotal');
  return {
    months,
    regularNet: netOf(baseGrossFor(input, 12), rates, input.bvgMonthly),
    totals: {
      gross: total('grossTotal'),
      social,
      socialWithoutKtg: social - ktg,
      ktg,
      bvg: total('bvg'),
      net: total('net'),
      extrasNet: total('extrasNet'),
      thirteenthGross: total('thirteenthGross'),
      bonusGross: total('bonusGross'),
    },
  };
}

/**
 * Nettolohn gemäss Lohnausweis (Ziffer 11): Brutto − AHV/IV/EO/ALV/NBUV − BVG.
 * KTG-Beiträge werden je nach Arbeitgeber unter Ziffer 9 aufgeführt (Schalter im Steuerprofil).
 */
export function lohnausweisNet(s: SalaryYear, ktgDeductible: boolean): Rappen {
  const social = ktgDeductible ? s.totals.social : s.totals.socialWithoutKtg;
  return s.totals.gross - social - s.totals.bvg;
}
