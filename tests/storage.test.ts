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
