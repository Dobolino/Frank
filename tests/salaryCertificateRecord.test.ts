import { describe, expect, it } from 'vitest';
import { validSalaryCertificateRecord } from '../src/domain/salaryCertificateRecord';
import { demoData } from '../src/seed/demo';
import { emptyYear } from '../src/seed/builders';
import { parseAppData } from '../src/storage/storage';

describe('Vergleichswerte aus dem Lohnausweis', () => {
  it('speichert nur geprüfte Jahresbeträge und einen optionalen Zeitraum im Backup', () => {
    const data = demoData();
    const plan = data.years[data.activeYear]!;
    const record = { gross: 0, flatExpenses: 125000, period: { from: '2026-05-01', to: '2026-10-31' } };
    plan.salaryCertificate = record;
    expect(parseAppData(JSON.stringify(data)).years[data.activeYear]!.salaryCertificate).toEqual(record);
    expect(emptyYear(data.activeYear + 1, plan).salaryCertificate).toBeUndefined();
  });

  it.each([{}, [], { net: null }, { social: 100.25 }, { flatExpenses: '1000' }, { gross: 0, name: 'Name' },
    { net: 3200, period: { from: '2026-02-30', to: '2026-04-30' } },
    { net: 3200, period: { from: '2026-02-28', to: '2026-01-01' } },
  ])('weist unvollständige und ungültige Datensätze zurück', record => {
    expect(validSalaryCertificateRecord(record)).toBe(false);
  });
});
