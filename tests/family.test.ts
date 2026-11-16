import { describe, expect, it } from 'vitest';
import { childDeduction } from '../src/domain/tax/taxEngine';
import { demoData } from '../src/seed/demo';
import { buildYearModel } from '../src/domain/yearModel';
import { parseAppData } from '../src/storage/storage';
import { chf } from '../src/domain/money';

describe('Kinderabzug nach Alter', () => {
  const rules = {
    age: [
      { minAge: 0, maxAge: 6, amount: 7600 },
      { minAge: 7, maxAge: 99, amount: 10800 },
      { minAge: 0, maxAge: 17, amount: 9000 },
    ],
    firstTwo: 0,
    fromThird: 0,
    ownCare: 2000,
  };
  it('nimmt die engste Altersspanne und Eigenbetreuung bis 14', () => {
    expect(childDeduction(rules, 5, 0)).toBe(7600 + 2000);
    expect(childDeduction(rules, 10, 1)).toBe(9000 + 2000);
    expect(childDeduction(rules, 16, 2)).toBe(9000);
  });
  it('fällt auf Abzug nach Anzahl zurück', () => {
    const byCount = { age: [], firstTwo: 5700, fromThird: 6400, ownCare: 0 };
    expect([0, 1, 2].map((i) => childDeduction(byCount, 8, i))).toEqual([5700, 5700, 6400]);
  });
});

describe('Familien im Jahresmodell', () => {
  it('Verheiratete mit Kindern zahlen weniger als Ledige mit gleichem Lohn', () => {
    const d = demoData();
    const plan = d.years['2026']!;
    const single = buildYearModel(plan, d.accounts, d.profile);
    const family = buildYearModel(plan, d.accounts, { ...d.profile, civilStatus: 'married', children: [4, 9] });
    expect(family.taxInput.married).toBe(true);
    expect(family.tax.total).toBeLessThan(single.tax.total - chf(1000));
  });
  it('übersteht Backup mit Familienangaben und weist ungültige Alter zurück', () => {
    const data = { ...demoData(), profile: { ...demoData().profile, civilStatus: 'married' as const, children: [3, 7] } };
    expect(parseAppData(JSON.stringify(data)).profile.children).toEqual([3, 7]);
    expect(() => parseAppData(JSON.stringify({ ...data, profile: { ...data.profile, children: [40] } }))).toThrow();
  });
});
