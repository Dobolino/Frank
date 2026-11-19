import { SCHEMA_VERSION, type AppData } from '../domain/types';
import { findMunicipality, resolveBfsId } from '../params/taxData';
import { validateAppData } from './validation';

export const STORAGE_KEY = 'frank.data.v1';

export type LoadResult =
  | { status: 'empty'; raw: null }
  | { status: 'loaded'; raw: string; data: AppData }
  | { status: 'error'; raw: string | null; message: string };

/** Loading never writes or replaces data, including malformed/newer backups. */
export function loadData(): LoadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { status: 'empty', raw };
    return { status: 'loaded', raw, data: parseAppData(raw) };
  } catch (error) {
    return { status: 'error', raw, message: error instanceof Error ? error.message : 'Gespeicherte Daten konnten nicht gelesen werden.' };
  }
}

export type SaveResult =
  | { status: 'saved'; raw: string }
  | { status: 'conflict' | 'cancelled' }
  | { status: 'error'; message: string };

/** Serialize writes across tabs and compare the exact snapshot being edited. */
export async function saveData(
  data: AppData,
  expectedRaw: string | null,
  options: { stillCurrent?: () => boolean; preservePrevious?: boolean | 'sync' } = {},
): Promise<SaveResult> {
  try {
    if (typeof navigator === 'undefined' || !navigator.locks) {
      return { status: 'error', message: 'Dieser Browser unterstützt kein sicheres Speichern zwischen Tabs. Bitte verwende einen aktuellen Browser; deine Änderungen kannst du exportieren.' };
    }
    return await navigator.locks.request(STORAGE_KEY, () => {
      if (options.stillCurrent && !options.stillCurrent()) return { status: 'cancelled' } as const;
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== expectedRaw) return { status: 'conflict' } as const;
      const raw = JSON.stringify(data);
      if (options.preservePrevious && current !== null) {
        // Preserve the original before an explicitly requested recovery import.
        const suffix = options.preservePrevious === 'sync' ? 'sync' : crypto.randomUUID();
        const key = `frank.recovery.${Date.now()}.${suffix}`;
        localStorage.setItem(key, current);
        if (suffix === 'sync') {
          const old = Object.keys(localStorage).filter(k => k.startsWith('frank.recovery.') && k.endsWith('.sync') && k !== key);
          for (const previous of old) localStorage.removeItem(previous);
        }
      }
      localStorage.setItem(STORAGE_KEY, raw);
      return { status: 'saved', raw } as const;
    });
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Speichern im Browser fehlgeschlagen.' };
  }
}

/** Latest retained original, available from the normal backup page after recovery. */
export function latestRecovery(): string | null {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .filter((key): key is string => key !== null && key.startsWith('frank.recovery.'))
      .sort();
    const key = keys.at(-1);
    return key ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

/** Migrationen: Index = Version, von der aus migriert wird. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: Wohnort als BFS-Gemeindenummer statt fest Aesch BL
  1: (d) => ({ ...d, profile: withBfsId((d.profile ?? {}) as AppData['profile']) }),
};

/** Ergänzt die BFS-Nummer und den offiziellen Gemeindenamen, falls sie fehlen. */
export function withBfsId(profile: AppData['profile']): AppData['profile'] {
  const bfsId = resolveBfsId(profile);
  const m = bfsId === undefined ? undefined : findMunicipality(bfsId);
  return m ? { ...profile, bfsId: m.bfsId, municipality: m.name, canton: m.canton } : profile;
}

/** JSON prüfen und auf das aktuelle Schema migrieren. Wirft einen Fehler mit verständlicher Meldung. */
export function parseAppData(text: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Unerwartetes Dateiformat.');
  let data = raw as Record<string, unknown>;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Ungültige Datenversion.');
  if (version > SCHEMA_VERSION) throw new Error('Die Datei stammt aus einer neueren App-Version.');
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`Keine Migration von Version ${version} vorhanden.`);
    data = migrate(data);
    version += 1;
  }
  validateAppData(data);
  const app = data;
  if (!Number.isSafeInteger(app.activeYear) || !Object.hasOwn(app.years, String(app.activeYear))) {
    app.activeYear = Math.max(...Object.keys(app.years).map(Number));
  }
  return { ...app, schemaVersion: SCHEMA_VERSION };
}

export function downloadJson(data: AppData, filename: string): void {
  downloadRaw(JSON.stringify(data, null, 2), filename);
}

export function downloadRaw(raw: string, filename: string): void {
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
