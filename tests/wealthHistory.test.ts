import { describe, expect, it } from 'vitest';
import { upsertSnapshot, wealthTrend } from '../src/domain/wealthHistory';
import { parseAppData } from '../src/storage/storage';
import { demoData } from '../src/seed/demo';

const s = (month: string, accounts: number, depot = 0, pillar3a = 0) => ({ month, accounts, depot, pillar3a });

describe('Vermögen über die Zeit', () => {
  it('ersetzt denselben Monat und sortiert', () => {
    const h = upsertSnapshot([s('2026-03', 100), s('2026-01', 50)], s('2026-03', 120));
    expect(h.map((x) => [x.month, x.accounts])).toEqual([['2026-01', 50], ['2026-03', 120]]);
  });

  it('rechnet Veränderung seit letztem Eintrag und seit Jahresbeginn', () => {
    const t = wealthTrend([s('2025-12', 1000), s('2026-02', 1100, 50), s('2026-05', 1200, 100, 30)]);
    expect(t.change).toBe(1330 - 1150);
    expect(t.changeYear).toBe(1330 - 1000);
  });

  it('übersteht Backup und weist doppelte Monate zurück', () => {
    const data = { ...demoData(), wealthHistory: [s('2026-01', 100), s('2026-02', 200)] };
    expect(parseAppData(JSON.stringify(data))).toEqual(data);
    expect(() => parseAppData(JSON.stringify({ ...data, wealthHistory: [s('2026-01', 1), s('2026-01', 2)] }))).toThrow();
  });
});
