import { expect,it } from 'vitest';
import { demoData } from '../src/seed/demo';
import { reconcile } from '../src/sync/reconcile';

it('verbindet neue Buchungen mit Lohnänderungen und behält entfernte Ziele entfernt', () => {
  const base = demoData(), pc = structuredClone(base), phone = structuredClone(base);
  pc.transactions = [{id:'a',date:'2026-01-04',text:'Test',amount:-200}];
  pc.goals = [];
  for (const item of pc.years[2026]!.budget) delete item.goalId;
  phone.transactions = [{id:'b',date:'2026-05-01',text:'Test',amount:-500}];
  phone.years[2026]!.salary.grossMonthly += 5000;
  const result = reconcile(base,pc,phone);
  expect(result.data.transactions?.map(t=>t.id)).toEqual(['a','b']);
  expect(result.data.goals).toEqual([]);
  expect(result.data.years[2026]!.salary).toEqual(phone.years[2026]!.salary);
  expect(result.conflicts).toEqual([]);
});

it('entscheidet verschiedene Änderungen am selben Wert explizit und erhält andere Änderungen', () => {
  const base = demoData(), pc = structuredClone(base), phone = structuredClone(base);
  pc.years[2026]!.salary.grossMonthly = 77;
  phone.years[2026]!.salary.grossMonthly = 88;
  pc.years[2026]!.salary.bvgMonthly = 60;
  const result = reconcile(base,pc,phone,'peer');
  expect(result.conflicts).toEqual(['Jahresplan 2026']);
  expect(result.data.years[2026]!.salary).toMatchObject({grossMonthly:88,bvgMonthly:60});
});
