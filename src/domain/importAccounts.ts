import type { ImportAccount } from './types';

const banks: Record<string, string> = { ubs: 'UBS', yuh: 'Yuh', swissquote: 'Swissquote' };
export const bankOptions = Object.entries(banks).map(([value, label]) => ({ value, label }));
export const bankLabel = (id: string) => Object.hasOwn(banks, id) ? banks[id]! : id;
export const accountTypeLabel = (type: ImportAccount['type']) => ({ bank: 'Bankkonto', card: 'Kartenkonto', depot: 'Depot' })[type];
export function sourceLabel(source: string, index: number) {
  const tail = source.replace(/[^\d]/g, '').slice(-4);
  return source ? `Quelle ${index + 1}${tail ? ' · •••• ' + tail : ''}` : 'Konto für diesen Auszug';
}
export function movementType(category = '', text = '') {
  const key = category.trim().toLowerCase();
  if (['kontoüberträge', 'kontoübertrag', 'eigener übertrag', 'umbuchung'].includes(key)) return 'Überträge';
  if (key === 'kreditkartenabrechnungen' || /\bkreditkartenabrechnung\b/i.test(text)) return 'Kartenabrechnungen';
  if (key === 'bargeldbezüge' || /\bbargeldbezug\b/i.test(text)) return 'Bargeldbezüge';
  return undefined;
}
