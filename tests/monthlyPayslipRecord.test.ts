import { describe, expect, it } from 'vitest';
import { demoData } from '../src/seed/demo';
import { emptyYear } from '../src/seed/builders';
import { saveMonthlyPayslip, validMonthlyPayslipRecord } from '../src/domain/monthlyPayslipRecord';
import { buildYearModel } from '../src/domain/yearModel';
import { parseAppData } from '../src/storage/storage';
import { reconcile } from '../src/sync/reconcile';

const first = { baseGross: 560000, pension: 23145, net: 489000, actualExpenses: 12345, payout: 501345 };

describe('Gespeicherte Monatsabrechnungen', () => {
  it('behält effektive Spesen genau im Abrechnungsmonat getrennt vom Lohnplan, Budget und Jahresausweis', () => {
    const data = demoData(), plan = data.years[data.activeYear]!;
    const model = () => buildYearModel(plan, data.accounts, data.profile);
    const expected = model();
    const ym = plan.year + '-03';
    saveMonthlyPayslip(plan, ym, first);
    saveMonthlyPayslip(plan, ym, { ...first, actualExpenses: 9000, payout: 498000 });
    expect(Object.keys(plan.monthlyPayslips!)).toEqual([ym]);
    expect(parseAppData(JSON.stringify(data)).years[data.activeYear]!.monthlyPayslips?.[ym]?.actualExpenses).toBe(9000);
    expect(model().salary).toEqual(expected.salary);
    expect(model().taxInput).toEqual(expected.taxInput);
    expect(model().summary).toEqual(expected.summary);
    expect(plan.salaryCertificate).toBeUndefined();
    expect(emptyYear(plan.year + 1, plan).monthlyPayslips).toBeUndefined();
  });

  it('validiert Abrechnungsmonat, Planjahr und ganze Rappen auch beim Laden eines Backups', () => {
    const data = demoData(), plan = data.years[data.activeYear]!;
    for (const bad of [{}, [], {net: null}, {baseGross: NaN}, {actualExpenses: -100}, {pension: 100.1}, {net: 200, title: 'Text'}]) {
      expect(validMonthlyPayslipRecord(bad)).toBe(false);
    }
    expect(validMonthlyPayslipRecord({net: -50, payout: 0})).toBe(true);
    for (const invalid of [plan.year + '-13', plan.year + '-00', (plan.year - 1) + '-12', 'bad']) {
      expect(() => saveMonthlyPayslip(plan, invalid, first)).toThrow();
      plan.monthlyPayslips = { [invalid]: first };
      expect(() => parseAppData(JSON.stringify(data))).toThrow(/monthlyPayslips/);
    }
  });

  it('gleicht unabhängige Monate ab und erhält bei parallelem Ersatz die gewählte vollständige Abrechnung', () => {
    const base = demoData(), left = structuredClone(base), right = structuredClone(base), year = base.activeYear;
    const ym = year + '-03', nextYm = year + '-04';
    saveMonthlyPayslip(left.years[year]!, ym, first);
    saveMonthlyPayslip(right.years[year]!, nextYm, first);
    expect(Object.keys(reconcile(base, left, right).data.years[year]!.monthlyPayslips!).sort()).toEqual([ym, nextYm]);
    saveMonthlyPayslip(right.years[year]!, ym, {actualExpenses: 200});
    const chosen = reconcile(base, left, right, 'peer');
    expect(chosen.conflicts).toContain('Monatsabrechnung ' + ym);
    expect(chosen.data.years[year]!.monthlyPayslips?.[ym]).toEqual({actualExpenses: 200});
  });
});
