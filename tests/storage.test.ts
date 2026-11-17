import { describe, expect, it } from 'vitest';
import { parseAppData } from '../src/storage/storage';
import { demoData } from '../src/seed/demo';
import { searchMunicipalities, taxParamsFor } from '../src/params/taxData';
import { summarizePortfolio } from '../src/domain/investEngine';
import type { Investments } from '../src/domain/types';

describe('Migration auf Version 2', () => {
  it('ordnet altes Profil «Aesch BL» der BFS-Nummer zu', () => {
    const v1 = { ...demoData(), schemaVersion: 1, profile: { canton: 'BL', municipality: 'Aesch BL', civilStatus: 'single', church: 'none' } };
    const migrated = parseAppData(JSON.stringify(v1));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.profile).toMatchObject({ bfsId: 2761, canton: 'BL', municipality: 'Aesch (BL)' });
  });
});

describe('Suche nach Postleitzahl', () => {
  it('findet die Gemeinde zur PLZ statt einer gleichnamigen BFS-Nummer', () => {
    const hits = searchMunicipalities('4147');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.bfsId === 2761 && h.zip === 4147)).toBe(true);
    expect(hits.map((h) => h.place)).toContain('Angenstein');
  });
  it('findet Gemeinden über die ersten Ziffern', () => {
    const hits = searchMunicipalities('840');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => String(h.zip).startsWith('840'))).toBe(true);
    expect(hits.some((h) => h.name === 'Winterthur')).toBe(true);
  });
  it('findet Ortschaften, die keine eigene Gemeinde sind', () => {
    expect(searchMunicipalities('Angenstein')[0]).toMatchObject({ bfsId: 2761, place: 'Angenstein' });
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

describe('Backups mit Anlagen', () => {
  const portfolio = (): Investments => ({
    holdings: [
      { id: 'usd', symbol: 'ETF', name: 'Fonds', currency: 'USD', quantity: 2.5, exchange: 'NYSE', costChf: 10000, manualPrice: 90.5,
        quote: { price: 100, changePct: -1.5, asOf: '2026-11-16T12:00:00Z' } },
      { id: 'chf', symbol: 'CH', name: 'Schweizer Titel', currency: 'CHF', quantity: 1, manualPrice: 75.25 },
    ],
    fx: { USD: { rate: 0.8, asOf: '2026-11-16T12:00:00Z' } },
  });

  it('erhält Positionen, manuelle Kurse, Kursdaten und Wechselkurse ohne Änderungen', () => {
    const data = { ...demoData(), investments: portfolio() };
    const parsed = parseAppData(JSON.stringify(data));
    expect(parsed).toEqual(data);
    expect(summarizePortfolio(parsed.investments).totalChf).toBe(27525);
  });

  it('akzeptiert ein leeres Depot und bestehende Backups ohne Anlagen', () => {
    expect(parseAppData(JSON.stringify({ ...demoData(), investments: { holdings: [], fx: {} } })).investments)
      .toEqual({ holdings: [], fx: {} });
    expect(parseAppData(JSON.stringify(demoData())).investments).toBeUndefined();
  });

  it.each([
    ['ungültige Position', (p: Investments) => { (p.holdings as unknown[])[0] = null; }],
    ['ungültige Währung', (p: Investments) => { Object.assign(p.holdings[0]!, { currency: null }); }],
    ['nicht endliche Stückzahl', (p: Investments) => { p.holdings[0]!.quantity = Infinity; }],
    ['doppelte Positions-ID', (p: Investments) => { p.holdings.push({ ...p.holdings[0]! }); }],
    ['unvollständiger Kurs', (p: Investments) => { Object.assign(p.holdings[0]!, { quote: { price: 100 } }); }],
    ['ungültiger manueller Kurs', (p: Investments) => { p.holdings[0]!.manualPrice = NaN; }],
    ['fehlende Wechselkurstabelle', (p: Investments) => { Object.assign(p, { fx: null }); }],
    ['ungültiger Wechselkurs', (p: Investments) => { Object.assign(p.fx.USD!, { rate: '0.8' }); }],
  ])('weist %s vor der Portfolio-Berechnung zurück', (_, change) => {
    const investments = portfolio();
    change(investments);
    expect(() => parseAppData(JSON.stringify({ ...demoData(), investments }))).toThrow(/investments/);
  });
});
