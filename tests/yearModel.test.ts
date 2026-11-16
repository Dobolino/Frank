import { describe, expect, it } from 'vitest';
import { buildYearModel } from '../src/domain/yearModel';
import { chf } from '../src/domain/money';
import { demoData } from '../src/seed/demo';
import type { BudgetItem } from '../src/domain/types';

const reserve = (extra: Partial<BudgetItem>): BudgetItem => ({
  id: 'tax', name: 'Steuern', category: 'savings', taxTag: 'taxProvision', amount: 0,
  frequency: { kind: 'monthly' }, ...extra,
});

describe('Steuerrückstellung im Jahresmodell', () => {
  it.each([
    reserve({ amount: chf(6000), frequency: { kind: 'yearly', month: 12 } }),
    reserve({ amount: chf(1500), frequency: { kind: 'quarterly', months: [3, 6, 9, 12] } }),
    reserve({ children: [{ id: 'federal', name: 'Bund', amount: chf(100) }, { id: 'canton', name: 'Kanton', amount: chf(400) }] }),
  ])('berücksichtigt Zahlrhythmus und Unterposten: %j', (taxItem) => {
    const data = demoData();
    const plan = data.years['2026']!;
    plan.budget = [taxItem];
    const model = buildYearModel(plan, data.accounts, data.profile);
    expect(model.taxProvisionBudgeted).toBe(chf(500));
    expect(model.warnings.some((warning) => warning.includes('Steuerrückstellung ist tiefer'))).toBe(true);
  });

  it('warnt auch bei vollständig fehlender Rückstellung', () => {
    const data = demoData();
    const plan = data.years['2026']!;
    plan.budget = [];
    const model = buildYearModel(plan, data.accounts, data.profile);
    expect(model.taxProvisionSuggested).toBeGreaterThan(0);
    expect(model.taxProvisionBudgeted).toBe(0);
    expect(model.warnings.some((warning) => warning.includes('Steuerrückstellung ist tiefer'))).toBe(true);
  });

  it('meldet bei automatisch gedeckter Rückstellung keine Unterdeckung', () => {
    const data = demoData();
    const model = buildYearModel(data.years['2026']!, data.accounts, data.profile);
    expect(model.taxProvisionBudgeted).toBe(model.taxProvisionSuggested);
    expect(model.warnings.some((warning) => warning.includes('Steuerrückstellung ist tiefer'))).toBe(false);
  });
});
