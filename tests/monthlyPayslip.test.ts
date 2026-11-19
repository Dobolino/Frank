import { describe, expect, it } from 'vitest';
import { isMonthlyPayslip, parseMonthlyPayslip } from '../src/domain/monthlyPayslip';

const salary = [
  'Abrechnung per 30.04.2024',
  "101 _Monatslohn CHF 4'250.50",
  "110 13. Monatslohn 212.50",
  "120 Bruttolohn 4'463.00",
  "401 BVG-Beitrag -135.75",
  "610 Nettolohn 3’800.25",
  '701 Privatauto 100.00 km x 0.7000 70.00',
  '702 Parkgebühren 2.00 x 5.5000 11.00',
  '900 Auszahlung 3’881.25 CHF',
];

describe('Monatliche Lohnabrechnung', () => {
  it('liest die gedruckte Abrechnungsperiode und unterscheidet Grundlohn, Nettolohn und Auszahlung', () => {
    expect(parseMonthlyPayslip(salary)).toEqual({
      kind: 'monthly', period: '2024-04', baseGross: 425050, pension: 13575,
      actualExpenses: 8100, net: 380025, payout: 388125,
    });
  });

  it('führt ausdrücklich ausgewiesene Pauschalspesen separat', () => {
    const withAllowance = [...salary.slice(0, -1), '780 Pauschalspesen 60,25', '900 Auszahlung CHF 3\'941.50'];
    expect(parseMonthlyPayslip(withAllowance)).toMatchObject({ flatExpenses: 6025, actualExpenses: 8100 });
  });

  it('lässt Rückerstattungen bei unklarer Abstimmung offen und verwendet nie die Differenz allein', () => {
    const other = [...salary.slice(0, -1), '800 Zusatzleistung 4.00', '900 Auszahlung 3\'885.25'];
    expect(parseMonthlyPayslip(other).actualExpenses).toBeUndefined();
    expect(parseMonthlyPayslip(['Lohnabrechnung April 2024', 'Nettolohn 950.00', 'Auszahlung 990.00'])).toEqual({
      kind: 'monthly', period: '2024-04', net: 95000, payout: 99000,
    });
  });

  it('übernimmt keine Sonderzahlungen, Stundenlöhne, Arbeitgeberbeiträge oder mehrdeutigen Werte als Monatsplan', () => {
    const extras = ['Lohnabrechnung April 2024', '13. Monatslohn 800.00', 'Grundlohn 3 Std x 80.00 240.00',
      'BVG-Beitrag Arbeitgeber 80.00', 'BVG-Beitrag Risiko -70.00', 'BVG-Beitrag Sparen -70.00', 'Pauschalspesen einmalig 90.00', 'Monatslohn 660.00', 'Monatslohn 650.00',
      'Bruttolohn 4000.00', 'Nettolohn 3200.00'];
    expect(parseMonthlyPayslip(extras)).toEqual({ kind: 'monthly', period: '2024-04', net: 320000 });
  });

  it('rät keine Währung oder Periode aus fremden Rechnungen oder Jahresbeträgen', () => {
    expect(isMonthlyPayslip(['Abrechnung per 30.04.2024', 'Rechnungsbetrag 90.00'])).toBe(false);
    expect(isMonthlyPayslip(['Lohnausweis 2024', '8. Bruttolohn 55000.00'])).toBe(false);
    expect(() => parseMonthlyPayslip([...salary, 'Lohnabrechnung Mai 2024'])).toThrow(/Mehrere Abrechnungsmonate/);
    expect(() => parseMonthlyPayslip([...salary, 'Betrag Monat | kumuliert YTD'])).toThrow(/Spalten|Betragsspalten/);
    expect(() => parseMonthlyPayslip(['Lohnabrechnung 04/2024', 'Monatslohn EUR 2400.00'])).toThrow(/CHF/);
  });
});
