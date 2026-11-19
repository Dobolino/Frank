export const tabs = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'budget', label: 'Budget' },
  { id: 'expenses', label: 'Ausgaben' },
  { id: 'savings', label: 'Sparen' },
  { id: 'more', label: 'Mehr' },
] as const;

export type TabId = (typeof tabs)[number]['id'];
export type PageId = TabId | 'salary' | 'tax' | 'data' | 'accounts' | 'invest' | 'contracts' | 'sync';

const secondaryTabs: Record<Exclude<PageId, TabId>, TabId> = {
  salary: 'more', tax: 'more', data: 'more', accounts: 'more', invest: 'savings', contracts: 'more', sync: 'more',
};

const legacy: Record<string, PageId> = {
  'budget-ist': 'expenses', cashflow: 'savings', goals: 'savings', compare: 'overview',
};

export function pageFromHash(hash: string): PageId {
  const key = hash.replace(/^#/, '');
  if (Object.hasOwn(legacy, key)) return legacy[key]!;
  return tabs.some(tab => tab.id === key) || Object.hasOwn(secondaryTabs, key) ? key as PageId : 'overview';
}

export function activeTab(page: PageId): TabId {
  return Object.hasOwn(secondaryTabs, page) ? secondaryTabs[page as keyof typeof secondaryTabs] : page as TabId;
}
