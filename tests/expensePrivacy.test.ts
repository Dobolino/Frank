import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { expensePeriod } from '../src/domain/expensePeriod';
import { ExpenseChart, type ExpenseChartMode } from '../src/features/ExpenseChart';

function chart(mode: ExpenseChartMode, hidden: boolean, period = '2026-11') {
  const summary = expensePeriod(
    [{ id: 'plan', category: 'household', name: 'Haushalt', amount: 40000, frequency: { kind: 'monthly' } }],
    [
      { id: 'out', date: '2026-11-09', amount: -4321, text: 'Einkauf', item: 'Haushalt' },
      { id: 'other', date: '2026-11-16', amount: -1189, text: 'Weitere Ausgaben' },
      { id: 'in', date: '2026-11-01', amount: 87654, text: 'Einnahmen' },
    ], period,
  );
  return renderToStaticMarkup(createElement(ExpenseChart, {
    mode, period, hidden, summary, hasPlan: true, singleAccount: false,
    setMode: () => {}, setPeriod: () => {},
  }));
}

describe('Diskrete Ausgabengrafiken', () => {
  it.each([
    ['budget', /<i style="width:[^"]+"/g, '55.10'],
    ['comparison', /<i style="width:[^"]+"/g, '43.21'],
    ['flow', /<path[^>]+>/g, '78 %'],
    ['calendar', /class="ex-heat-\d"/g, '43.21'],
  ] as const)('behält die Grafik %s und maskiert sichtbare sowie vorgelesene Werte', (mode, geometry, example) => {
    const open = chart(mode, false);
    const discreet = chart(mode, true);
    const shapes = open.match(geometry);
    expect(shapes?.length).toBeGreaterThan(0);
    expect(discreet.match(geometry)).toEqual(shapes);
    expect(open).toContain(example);
    expect(discreet).not.toMatch(/43\.21|11\.89|55\.10|876\.54|344\.90|400\.00|[0-9]+ %/);
    expect(discreet).not.toContain('CHF 400');
  });

  it('behält in der Jahresansicht alle Monatsbalken und Links ohne Summen', () => {
    const year = chart('calendar', true, '2026');
    expect(year.match(/<button type="button"/g)).toHaveLength(12);
    expect(year).toContain('November 2026 öffnen');
    expect(year).toContain('width:100%');
    expect(year).not.toContain('<b>55</b>');
  });
});
