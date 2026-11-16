import { describe, expect, it } from 'vitest';
import { demoData } from '../src/seed/demo';
import { buildYearModel } from '../src/domain/yearModel';
import { analyzePillar3a, pillar3aReminderDue } from '../src/domain/pillar3a';
import { chf } from '../src/domain/money';

const model = (monthly: number) => {
  const d = demoData();
  const plan = structuredClone(d.years['2026']!);
  plan.budget.find((b) => b.taxTag === 'pillar3a')!.amount = chf(monthly);
  return buildYearModel(plan, d.accounts, d.profile);
};

describe('Säule-3a-Rechner', () => {
  it('zeigt Lücke und zusätzliche Ersparnis bis zum Maximum', () => {
    const a = analyzePillar3a(model(300))!;
    expect(a.max).toBe(chf(7258));
    expect(a.planned).toBe(chf(3600));
    expect(a.gap).toBe(chf(3658));
    expect(a.savingPlanned).toBeGreaterThan(0);
    expect(a.savingExtra).toBeGreaterThan(0);
    expect(a.marginalRate).toBeGreaterThan(0.1);
    expect(a.marginalRate).toBeLessThan(0.5);
  });

  it('meldet keine Lücke, wenn das Maximum budgetiert ist', () => {
    const a = analyzePillar3a(model(605))!;
    expect(a.gap).toBe(0);
    expect(a.savingExtra).toBe(0);
  });

  it('erinnert nur im November und Dezember des laufenden Jahres', () => {
    const m = model(300);
    expect(pillar3aReminderDue(m, new Date('2026-10-15'))).toBe(false);
    expect(pillar3aReminderDue(m, new Date('2026-11-15'))).toBe(true);
    expect(pillar3aReminderDue(m, new Date('2027-11-15'))).toBe(false);
  });
});
