import { describe, expect, it } from 'vitest';
import { parseAppData } from '../src/storage/storage';
import { demoData } from '../src/seed/demo';
import { searchMunicipalities, taxParamsFor } from '../src/params/taxData';

describe('Migration auf Version 2', () => {
  it('ordnet altes Profil «Aesch BL» der BFS-Nummer zu', () => {
    const v1 = { ...demoData(), schemaVersion: 1, profile: { canton: 'BL', municipality: 'Aesch BL', civilStatus: 'single', church: 'none' } };
    const migrated = parseAppData(JSON.stringify(v1));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.profile).toMatchObject({ bfsId: 2761, canton: 'BL', municipality: 'Aesch (BL)' });
  });
});

describe('Gemeindesuche', () => {
  it('findet Gemeinden ohne Akzente und Gross-/Kleinschreibung', () => {
    expect(searchMunicipalities('zurich')[0]?.name).toBe('Zürich');
    expect(searchMunicipalities('geneve').some((m) => m.canton === 'GE')).toBe(true);
  });
});

describe('Jahre ohne publizierte Daten', () => {
  it('rechnet mit dem letzten Jahr und gibt einen Hinweis', () => {
    const lookup = taxParamsFor(2099, 261);
    expect(lookup.exact).toBe(false);
    expect(lookup.params?.year).toBeLessThan(2099);
    expect(lookup.note).toMatch(/noch keine beschlossenen/);
  });
});

describe('Backup-Validierung', () => {
  it('akzeptiert ein vollständiges Backup unverändert', () => {
    const data = structuredClone(demoData());
    expect(parseAppData(JSON.stringify(data))).toEqual(data);
  });

  it('weist leere Jahre zurück, bevor ein Import den Store erreicht', () => {
    expect(() => parseAppData(JSON.stringify({ ...demoData(), years: {} }))).toThrow(/mindestens ein/);
  });

  it.each([
    ['fehlende Lohndaten', (d: ReturnType<typeof demoData>) => { (d.years['2026']!.salary as unknown as Record<string, unknown>).rates = null; }],
    ['ungültige Kategorie', (d: ReturnType<typeof demoData>) => { Object.assign(d.years['2026']!.budget[0]!, { category: 'unknown' }); }],
    ['ungültiger Monat', (d: ReturnType<typeof demoData>) => { Object.assign(d.years['2026']!.salary.thirteenth[0]!, { month: 13 }); }],
    ['nicht endliche Zahl', (d: ReturnType<typeof demoData>) => { d.years['2026']!.salary.grossMonthly = Infinity; }],
    ['gebrochene Rappen', (d: ReturnType<typeof demoData>) => { d.years['2026']!.budget[0]!.amount = 1.5; }],
    ['fehlendes Konto', (d: ReturnType<typeof demoData>) => { d.goals[0]!.accountId = 'missing'; }],
    ['fehlendes Sparziel', (d: ReturnType<typeof demoData>) => { d.years['2026']!.budget[0]!.goalId = 'missing'; }],
    ['doppelte Konten-ID', (d: ReturnType<typeof demoData>) => { d.accounts.push({ ...d.accounts[0]! }); }],
    ['falscher Jahresschlüssel', (d: ReturnType<typeof demoData>) => { d.years['2026']!.year = 2027; }],
    ['ungültiges Zieldatum', (d: ReturnType<typeof demoData>) => { d.goals[0]!.dueDate = '2027-13'; }],
    ['ungültige Konfession', (d: ReturnType<typeof demoData>) => { Object.assign(d.profile, { church: 'unknown' }); }],
    ['unvollständiger Radar', (d: ReturnType<typeof demoData>) => { Object.assign(d, { settings: { radar: {} } }); }],
  ])('weist %s zurück', (_, change) => {
    const data = structuredClone(demoData());
    change(data);
    expect(() => parseAppData(JSON.stringify(data))).toThrow();
  });

  it('behält Migration und Auswahl eines vorhandenen Jahres bei', () => {
    const data = structuredClone(demoData());
    data.activeYear = 2030;
    expect(parseAppData(JSON.stringify(data)).activeYear).toBe(2026);
  });
});
