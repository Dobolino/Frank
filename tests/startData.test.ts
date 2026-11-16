import { describe, expect, it } from 'vitest';
import { buildStartData } from '../src/seed/startData';
import { parseAppData } from '../src/storage/storage';
import { buildYearModel } from '../src/domain/yearModel';
import { chf } from '../src/domain/money';

describe('Startdaten aus dem Einstieg', () => {
  const data = buildStartData({ bfsId: 230, grossMonthly: 7000, rent: 1800, healthInsurance: 420, pillar3a: 600, bvg: 250, year: 2026 });

  it('ergibt gültige Daten mit Wohnort und Budget', () => {
    expect(parseAppData(JSON.stringify(data))).toEqual(data);
    expect(data.profile).toMatchObject({ bfsId: 230, canton: 'ZH', municipality: 'Winterthur' });
    const names = data.years['2026']!.budget.map((b) => b.name);
    expect(names).toEqual(['Miete inkl. NK', 'Krankenkasse (KVG)', 'Serafe', 'Steuern', 'Säule 3a']);
  });

  it('rechnet sofort Steuern und Steuerrückstellung', () => {
    const m = buildYearModel(data.years['2026']!, data.accounts, data.profile);
    expect(m.tax.total).toBeGreaterThan(chf(5000));
    expect(m.taxProvisionSuggested).toBeGreaterThan(0);
    expect(m.taxInput.pillar3a).toBe(chf(7200));
  });

  it('lässt die Säule 3a weg, wenn nichts eingezahlt wird', () => {
    const d = buildStartData({ bfsId: 230, grossMonthly: 5000, rent: 1500, healthInsurance: 400, pillar3a: 0, year: 2026 });
    expect(d.years['2026']!.budget.some((b) => b.taxTag === 'pillar3a')).toBe(false);
  });
});
