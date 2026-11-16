import { chf } from '../domain/money';
import { SCHEMA_VERSION, type AppData } from '../domain/types';
import { DEFAULT_ACCOUNTS, DEFAULT_TAX_PROFILE, item, salary } from './builders';

/**
 * Fiktive Beispieldaten – werden nur verwendet, wenn keine persönlichen Daten vorhanden sind.
 * Persönliche Startdaten gehören in `personal.local.ts` (wird nicht versioniert).
 */
export function demoData(): AppData {
  const s = { accountId: 'savings' };
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { bfsId: 351, municipality: 'Bern', canton: 'BE', civilStatus: 'single', church: 'none' },
    accounts: DEFAULT_ACCOUNTS,
    activeYear: 2026,
    goals: [
      { id: 'g-trip', name: 'Reise Japan', emoji: '✈️', target: chf(4000), saved: chf(600), dueDate: '2027-09', accountId: 'savings' },
    ],
    years: {
      '2026': {
        year: 2026,
        salary: salary(6000, 220),
        otherIncome: [{ id: 'div', name: 'Dividenden', kind: 'dividend', amount: chf(400) }],
        tax: { ...DEFAULT_TAX_PROFILE, wealth: chf(25000) },
        extrasAllocation: [{ id: 'x1', share: 0.5, accountId: 'savings' }],
        startBalances: { savings: chf(1500) },
        budget: [
          item('fixed', 'Miete inkl. NK', 1500),
          item('fixed', 'Krankenkasse (KVG)', 480, { taxTag: 'insurance' }),
          item('fixed', 'Hausrat/Haftpflicht', 300, { ...s, frequency: { kind: 'yearly', month: 4 } }),
          item('fixed', 'Serafe', 335, { ...s, frequency: { kind: 'yearly', month: 3 } }),
          item('fixed', 'Handy & Internet', 75),
          item('fixed', 'Streaming', 0, {
            children: [
              { id: 's1', name: 'Video-Abo', amount: chf(20) },
              { id: 's2', name: 'Musik-Abo', amount: chf(13) },
            ],
          }),
          item('household', 'Einkauf', 450),
          item('personal', 'Ausgang', 200, s),
          item('personal', 'Kleidung', 80),
          item('mobility', 'ÖV-Abo', 900, { ...s, frequency: { kind: 'yearly', month: 1 } }),
          item('savings', 'Steuern', 0, { ...s, taxTag: 'taxProvision', autoFromTax: true }),
          item('savings', 'Säule 3a', 600, { accountId: 'p3a', taxTag: 'pillar3a' }),
          item('savings', 'ETF-Sparplan', 300, { accountId: 'invest' }),
          item('savings', 'Reise Japan', 200, { ...s, goalId: 'g-trip' }),
        ],
      },
    },
  };
}
