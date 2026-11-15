import type { AppData } from '../domain/types';
import { demoData } from './demo';

/**
 * Persönliche Startdaten werden optional geladen, falls `personal.local.ts` existiert.
 * Die Datei ist in .gitignore – im öffentlichen Repository gibt es nur die Demo-Daten.
 */
const personal = import.meta.glob<{ personalData: () => AppData }>('./personal.local.ts', { eager: true });

export function initialData(): AppData {
  const mod = Object.values(personal)[0];
  return mod ? mod.personalData() : demoData();
}

export const hasPersonalSeed = (): boolean => Object.keys(personal).length > 0;
