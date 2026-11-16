import type { AppData } from '../domain/types';
import { demoData } from './demo';
import { withBfsId } from '../storage/storage';

/**
 * Persönliche Startdaten werden optional geladen, falls `personal.local.ts` existiert.
 * Die Datei ist in .gitignore – im öffentlichen Repository gibt es nur die Demo-Daten.
 */
const personal = import.meta.glob<{ personalData: () => AppData }>('./personal.local.ts', { eager: true });

export function initialData(): AppData {
  const mod = Object.values(personal)[0];
  if (!mod) return demoData();
  const data = mod.personalData();
  return { ...data, profile: withBfsId(data.profile) };
}

export const hasPersonalSeed = (): boolean => Object.keys(personal).length > 0;
