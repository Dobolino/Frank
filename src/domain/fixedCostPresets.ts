import type { BudgetItem } from './types';

export interface FixedCostPreset {
  name: string;
  baseName: string;
  aliases: readonly string[];
  taxTag?: 'insurance';
}

export const FIXED_COST_PRESETS = {
  parkingRent: {
    name: 'Miete Autoeinstellhalle', baseName: 'Miete inkl. NK',
    aliases: ['Einstellhallenmiete', 'Garagenmiete', 'Miete Einstellhalle', 'Autoeinstellhalle'],
  },
  supplementaryInsurance: {
    name: 'Zusatzversicherung (VVG)', baseName: 'Krankenkasse (KVG)',
    aliases: ['Zusatzversicherung', 'Krankenkassen-Zusatzversicherung'], taxTag: 'insurance',
  },
} as const satisfies Record<string, FixedCostPreset>;

export function hasFixedCost(budget: BudgetItem[], preset: FixedCostPreset): boolean {
  const normalize = (name: string) => name.trim().toLocaleLowerCase('de-CH').replace(/\s+/g, ' ');
  const names = new Set([preset.name, ...preset.aliases].map(normalize));
  return budget.some(item => names.has(normalize(item.name)) ||
    item.children?.some(child => names.has(normalize(child.name))));
}
