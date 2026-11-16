import { describe, expect, it } from 'vitest';
import { calculateSalary, lohnausweisNet } from '../src/domain/salaryEngine';
import { chf } from '../src/domain/money';
import type { SalaryInput } from '../src/domain/types';

/** Fiktives Beispiel: CHF 6'000 brutto, 13. Lohn halbjährlich. */
const example: SalaryInput = {
  grossMonthly: chf(6000),
  changes: [],
  thirteenth: [
    { month: 6, share: 0.5 },
    { month: 12, share: 0.5 },
  ],
  bonuses: [],
  rates: { ahv: 0.053, alv: 0.011, nbuv: 0.0093, ktg: 0.0035 },
  bvgMonthly: chf(220),
};

describe('Lohnrechner', () => {
  const s = calculateSalary(example);

  it('berechnet den Netto-Monatslohn (5 Rappen gerundet)', () => {
    expect(s.regularNet).toBe(chf(5319.2));
    expect(s.months[0]!.net).toBe(chf(5319.2));
  });

  it('zieht auf dem 13. Lohn kein zweites Mal BVG ab', () => {
    const june = s.months[5]!;
    expect(june.thirteenthGross).toBe(chf(3000));
    expect(june.bvg).toBe(chf(220));
    expect(june.net).toBe(chf(8088.8));
    expect(june.extrasNet).toBe(chf(2769.6));
  });

  it('summiert das Jahr konsistent', () => {
    expect(s.totals.gross).toBe(chf(78000));
    expect(s.totals.net).toBe(chf(5319.2 * 10 + 8088.8 * 2));
    expect(s.totals.bvg).toBe(chf(220 * 12));
  });

  it('berücksichtigt Lohnerhöhungen unter dem Jahr und Bonus', () => {
    const y = calculateSalary({
      ...example,
      grossMonthly: chf(5000),
      changes: [{ fromMonth: 4, grossMonthly: chf(5200) }],
      bonuses: [{ month: 4, gross: chf(1000) }],
    });
    expect(y.months[2]!.baseGross).toBe(chf(5000));
    expect(y.months[3]!.baseGross).toBe(chf(5200));
    expect(y.months[3]!.bonusGross).toBe(chf(1000));
    expect(y.totals.bonusGross).toBe(chf(1000));
  });

  it('berechnet den Nettolohn gemäss Lohnausweis', () => {
    const net = lohnausweisNet(s, true);
    expect(Math.abs(net - chf(69369.6))).toBeLessThanOrEqual(5);
    expect(lohnausweisNet(s, false)).toBeGreaterThan(net);
  });

  it('zahlt Pauschalspesen ohne Sozialabzüge aus und versteuert sie nur bei Bedarf', () => {
    const withExpenses = calculateSalary({ ...example, expenseAllowance: { monthly: chf(200), taxable: false } });
    expect(withExpenses.regularNet).toBe(chf(5519.2));
    expect(withExpenses.months[5]!.extrasNet).toBe(chf(2769.6));
    expect(withExpenses.totals.social).toBe(s.totals.social);
    expect(withExpenses.totals.expenses).toBe(chf(2400));
    expect(lohnausweisNet(withExpenses, true, false)).toBe(lohnausweisNet(s, true));
    expect(lohnausweisNet(withExpenses, true, true)).toBe(lohnausweisNet(s, true) + chf(2400));
  });

  it('zieht bei Brutto null auch im regulären Monatslohn kein BVG ab', () => {
    const withoutSalary = calculateSalary({ ...example, grossMonthly: 0 });
    expect(withoutSalary.regularNet).toBe(0);
    expect(withoutSalary.months.every((month) => month.net === 0 && month.bvg === 0)).toBe(true);
  });

  it('verwendet nach einem Lohnausfall im Dezember dieselbe BVG-Regel für die Übersicht', () => {
    const stopped = calculateSalary({ ...example, changes: [{ fromMonth: 12, grossMonthly: 0 }], bonuses: [{ month: 12, gross: chf(1000) }] });
    expect(stopped.regularNet).toBe(0);
    expect(stopped.months[11]!.bvg).toBe(0);
    expect(stopped.months[11]!.net - stopped.months[11]!.extrasNet).toBe(stopped.regularNet);
  });
});
