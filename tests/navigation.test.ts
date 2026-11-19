import { describe, expect, it } from 'vitest';
import { activeTab, pageFromHash } from '../src/app/navigation';

describe('Navigation', () => {
  it('öffnet bestehende Lesezeichen im zugehörigen Bereich', () => {
    expect(pageFromHash('#budget-ist')).toBe('expenses');
    expect(pageFromHash('#cashflow')).toBe('savings');
    expect(pageFromHash('#goals')).toBe('savings');
    expect(pageFromHash('#compare')).toBe('overview');
  });

  it('ordnet die Unterseiten dem sichtbaren Tab zu', () => {
    expect(activeTab(pageFromHash('#invest'))).toBe('savings');
    for (const hash of ['#salary', '#tax', '#contracts', '#accounts', '#data', '#sync']) {
      expect(activeTab(pageFromHash(hash))).toBe('more');
    }
  });

  it('öffnet bei fehlendem oder unbekanntem Ziel die Übersicht', () => {
    for (const hash of ['', '#unbekannt', '#constructor']) {
      expect(pageFromHash(hash)).toBe('overview');
    }
  });
});
