import { SCHEMA_VERSION, type AppData } from '../domain/types';

const KEY = 'frank.data.v1';

/** Liest die Daten aus dem LocalStorage; null, wenn nichts oder Ungültiges gespeichert ist. */
export function loadData(): AppData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return parseAppData(raw);
  } catch {
    return null;
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearData(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

/** Migrationen: Index = Version, von der aus migriert wird. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

/** JSON prüfen und auf das aktuelle Schema migrieren. Wirft einen Fehler mit verständlicher Meldung. */
export function parseAppData(text: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('Unerwartetes Dateiformat.');
  let data = raw as Record<string, unknown>;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error('Die Datei stammt aus einer neueren App-Version.');
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`Keine Migration von Version ${version} vorhanden.`);
    data = migrate(data);
    version += 1;
  }
  const required = ['accounts', 'years', 'goals', 'profile'] as const;
  for (const key of required) {
    if (!(key in data)) throw new Error(`Feld «${key}» fehlt in der Datei.`);
  }
  if (!Array.isArray(data.accounts) || !Array.isArray(data.goals) || typeof data.years !== 'object') {
    throw new Error('Die Datei hat eine ungültige Struktur.');
  }
  const years = data.years as Record<string, unknown>;
  for (const [key, y] of Object.entries(years)) {
    const plan = y as Record<string, unknown>;
    if (!plan || typeof plan !== 'object' || !plan.salary || !Array.isArray(plan.budget)) {
      throw new Error(`Jahr ${key} ist unvollständig.`);
    }
  }
  const app = data as unknown as AppData;
  if (typeof app.activeYear !== 'number' || !years[String(app.activeYear)]) {
    app.activeYear = Math.max(...Object.keys(years).map(Number));
  }
  return { ...app, schemaVersion: SCHEMA_VERSION };
}

export function downloadJson(data: AppData, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
